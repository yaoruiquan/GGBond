#!/usr/bin/env python3
"""Deployment transaction tests. Docker and curl are always local fake executables."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

DEPLOY = Path(__file__).resolve().parents[1]
ENTRY = DEPLOY / "production" / "production.sh"
A, B, C = ("registry.example/app@sha256:" + char * 64 for char in "abc")


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "bin").mkdir()
        for name in ("docker", "curl"):
            path = self.root / "bin" / name
            shutil.copyfile(DEPLOY / "tests" / "production-fake.py", path)
            path.chmod(0o755)
        (self.root / "model.json").write_text(json.dumps({"containers": {}}))
        (self.root / "runtime.env").write_text("NOT_SHELL=$(touch SHOULD_NOT_EXIST)\n")
        self.env = {**os.environ, "PATH": str(self.root / "bin") + os.pathsep + os.environ["PATH"], "FAKE_ROOT": str(self.root)}
        self.env.pop("KEEP_OLD", None)
        self.common = ["--env-file", str(self.root / "runtime.env"), "--domain", "api.example.com", "--state-dir", str(self.root / "state"), "--timeout", "1", "--observe-seconds", "0", "--probe-interval", "0.01"]
        self.gates = ["--ack-schema-compatible", "--backup-ref", "offline-test-backup", "--ack-dual-instance"]

    def tearDown(self):
        self.temp.cleanup()

    def run_cli(self, *args, mode="", success=True, gates=True, env=None):
        result = subprocess.run(["bash", str(ENTRY), *self.common, *args, *(self.gates if gates else [])], env={**self.env, "FAIL_MODE": mode, **(env or {})}, capture_output=True, text=True, cwd="/", timeout=20)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def bootstrap(self):
        self.run_cli("bootstrap", "--color", "blue", "--image", A, "--ack-bootstrap")

    def state(self):
        return json.loads((self.root / "state" / "state.json").read_text())

    def model(self):
        return json.loads((self.root / "model.json").read_text())

    def calls(self):
        path = self.root / "calls.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def test_bidirectional_and_per_color_digest(self):
        self.bootstrap()
        self.run_cli("deploy", "--image", B, "--keep-old")
        self.assertEqual(self.state()["active"], "green")
        self.assertEqual(self.model()["containers"]["app-blue"], A)
        self.assertTrue(self.model()["runtime"]["marker"].startswith("green-"))
        self.run_cli("rollback", "--keep-old")
        self.assertEqual(self.state()["active"], "blue")
        self.assertEqual(self.state()["images"], {"blue": A, "green": B})
        self.run_cli("deploy", "--image", C)
        self.assertNotIn("app-blue", self.model()["containers"])
        self.assertFalse((self.root / "SHOULD_NOT_EXIST").exists())

    def test_preflight_failures_keep_old_runtime(self):
        self.bootstrap()
        for mode in ("startup", "smoke", "validate"):
            with self.subTest(mode=mode):
                old = self.model()["runtime"]
                self.run_cli("deploy", "--image", B, mode=mode, success=False)
                self.assertEqual(self.model()["runtime"], old)
                self.assertEqual(self.state()["active"], "blue")

    def test_reload_error_after_applying_is_reverted(self):
        self.bootstrap()
        self.run_cli("deploy", "--image", B, mode="reload-once", success=False)
        self.assertEqual(self.state()["active"], "blue")
        self.assertTrue(self.model()["runtime"]["marker"].startswith("blue-"))
        self.assertFalse((self.root / "state" / "pending.json").exists())

    def test_public_verification_failure_restores_old_and_fences_if_unverifiable(self):
        self.bootstrap()
        for mode in ("public", "wrong-public", "restore"):
            self.run_cli("deploy", "--image", B, mode=mode, success=False)
            self.assertEqual(self.state()["active"], "blue")
            self.assertTrue(self.model()["runtime"]["marker"].startswith("blue-"))
            self.assertTrue((self.root / "state" / "pending.json").exists())
            self.run_cli("deploy", "--image", C, success=False)
            (self.root / "state" / "pending.json").unlink()

    def test_missing_state_drift_and_lock_fail_closed(self):
        self.run_cli("deploy", "--image", B, success=False)
        self.bootstrap()
        self.run_cli("deploy", "--image", B, mode="drift", success=False)
        with (self.root / "state" / "operation.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.run_cli("rollback", success=False)
        self.assertEqual(self.state()["active"], "blue")

    def test_gate_tag_and_legacy_keep_old_rejected_without_docker(self):
        self.run_cli("bootstrap", "--color", "blue", "--image", A, "--ack-bootstrap", gates=False, success=False)
        self.run_cli("bootstrap", "--color", "blue", "--image", "app:latest", "--ack-bootstrap", success=False)
        self.run_cli("bootstrap", "--color", "blue", "--image", A, "--ack-bootstrap", env={"KEEP_OLD": "1"}, success=False)
        self.assertEqual(self.calls(), [])

    def test_stop_failure_is_committed_cleanup_pending(self):
        self.bootstrap()
        result = self.run_cli("deploy", "--image", B, mode="stop", success=False)
        self.assertEqual(self.state()["active"], "green")
        self.assertIn("cleanup", result.stderr.lower())
        self.assertIn("app-blue", self.model()["containers"])

    def test_bootstrap_rejects_existing_project_containers(self):
        (self.root / "model.json").write_text(json.dumps({"containers": {"app-green": B}}))
        self.run_cli("bootstrap", "--color", "blue", "--image", A, "--ack-bootstrap", success=False)
        self.assertFalse(any("up" in call for call in self.calls()))

    def test_invalid_state_and_disk_config_are_never_inferred(self):
        self.bootstrap()
        path = self.root / "state" / "state.json"
        stable = path.read_text()
        for malformed in ("not json", "[]", json.dumps({"active": "blue"})):
            path.write_text(malformed)
            self.run_cli("deploy", "--image", B, success=False)
        path.write_text(stable)
        (self.root / "state" / "caddy" / "Caddyfile").write_text("unexpected config")
        self.run_cli("rollback", success=False)
        self.assertEqual(self.state()["active"], "blue")

    def test_no_pull_unscoped_up_or_early_reload(self):
        self.bootstrap()
        self.run_cli("deploy", "--image", B)
        for call in self.calls():
            self.assertNotIn("pull", call)
            self.assertNotIn("down", call)
            if "up" in call:
                self.assertIn("--pull", call)
                self.assertIn("never", call)
                self.assertIn("--no-deps", call)
        calls = self.calls()
        first_reload = next(i for i, call in enumerate(calls) if "reload" in call)
        self.assertTrue(any("app-green" in call and "http://localhost:8080/api/v1/settings/public" in call for call in calls[:first_reload]))


if __name__ == "__main__":
    unittest.main()
