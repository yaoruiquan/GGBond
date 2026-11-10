#!/usr/bin/env python3
"""Transfer reviewed deployment tooling and deploy one CI-verified image over SSH."""
import argparse
import io
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tarfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from state import DIGEST_IMAGE, DOMAIN, PROJECT

FILES = ("production.sh", "production.py", "runtime.py", "state.py",
         "docker-compose.yml", "Caddyfile.template", "README.md")

# Arguments are JSON data, never interpolated into shell commands. Only the
# allowlisted, size-limited deployment files are written; no repository checkout
# or private environment file is overwritten.
REMOTE = r'''
import io, json, os, pathlib, subprocess, sys, tarfile, tempfile
settings = json.loads(sys.argv[1])
root = pathlib.Path(settings["root"])
env = root / "shared" / "production.env"
state = root / "shared" / "state"
if not env.is_file() or not (state / "state.json").is_file():
    sys.exit("Existing production.env and state.json required; bootstrap/migration is an explicit separate operation")
releases = root / "releases"
releases.mkdir(mode=0o700, parents=True, exist_ok=True)
release = pathlib.Path(tempfile.mkdtemp(prefix=settings["sha"] + "-", dir=releases))
payload = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
if len(payload) > 2 * 1024 * 1024:
    sys.exit("Deployment payload too large")
with tarfile.open(fileobj=io.BytesIO(payload)) as archive:
    entries = archive.getmembers()
    if len(entries) != len(settings["files"]) or {m.name for m in entries} != set(settings["files"]):
        sys.exit("Unexpected deployment archive contents")
    for member in entries:
        if not member.isfile() or member.size > 512 * 1024:
            sys.exit("Invalid deployment archive entry")
        with (release / member.name).open("xb") as output:
            os.chmod(output.name, 0o600)
            output.write(archive.extractfile(member).read())
common = ["bash", str(release / "production.sh"), "--env-file", str(env),
          "--state-dir", str(state), "--domain", settings["domain"], "--project", settings["project"]]
subprocess.run(common + ["status"], check=True)
subprocess.run(common + ["deploy", "--image", settings["image"], "--source-sha", settings["sha"],
                        "--ack-schema-compatible", "--ack-dual-instance", "--backup-ref", "predeploy-" + settings["sha"][:12]], check=True)
subprocess.run(common + ["status"], check=True)
'''


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("host", "user", "root", "domain", "image", "sha", "schema-compatible-sha"):
        parser.add_argument("--" + flag, required=True)
    parser.add_argument("--project", default="ggbond-production")
    parser.add_argument("--port", type=int, default=22)
    parser.add_argument("--key-file", type=Path, required=True)
    parser.add_argument("--known-hosts", type=Path, required=True)
    parser.add_argument("--ack-dual-instance", action="store_true", required=True)
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.:-]*", args.host) or not re.fullmatch(r"[a-z_][a-z0-9_-]*", args.user):
        parser.error("invalid SSH host/user")
    if not re.fullmatch(r"/[a-zA-Z0-9_./-]+", args.root) or ".." in Path(args.root).parts or args.root == "/":
        parser.error("--root must be an explicit absolute deployment directory")
    if not DOMAIN.fullmatch(args.domain) or not PROJECT.fullmatch(args.project) or not DIGEST_IMAGE.fullmatch(args.image):
        parser.error("invalid production domain/project or non-digest image")
    if not re.fullmatch(r"[a-f0-9]{40}", args.sha) or args.schema_compatible_sha != args.sha:
        parser.error("schema compatibility approval must match the exact CI-verified commit SHA")
    if not 1 <= args.port <= 65535 or not args.key_file.is_file() or not args.known_hosts.is_file():
        parser.error("valid SSH port, key file and pinned known_hosts file required")
    return args


def payload(directory):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w") as archive:
        for filename in FILES:
            archive.add(directory / filename, arcname=filename, recursive=False)
    return data.getvalue()


def ssh_command(args):
    settings = {key: getattr(args, key) for key in ("root", "domain", "project", "image", "sha")}
    settings["files"] = FILES
    remote = shlex.join(["python3", "-c", REMOTE, json.dumps(settings)])
    return ["ssh", "-T", "-p", str(args.port), "-i", str(args.key_file),
            "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "UserKnownHostsFile=" + str(args.known_hosts), "-o", "ConnectTimeout=15",
            "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
            args.user + "@" + args.host, remote]


def main():
    args = arguments()
    result = subprocess.run(ssh_command(args), input=payload(Path(__file__).resolve().parent), check=False)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
