#!/usr/bin/env python3
"""Offline SSH transport tests. Never connect to a server or execute real Docker."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shlex
import subprocess
import sys
import tarfile
import tempfile
import unittest

DIRECTORY = Path(__file__).resolve().parents[1] / "production"
spec = importlib.util.spec_from_file_location("ssh_deploy", DIRECTORY / "ssh-deploy.py")
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


class SSHDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for name in ("key", "known_hosts"):
            (self.root / name).touch()
        self.flags = ["--host", "server.example.com", "--user", "deploy", "--root", str(self.root),
                      "--domain", "api.example.com", "--image", "registry.example/app@sha256:" + "a" * 64,
                      "--sha", "a" * 40, "--schema-compatible-sha", "a" * 40,
                      "--key-file", str(self.root / "key"), "--known-hosts", str(self.root / "known_hosts"),
                      "--ack-dual-instance"]

    def tearDown(self):
        self.temp.cleanup()

    def settings(self):
        args = transport.arguments(self.flags)
        return {**{key: getattr(args, key) for key in ("root", "domain", "project", "image", "sha")},
                "files": list(transport.FILES)}

    def remote_environment(self):
        shared = self.root / "shared"
        (shared / "state").mkdir(parents=True)
        (shared / "state" / "state.json").write_text("{}")
        (shared / "production.env").write_text("PRIVATE=must-stay-on-server\n")

    def fake_payload(self, name=None):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w") as archive:
            for filename in transport.FILES:
                # Stub only the executable boundary, recording its argv. The real
                # transaction behavior is tested by production-blue-green-test.py.
                body = b"placeholder"
                if filename == "production.sh":
                    body = b'#!/bin/sh\nprintf "%s\\n" "$@" >> "' + str(self.root / "calls").encode() + b'"\n'
                entry = tarfile.TarInfo(name if name and filename == "production.py" else filename)
                entry.size = len(body)
                archive.addfile(entry, io.BytesIO(body))
        return output.getvalue()

    def run_remote(self, data, settings=None):
        return subprocess.run([sys.executable, "-c", transport.REMOTE, json.dumps(settings or self.settings())],
                              input=data, capture_output=True, timeout=10)

    def test_pinned_host_key_and_json_arguments(self):
        command = transport.ssh_command(transport.arguments(self.flags))
        self.assertIn("StrictHostKeyChecking=yes", command)
        self.assertIn("BatchMode=yes", command)
        self.assertIn("IdentitiesOnly=yes", command)
        remote = shlex.split(command[-1])
        self.assertEqual(remote[:2], ["python3", "-c"])
        self.assertEqual(json.loads(remote[3])["sha"], "a" * 40)

    def test_only_allowlisted_tooling_is_transferred(self):
        with tarfile.open(fileobj=io.BytesIO(transport.payload(DIRECTORY))) as archive:
            self.assertEqual(set(archive.getnames()), set(transport.FILES))
            self.assertTrue(all(member.isfile() for member in archive.getmembers()))

    def test_invalid_target_or_approval_rejected_before_ssh(self):
        for flag, value in (("--host", "-oProxyCommand=bad"), ("--root", "/opt/../etc"),
                            ("--schema-compatible-sha", "b" * 40), ("--image", "app:latest")):
            with self.subTest(flag=flag), self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
                flags = self.flags.copy()
                flags[flags.index(flag) + 1] = value
                transport.arguments(flags)

    def test_remote_refuses_implicit_bootstrap(self):
        result = self.run_remote(self.fake_payload())
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "releases").exists())

    def test_remote_preserves_private_environment_and_deploys_digest(self):
        self.remote_environment()
        result = self.run_remote(self.fake_payload())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "shared" / "production.env").read_text(), "PRIVATE=must-stay-on-server\n")
        calls = (self.root / "calls").read_text().splitlines()
        self.assertEqual(calls.count("status"), 2)
        self.assertEqual(calls.count("deploy"), 1)
        self.assertIn("registry.example/app@sha256:" + "a" * 64, calls)
        self.assertIn("--source-sha", calls)
        self.assertIn("--ack-schema-compatible", calls)

    def test_archive_traversal_rejected(self):
        self.remote_environment()
        result = self.run_remote(self.fake_payload("../../production.py"))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "calls").exists())


if __name__ == "__main__":
    unittest.main()
