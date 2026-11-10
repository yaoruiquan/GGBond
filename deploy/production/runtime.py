"""Docker/Caddy boundary: argument arrays only; never parse the secrets file."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from typing import Any, Dict, List, Optional

from state import optional_image


class RuntimeErrorDetail(Exception):
    """An external command or probe did not meet its contract."""


class Runtime:
    def __init__(self, args: Any, directory: Path, images: Dict[str, Any]) -> None:
        self.args = args
        self.directory = directory
        self.environment = {**os.environ,
                            "BLUE_IMAGE": optional_image(images["blue"]),
                            "GREEN_IMAGE": optional_image(images["green"]),
                            "PRODUCTION_STATE_DIR": str(args.state_dir)}
        self.prefix = ["docker", "compose", "--project-name", args.project,
                       "--project-directory", str(directory), "--file", str(directory / "docker-compose.yml"),
                       "--env-file", str(args.env_file)]

    def command(self, command: List[str], timeout: float = 60, deadline: Optional[float] = None) -> str:
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeErrorDetail("readiness deadline expired before " + " ".join(command[:3]))
            timeout = min(timeout, remaining)
        try:
            result = subprocess.run(command, env=self.environment, capture_output=True,
                                    text=True, timeout=timeout, check=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise RuntimeErrorDetail("command failed or timed out: " + " ".join(command[:3])) from error
        if result.returncode != 0:
            # Do not echo stderr: Compose can include interpolated secrets in diagnostics.
            raise RuntimeErrorDetail("command returned {}: {} (output withheld; inspect service logs locally)".format(
                result.returncode, " ".join(command[:3])))
        return result.stdout

    def compose(self, *arguments: str, timeout: float = 60, deadline: Optional[float] = None) -> str:
        return self.command(self.prefix + list(arguments), timeout, deadline)

    def exec(self, service: str, *arguments: str, deadline: Optional[float] = None) -> str:
        return self.compose("exec", "-T", service, *arguments, deadline=deadline)

    def start(self, *services: str) -> None:
        self.compose("up", "-d", "--no-deps", "--pull", "never", "--wait",
                     "--wait-timeout", str(int(self.args.timeout)), *services,
                     timeout=self.args.timeout + 30)

    def prepare_images(self, *services: str) -> None:
        # Resolve/download before starting migrations or changing the live route.
        # App image references are validated immutable digests by the CLI.
        self.compose("pull", *services, timeout=self.args.timeout)

    def assert_revision(self, image: str, sha: str) -> None:
        revision = self.command(["docker", "image", "inspect", "--format",
                                 '{{index .Config.Labels "org.opencontainers.image.revision"}}', image]).strip()
        if revision != sha:
            raise RuntimeErrorDetail("image OCI revision differs from the CI-verified source SHA")

    def assert_shared_storage(self, color: str) -> None:
        identifier = self.compose("ps", "-q", "app-" + color).strip()
        try:
            mounts = json.loads(self.command(["docker", "inspect", "--format", "{{json .Mounts}}", identifier]))
        except ValueError as error:
            raise RuntimeErrorDetail("cannot verify active container storage") from error
        if not isinstance(mounts, list) or not all(isinstance(mount, dict) for mount in mounts):
            raise RuntimeErrorDetail("container mount metadata is invalid")
        for name in ("plugins", "pricing"):
            if not any(m.get("Type") == "volume" and m.get("Name") == self.args.project + "_" + name + "_data"
                       and m.get("Destination") == "/app/data/" + name for m in mounts):
                raise RuntimeErrorDetail("active container lacks shared " + name +
                                         " storage; migrate existing data before deployment (see production README)")

    def backup_database(self, path: Path) -> None:
        """Keep and validate a private pre-migration PostgreSQL custom-format archive."""
        backup = self.prefix + ["exec", "-T", "postgres", "sh", "-c",
                               'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc']
        verify = self.prefix + ["exec", "-T", "postgres", "pg_restore", "--list"]
        try:
            with path.open("xb") as output:
                path.chmod(0o600)
                result = subprocess.run(backup, env=self.environment, stdout=output,
                                        stderr=subprocess.PIPE, timeout=self.args.timeout, check=False)
                output.flush()
                os.fsync(output.fileno())
            if result.returncode != 0 or path.stat().st_size == 0:
                raise RuntimeErrorDetail("pre-migration database backup failed; no candidate started")
            with path.open("rb") as source:
                result = subprocess.run(verify, env=self.environment, stdin=source, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.PIPE, timeout=self.args.timeout, check=False)
            if result.returncode != 0:
                raise RuntimeErrorDetail("pre-migration backup archive validation failed; no candidate started")
        except (OSError, subprocess.TimeoutExpired) as error:
            raise RuntimeErrorDetail("database backup or archive validation failed") from error

    def assert_image(self, color: str) -> None:
        service = "app-" + color
        identifiers = self.compose("ps", "-q", service).strip().splitlines()
        if len(identifiers) != 1:
            raise RuntimeErrorDetail("expected exactly one running " + service)
        image = self.command(["docker", "inspect", "--format", "{{.Config.Image}}", identifiers[0]]).strip()
        if image != self.environment[color.upper() + "_IMAGE"]:
            raise RuntimeErrorDetail("running container image differs from recorded digest for " + color)

    def direct_smoke(self, color: str) -> None:
        for endpoint in ("/health", "/api/v1/settings/public"):
            body = self.exec("app-" + color, "wget", "-q", "-T", "10", "-O", "-", "http://localhost:8080" + endpoint)
            self.check_body(body, endpoint)

    @staticmethod
    def check_body(body: str, endpoint: str) -> None:
        try:
            value = json.loads(body)
        except ValueError as error:
            raise RuntimeErrorDetail("smoke endpoint returned invalid JSON: " + endpoint) from error
        if not isinstance(value, dict):
            raise RuntimeErrorDetail("smoke endpoint returned a non-object: " + endpoint)
        valid = value.get("status") == "ok" if endpoint == "/health" else value.get("code") == 0 and isinstance(value.get("data"), dict)
        if not valid:
            raise RuntimeErrorDetail("smoke endpoint did not meet success contract: " + endpoint)

    def validate(self, filename: str, bootstrap: bool = False) -> None:
        arguments = ["caddy", "validate", "--config", "/etc/caddy/" + filename, "--adapter", "caddyfile"]
        if bootstrap:
            self.compose("run", "--rm", "--no-deps", "--pull", "never", "caddy", *arguments)
        else:
            self.exec("caddy", *arguments)

    def reload(self) -> None:
        self.exec("caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")

    def assert_runtime(self, deadline: Optional[float] = None) -> None:
        try:
            expected = json.loads(self.exec("caddy", "caddy", "adapt", "--config", "/etc/caddy/Caddyfile",
                                            "--adapter", "caddyfile", deadline=deadline))
            actual = json.loads(self.exec("caddy", "wget", "-q", "-T", "10", "-O", "-",
                                          "http://127.0.0.1:2019/config/", deadline=deadline))
        except ValueError as error:
            raise RuntimeErrorDetail("Caddy admin/adapt returned invalid JSON") from error
        if expected != actual:
            raise RuntimeErrorDetail("Caddy runtime differs from disk config; refusing to infer an active color")

    def public_smoke(self, token: str, deadline: Optional[float] = None) -> None:
        for endpoint in ("/health", "/api/v1/settings/public"):
            with tempfile.TemporaryDirectory(prefix="public-probe-", dir=str(self.args.state_dir)) as folder:
                headers = Path(folder) / "headers"
                body = self.command(["curl", "--silent", "--show-error", "--fail", "--noproxy", "*",
                                     "--proto", "=https", "--connect-timeout", "10", "--max-time", "20",
                                     "--dump-header", str(headers), "--header", "Cache-Control: no-cache, no-store",
                                     "https://" + self.args.domain + endpoint + "?deployment_probe=" + token],
                                    deadline=deadline)
                targets = [line.split(":", 1)[1].strip() for line in headers.read_text().splitlines()
                           if line.lower().startswith("x-deployment-target:")]
                if targets != [token]:
                    raise RuntimeErrorDetail("public probe did not reach the expected deployment target")
                self.check_body(body, endpoint)

    def wait_public_ready(self, token: str) -> None:
        """Bootstrap-only: wait for asynchronous ACME issuance within the configured timeout."""
        deadline = time.monotonic() + self.args.timeout
        while True:
            try:
                self.assert_runtime(deadline)
                self.public_smoke(token, deadline)
                return
            except RuntimeErrorDetail as error:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RuntimeErrorDetail("bootstrap public readiness deadline expired") from error
                time.sleep(min(self.args.probe_interval, remaining))

    def observe(self, token: str) -> None:
        self.monitor(token, self.args.observe_seconds)

    def drain(self, token: str, seconds: int) -> None:
        self.monitor(token, seconds)

    def monitor(self, token: str, seconds: float) -> None:
        deadline = time.monotonic() + seconds
        while True:
            self.assert_runtime()
            self.public_smoke(token)
            if time.monotonic() >= deadline:
                return
            time.sleep(min(self.args.probe_interval, max(0, deadline - time.monotonic())))
