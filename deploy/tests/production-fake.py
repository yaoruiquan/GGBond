#!/usr/bin/env python3
"""Strict fake only; unknown commands fail rather than invoking Docker."""
import json
import os
import re
import sys
from pathlib import Path

root = Path(os.environ["FAKE_ROOT"])
args = sys.argv[1:]
kind = Path(sys.argv[0]).name
with (root / "calls.jsonl").open("a") as output:
    output.write(json.dumps([kind] + args) + "\n")
model = json.loads((root / "model.json").read_text())
mode = os.environ.get("FAIL_MODE", "")


def save():
    (root / "model.json").write_text(json.dumps(model))


def fail(message="injected failure"):
    print(message, file=sys.stderr)
    sys.exit(1)


def adapted(path):
    text = Path(path).read_text()
    color = re.search(r"reverse_proxy app-(blue|green):8080", text).group(1)
    marker = re.search(r'X-Deployment-Target "([^"\n]+)"', text).group(1)
    return {"apps": {"http": {"servers": {"s": {"routes": [{"handle": [{"handler": "reverse_proxy", "upstreams": [{"dial": "app-" + color + ":8080"}]}]}]}}}}, "marker": marker}


def body(url):
    return {"status": "ok"} if "/health" in url else {"code": 0, "data": {"site_name": "test"}}


if kind == "curl":
    if mode in ("public-transient", "public-once-green"):
        attempts = model.get("public_attempts", 0) + 1
        model = {**model, "public_attempts": attempts}
        save()
        if (mode == "public-transient" and attempts <= 3 or
                mode == "public-once-green" and attempts == 1 and
                model["runtime"]["marker"].startswith("green-")):
            fail("TLS certificate not ready")
    if mode in ("public", "restore"):
        fail()
    marker = model["runtime"]["marker"]
    if mode == "wrong-public":
        marker = "wrong"
    Path(args[args.index("--dump-header") + 1]).write_text("HTTP/2 200\r\nX-Deployment-Target: " + marker + "\r\n\r\n")
    print(json.dumps(body(args[-1])))
    sys.exit(0)
if kind != "docker" or not args:
    fail("unknown executable")
if args[:2] == ["image", "inspect"]:
    print("b" * 40 if mode == "revision" else "a" * 40)
    sys.exit(0)
if args[0] == "inspect":
    service = args[-1]
    if service not in model["containers"]:
        fail("no container")
    if "{{json .Mounts}}" in args:
        print(json.dumps([] if mode == "legacy-storage" else [
            {"Type": "volume", "Name": "ggbond-production_" + name + "_data",
             "Destination": "/app/data/" + name} for name in ("plugins", "pricing")]))
    else:
        print(model["containers"][service])
    sys.exit(0)
if args[0] != "compose":
    fail("unknown docker command")
i = 1
while i < len(args) and args[i].startswith("-"):
    if args[i] not in ("--project-name", "--file", "--env-file", "--project-directory"):
        fail("unknown compose flag")
    i += 2
op, rest = args[i], args[i + 1:]
if op == "pull":
    if mode == "pull":
        fail("registry unavailable")
elif op == "ps":
    if rest[-1] in model["containers"]:
        print(rest[-1])
elif op == "up":
    if mode == "startup" and rest[-1].startswith("app-"):
        fail("migration failed")
    for service in [x for x in rest if x in ("app-blue", "app-green", "postgres", "redis", "caddy")]:
        model["containers"][service] = os.environ.get(service.replace("app-", "").upper() + "_IMAGE", "infra")
        if service == "caddy":
            model["runtime"] = adapted(root / "state" / "caddy" / "Caddyfile")
    save()
elif op == "stop":
    if mode in ("stop", "validate-stop"):
        fail()
    model["containers"].pop(rest[-1], None)
    save()
elif op in ("exec", "run"):
    if "pg_dump" in " ".join(rest):
        if mode == "backup":
            fail("backup failed")
        print("fake custom archive")
    elif "pg_restore" in rest:
        if mode == "backup-verify":
            fail("invalid archive")
        print("fake archive listing")
    elif "validate" in rest:
        if mode in ("validate", "validate-stop"):
            fail()
    elif "adapt" in rest:
        print(json.dumps(adapted(root / "state" / "caddy" / rest[rest.index("--config") + 1].rsplit("/", 1)[-1])))
    elif "reload" in rest:
        model["reloads"] = model.get("reloads", 0) + 1
        model["runtime"] = adapted(root / "state" / "caddy" / rest[rest.index("--config") + 1].rsplit("/", 1)[-1])
        save()
        if mode == "reload-once" and model["reloads"] == 1:
            fail("reload error after applying")
        if mode == "restore" and model["reloads"] >= 2:
            fail("restore failed")
    elif "wget" in rest:
        if ":2019/config/" in rest[-1]:
            print(json.dumps({"drift": True} if mode == "drift" else model.get("runtime")))
        else:
            if mode == "smoke":
                fail()
            print(json.dumps(body(rest[-1])))
    else:
        fail("unknown container invocation " + str(rest))
else:
    fail("unknown compose command " + op)
