#!/usr/bin/env python3
"""Local Docker integration check for production Caddy routing and shared volumes."""
import json
import http.client
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "deploy" / "production" / "Caddyfile.template"
STATE = ROOT / "deploy" / "production" / "state.py"
DELAY_SECONDS = 4
POLL_SECONDS = 20
PHASE = "setup"

FIXTURE = r'''import socketserver
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler

COLOR = sys.argv[1]

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == "/business-unavailable":
            body = b"no eligible account"
            self.send_response(503)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/ws":
            key = self.headers.get("Sec-WebSocket-Key", "")
            import base64, hashlib
            accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
            self.send_response(101, "Switching Protocols")
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            self.send_header("Sec-WebSocket-Accept", accept)
            self.end_headers()
            self.wfile.flush()
            index = 0
            while True:
                payload = (COLOR + "-" + str(index)).encode()
                try:
                    self.wfile.write(bytes([0x81, len(payload)]) + payload)
                    self.wfile.flush()
                except OSError:
                    return
                index += 1
                time.sleep(0.2)
            return
        if self.path == "/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            index = 0
            while True:
                try:
                    self.wfile.write(("data: " + COLOR + "-" + str(index) + "\n\n").encode())
                    self.wfile.flush()
                except OSError:
                    return
                index += 1
                time.sleep(0.2)
            return
        if self.path == "/storage":
            from pathlib import Path
            plugin = Path("/app/data/plugins/shared.txt").read_text().strip()
            pricing = Path("/app/data/pricing/shared.txt").read_text().strip()
            runtime = Path("/app/data/plugins/runtime/instance.txt").read_text().strip()
            body = (COLOR + "|" + plugin + "|" + pricing + "|" + runtime).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        body = COLOR.encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

Server(("0.0.0.0", 8080), Handler).serve_forever()
'''


def run(command, *, check=True, capture=True, timeout=30):
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None, timeout=timeout)
    if check and result.returncode:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError("command failed ({}): {}\n{}".format(result.returncode, " ".join(command), detail))
    return result


def load_renderer():
    sys.path.insert(0, str(STATE.parent))
    from state import render_caddyfile
    return render_caddyfile


def reverse_proxy_block(rendered):
    start = rendered.index("\treverse_proxy ")
    opening = rendered.index("{", start)
    depth = 0
    for index in range(opening, len(rendered)):
        if rendered[index] == "{":
            depth += 1
        elif rendered[index] == "}":
            depth -= 1
            if depth == 0:
                return rendered[start:index + 1]
    raise RuntimeError("production Caddy template has an unclosed reverse_proxy block")


def make_config(color, token):
    rendered = load_renderer()(TEMPLATE.read_text(), "api.example.com", color, token, DELAY_SECONDS)
    proxy = reverse_proxy_block(rendered)
    return ":8080 {\n\theader X-Deployment-Target \"" + token + "\"\n" + proxy + "\n}\n"


def request(port, path="/"):
    with urllib.request.urlopen("http://127.0.0.1:{}{}".format(port, path), timeout=3) as response:
        return response.read().decode()


def request_with_status(port, path):
    try:
        with urllib.request.urlopen("http://127.0.0.1:{}{}".format(port, path), timeout=3) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


def wait_for_port(port):
    deadline = time.monotonic() + POLL_SECONDS
    last_error = None
    while time.monotonic() < deadline:
        try:
            return request(port)
        except (OSError, urllib.error.URLError) as error:
            last_error = error
            time.sleep(0.2)
    raise RuntimeError("Caddy did not become ready: {}".format(last_error))


def reserve_dynamic_binding():
    # Docker selects the actual port from the ephemeral range when given an empty host port.
    return "127.0.0.1::8080"


def published_port(container):
    result = run(["docker", "port", container, "8080/tcp"])
    binding = result.stdout.strip().splitlines()[0]
    host, port = binding.rsplit(":", 1)
    if host not in ("127.0.0.1", "0.0.0.0", "::"):
        raise RuntimeError("unexpected Docker published address: " + host)
    return int(port)


