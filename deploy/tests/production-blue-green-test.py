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
        self.common = ["--env-file", str(self.root / "runtime.env"), "--domain", "api.example.com", "--state-dir", str(self.root / "state"), "--timeout", "1", "--observe-seconds", "0", "--probe-interval", "0.01", "--drain-seconds", "0"]
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

    def test_bootstrap_retries_initial_https_failures(self):
        self.run_cli("bootstrap", "--color", "blue", "--image", A,
                     "--ack-bootstrap", mode="public-transient")
        self.assertEqual(self.state()["active"], "blue")
        self.assertGreaterEqual(self.model()["public_attempts"], 5)
        calls = self.calls()
        first_curl = next(i for i, call in enumerate(calls) if call[0] == "curl")
        last_curl = max(i for i, call in enumerate(calls) if call[0] == "curl")
        self.assertGreaterEqual(sum("adapt" in call for call in calls[first_curl:last_curl]), 3)
        self.assertFalse((self.root / "state" / "pending.json").exists())

    def test_bootstrap_https_deadline_retains_pending_and_containers(self):
        result = self.run_cli("bootstrap", "--color", "blue", "--image", A,
                              "--ack-bootstrap", mode="public", success=False)
        self.assertIn("bootstrap incomplete", result.stderr)
        self.assertFalse((self.root / "state" / "state.json").exists())
        pending = json.loads((self.root / "state" / "pending.json").read_text())
        transaction = self.root / "state" / "transactions" / pending["transaction"]
        self.assertEqual(json.loads((transaction / "result.json").read_text())["outcome"],
                         "BOOTSTRAP_INCOMPLETE")
        self.assertTrue((transaction / "target-state.json").is_file())
        self.assertEqual(set(self.model()["containers"]),
                         {"app-blue", "caddy", "postgres", "redis"})
        self.assertGreater(sum(call[0] == "curl" for call in self.calls()), 1)
        self.assertFalse(any(op in call for call in self.calls()
                             for op in ("stop", "down", "rm")))

    def test_deploy_transient_https_failure_restores_without_retry(self):
        self.bootstrap()
        self.run_cli("deploy", "--image", B, mode="public-once-green", success=False)
        self.assertEqual(self.state()["active"], "blue")
        self.assertTrue(self.model()["runtime"]["marker"].startswith("blue-"))
        self.assertEqual(self.model()["public_attempts"], 3)
        self.assertEqual(self.model()["reloads"], 2)
        self.assertFalse((self.root / "state" / "pending.json").exists())
        calls = self.calls()
        first_reload = next(i for i, call in enumerate(calls) if "reload" in call)
        restore = next(i for i in range(first_reload + 1, len(calls))
                       if "reload" in calls[i])
        self.assertEqual(sum(call[0] == "curl" for call in calls[first_reload:restore]), 1)

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
                self.assertNotIn("app-green", self.model()["containers"])

    def test_failed_candidate_stop_retains_pending(self):
        self.bootstrap()
        self.run_cli("deploy", "--image", B, mode="validate-stop", success=False)
        self.assertEqual(self.state()["active"], "blue")
        self.assertTrue((self.root / "state" / "pending.json").exists())
        self.assertIn("app-green", self.model()["containers"])
        self.run_cli("deploy", "--image", C, success=False)

    def test_reload_error_after_applying_is_reverted(self):
        self.bootstrap()
        self.run_cli("deploy", "--image", B, mode="reload-once", success=False)
        self.assertEqual(self.state()["active"], "blue")
        self.assertTrue(self.model()["runtime"]["marker"].startswith("blue-"))
        self.assertNotIn("app-green", self.model()["containers"])
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

    def test_prepare_images_before_start_and_never_pull_during_cutover(self):
        self.bootstrap()
        self.run_cli("deploy", "--image", B)
        for call in self.calls():
            self.assertNotIn("down", call)
            if "up" in call:
                self.assertIn("--pull", call)
                self.assertIn("never", call)
                self.assertIn("--no-deps", call)
        calls = self.calls()
        first_start = next(i for i, call in enumerate(calls) if "up" in call)
        self.assertTrue(any("pull" in call and "app-blue" in call and "caddy" in call
                            and "postgres" in call and "redis" in call for call in calls[:first_start]))
        first_reload = next(i for i, call in enumerate(calls) if "reload" in call)
        self.assertTrue(any("app-green" in call and "http://localhost:8080/api/v1/settings/public" in call for call in calls[:first_reload]))

    def test_pull_failure_keeps_old_route_and_does_not_start_candidate(self):
        self.bootstrap()
        previous_calls = len(self.calls())
        self.run_cli("deploy", "--image", B, mode="pull", success=False)
        self.assertEqual(self.state()["active"], "blue")
        self.assertFalse(any("up" in call or "reload" in call for call in self.calls()[previous_calls:]))
        self.assertNotIn("app-green", self.model()["containers"])

    def test_storage_and_backup_failure_refuse_candidate_start(self):
        self.bootstrap()
        for mode in ("legacy-storage", "backup", "backup-verify"):
            previous_calls = len(self.calls())
            self.run_cli("deploy", "--image", B, mode=mode, success=False)
            self.assertEqual(self.state()["active"], "blue")
            self.assertFalse(any("up" in call or "reload" in call for call in self.calls()[previous_calls:]))
            self.assertFalse((self.root / "state" / "pending.json").exists())

    def test_image_revision_must_match_approved_source_before_migrations(self):
        self.bootstrap()
        start = len(self.calls())
        self.run_cli("deploy", "--image", B, "--source-sha", "a" * 40, mode="revision", success=False)
        self.assertFalse(any("up" in call for call in self.calls()[start:]))
        self.run_cli("deploy", "--image", B, "--source-sha", "a" * 40)

    def test_database_archive_verified_before_candidate_migrations(self):
        self.bootstrap()
        start = len(self.calls())
        self.run_cli("deploy", "--image", B)
        calls = self.calls()[start:]
        dump = next(i for i, call in enumerate(calls) if any("pg_dump" in arg for arg in call))
        verify = next(i for i, call in enumerate(calls) if "pg_restore" in call)
        up = next(i for i, call in enumerate(calls) if "up" in call)
        self.assertLess(dump, verify)
        self.assertLess(verify, up)
        archive = self.root / "state" / "transactions" / self.state()["route_token"] / "database.dump"
        self.assertGreater(archive.stat().st_size, 0)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)

    def test_old_config_snapshot_allows_new_drain_budget_and_exact_recovery(self):
        self.bootstrap()
        live = self.root / "state" / "caddy" / "Caddyfile"
        original = live.read_text()
        self.common[-1] = "1"
        self.run_cli("deploy", "--image", B, mode="reload-once", success=False)
        self.assertEqual(live.read_text(), original)
        self.common[-1] = "0"
        self.run_cli("deploy", "--image", B)
        self.assertEqual(self.state()["active"], "green")

    def test_reducing_delay_still_waits_for_unloaded_config(self):
        self.common[-1] = "1"
        self.bootstrap()
        self.common[-1] = "0"
        result = self.run_cli("deploy", "--image", B)
        self.assertIn("retaining old color for 1s", result.stderr)

    def test_legacy_config_can_upgrade_without_allowing_unrelated_drift(self):
        self.bootstrap()
        transaction = self.root / "state" / "transactions" / self.state()["route_token"]
        (transaction / "target.Caddyfile").unlink()
        live = self.root / "state" / "caddy" / "Caddyfile"
        live.write_text(live.read_text().replace("\t\tstream_close_delay 0s\n", ""))
        self.run_cli("deploy", "--image", B)
        self.assertIn("stream_close_delay 0s", live.read_text())

    def test_shared_plugin_and_pricing_storage_with_private_runtime(self):
        compose = (DEPLOY / "production" / "docker-compose.yml").read_text()
        self.assertEqual(compose.count("plugins_data:/app/data/plugins"), 2)
        self.assertEqual(compose.count("pricing_data:/app/data/pricing"), 2)
        self.assertIn("/app/data/plugins/runtime", compose)
        self.assertIn("PLUGINS_DATA_DIR: /app/data/plugins", compose)
        self.assertIn("PRICING_DATA_DIR: /app/data/pricing", compose)


    def test_compose_sets_valid_database_pool_limits(self):
        compose = (DEPLOY / "production" / "docker-compose.yml").read_text()
        self.assertIn("DATABASE_MAX_OPEN_CONNS: ${DATABASE_MAX_OPEN_CONNS:-50}", compose)
        self.assertIn("DATABASE_MAX_IDLE_CONNS: ${DATABASE_MAX_IDLE_CONNS:-10}", compose)

if __name__ == "__main__":
    unittest.main()