def read_line(sock):
    data = bytearray()
    while not data.endswith(b"\r\n"):
        chunk = sock.recv(1)
        if not chunk:
            raise RuntimeError("stream closed while waiting for a line")
        data.extend(chunk)
    return bytes(data)


def read_sse_event(response):
    while True:
        lines = []
        while True:
            line = response.readline()
            if not line:
                raise RuntimeError("SSE stream closed while waiting for an event")
            if line in (b"\n", b"\r\n"):
                break
            lines.append(line)
        event = b"".join(lines).decode().strip()
        if event:
            return event


def open_websocket(port):
    import base64
    key = base64.b64encode(os.urandom(16))
    sock = socket.create_connection(("127.0.0.1", port), timeout=4)
    sock.settimeout(4)
    sock.sendall(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: " + key + b"\r\n\r\n")
    status = read_line(sock)
    while read_line(sock) != b"\r\n":
        pass
    if b" 101 " not in status:
        raise RuntimeError("WebSocket fixture did not upgrade: " + repr(status))
    return sock


def read_websocket_text(sock):
    def recv_exact(length):
        payload = bytearray()
        while len(payload) < length:
            chunk = sock.recv(length - len(payload))
            if not chunk:
                raise RuntimeError("WebSocket stream closed while waiting for a frame")
            payload.extend(chunk)
        return bytes(payload)

    first = recv_exact(2)
    length = first[1] & 0x7f
    if length == 126:
        second = recv_exact(2)
        length = int.from_bytes(second, "big")
    elif length == 127:
        second = recv_exact(8)
        length = int.from_bytes(second, "big")
    return recv_exact(length).decode()


def main():
    global PHASE
    if run(["docker", "info"], check=False).returncode:
        raise RuntimeError("Docker daemon is unavailable")
    suffix = uuid.uuid4().hex[:12]
    prefix = "ggbond-caddy-it-" + suffix
    network, caddy = prefix + "-net", prefix + "-caddy"
    containers = [caddy, prefix + "-blue", prefix + "-green"]
    volumes = [prefix + "-plugins", prefix + "-pricing"]
    resources_started = False
    try:
        with tempfile.TemporaryDirectory(prefix=prefix + "-") as temp_name:
            temp = Path(temp_name)
            (temp / "server.py").write_text(FIXTURE)
            (temp / "caddy").mkdir()
            (temp / "caddy" / "Caddyfile").write_text(make_config("blue", "blue-integration-token"))
            run(["docker", "network", "create", network])
            resources_started = True
            for volume in volumes:
                run(["docker", "volume", "create", volume])
            for color in ("blue", "green"):
                name = prefix + "-" + color
                run(["docker", "run", "-d", "--name", name, "--network", network,
                     "--network-alias", "app-" + color,
                     "-v", "{}:/app/data/plugins".format(volumes[0]),
                     "-v", "{}:/app/data/pricing".format(volumes[1]),
                     "--tmpfs", "/app/data/plugins/runtime:uid=1000,gid=1000,mode=0700",
                     "-v", "{}:/test:ro".format(temp), "python:3.12-slim",
                     "python", "/test/server.py", color])
            # Seed shared files through blue and prove green sees them, while runtime stays private.
            for container, command in (
                    (containers[1], "mkdir -p /app/data/plugins/runtime && printf plugin-shared > /app/data/plugins/shared.txt && printf pricing-shared > /app/data/pricing/shared.txt && printf blue-private > /app/data/plugins/runtime/instance.txt"),
                    (containers[2], "mkdir -p /app/data/plugins/runtime && printf green-private > /app/data/plugins/runtime/instance.txt")):
                run(["docker", "exec", container, "sh", "-c", command])
            for color, container in (("blue", containers[1]), ("green", containers[2])):
                storage = run(["docker", "exec", container, "python", "-c",
                               "from urllib.request import urlopen; print(urlopen('http://localhost:8080/storage').read().decode())"]).stdout.strip()
                expected_runtime = color + "-private"
                if storage != color + "|plugin-shared|pricing-shared|" + expected_runtime:
                    raise RuntimeError("shared volume or private tmpfs check failed: " + storage)
            run(["docker", "run", "-d", "--name", caddy, "--network", network,
                 "-p", reserve_dynamic_binding(), "-v", "{}:/etc/caddy:ro".format(temp / "caddy"),
                 "caddy:2.10.2-alpine"])
            PHASE = "initial Caddy route"
            port = published_port(caddy)
            try:
                initial = wait_for_port(port)
            except Exception:
                logs = run(["docker", "logs", caddy], check=False).stderr
                raise RuntimeError("{}; Caddy logs: {}".format(sys.exc_info()[1], logs))
            if initial != "blue":
                raise RuntimeError("initial Caddy route did not reach blue")

            PHASE = "application-level 503 does not evict the upstream"
            for _ in range(3):
                status, body = request_with_status(port, "/business-unavailable")
                if status != 503 or body != "no eligible account":
                    raise RuntimeError("business failure did not pass through as 503")
            if request(port) != "blue":
                raise RuntimeError("application-level 503 incorrectly evicted the healthy upstream")

            PHASE = "opening existing SSE/WebSocket streams"
            sse_connection = http.client.HTTPConnection("127.0.0.1", port, timeout=4)
            sse_connection.request("GET", "/events", headers={"Accept": "text/event-stream", "Connection": "keep-alive"})
            sse_response = sse_connection.getresponse()
            if sse_response.status != 200 or sse_response.getheader("Content-Type") != "text/event-stream":
                raise RuntimeError("SSE fixture did not return a 200 event stream")
            ws = open_websocket(port)
            first_sse = read_sse_event(sse_response)
            first_ws = read_websocket_text(ws)
            if "blue-" not in first_sse or not first_ws.startswith("blue-"):
                raise RuntimeError("streams were not established against blue")

            PHASE = "Caddy reload and stream drain"
            (temp / "caddy" / "Caddyfile").write_text(make_config("green", "green-integration-token"))
            run(["docker", "exec", caddy, "caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"])
            time.sleep(1)
            if request(port) != "green":
                raise RuntimeError("new requests after reload did not route to green")
            # Consume queued messages, then require fresh data produced after
            # reload. Looking only at the next frame confuses buffering with loss.
            deadline = time.monotonic() + 2
            sse_index = ws_index = 0
            while sse_index < 5 or ws_index < 5:
                if time.monotonic() > deadline:
                    raise RuntimeError("no fresh stream data after reload")
                if sse_index < 5:
                    event = read_sse_event(sse_response)
                    if not event.startswith("data: blue-"):
                        raise RuntimeError("existing SSE did not stay on blue: " + event)
                    sse_index = int(event.removeprefix("data: blue-"))
                if ws_index < 5:
                    frame = read_websocket_text(ws)
                    if not frame.startswith("blue-"):
                        raise RuntimeError("existing WebSocket did not stay on blue: " + frame)
                    ws_index = int(frame.removeprefix("blue-"))
            sse_response.close()
            sse_connection.close()
            ws.close()
            print("PASS: rendered production reverse_proxy block adapts; reload routes new requests blue->green; existing SSE/WebSocket continue; shared plugin/pricing volumes and private runtime tmpfs verified")
            print("Scope: HTTP reverse_proxy integration only; TLS/ACME and full production stack are not exercised.")
    finally:
        if resources_started:
            for container in containers:
                run(["docker", "rm", "-f", container], check=False)
            run(["docker", "network", "rm", network], check=False)
            for volume in volumes:
                run(["docker", "volume", "rm", "-f", volume], check=False)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("FAIL during {}: {}".format(PHASE, error), file=sys.stderr)
        sys.exit(1)
