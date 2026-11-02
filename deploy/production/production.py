#!/usr/bin/env python3
"""Optional single-host blue/green orchestration; no database rollback."""
import argparse
import json
import logging
import os
from pathlib import Path
import signal
import sys
from typing import Any, Dict, Optional

# -I excludes the current directory; load only helpers next to this trusted entrypoint.
DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY))
from runtime import Runtime, RuntimeErrorDetail
from state import (BACKUP_REF, COLORS, DIGEST_IMAGE, DOMAIN, PROJECT, SCHEMA_VERSION,
                   LockBusy, StateError, append_history, atomic_write, load_state,
                   new_token, now, operation_lock, other, render_caddyfile, write_json)

LOG = logging.getLogger("production")


def arguments() -> Any:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--domain", required=True)
    parser.add_argument("--project", default="ggbond-production")
    parser.add_argument("--state-dir", type=Path, default=DIRECTORY / "state")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--observe-seconds", type=float, default=10)
    parser.add_argument("--probe-interval", type=float, default=2)
    subcommands = parser.add_subparsers(dest="operation", required=True)
    for operation in ("bootstrap", "deploy", "rollback", "status"):
        command = subcommands.add_parser(operation)
        if operation != "status":
            command.add_argument("--ack-schema-compatible", action="store_true", required=True)
            command.add_argument("--backup-ref", required=True)
            command.add_argument("--ack-dual-instance", action="store_true", required=True)
            command.add_argument("--keep-old", action="store_true")
        if operation in ("bootstrap", "deploy"):
            command.add_argument("--image", required=True)
        if operation == "bootstrap":
            command.add_argument("--color", choices=COLORS, required=True)
            command.add_argument("--ack-bootstrap", action="store_true", required=True)
    args = parser.parse_args()
    validate_arguments(parser, args)
    return args


def validate_arguments(parser: Any, args: Any) -> None:
    if "KEEP_OLD" in os.environ:
        parser.error("KEEP_OLD is unsupported; use --keep-old explicitly")
    if not DOMAIN.fullmatch(args.domain) or not PROJECT.fullmatch(args.project):
        parser.error("invalid domain or project name")
    if not args.env_file.is_absolute() or not args.env_file.is_file():
        parser.error("--env-file must name an existing absolute path; it is passed only to Compose")
    if not args.state_dir.is_absolute() or args.state_dir.is_symlink():
        parser.error("--state-dir must be an absolute, non-symlink path")
    if not 1 <= args.timeout <= 3600 or not 0 <= args.observe_seconds <= 3600 or not 0 < args.probe_interval <= 60:
        parser.error("timeout/observation/probe interval outside permitted range")
    if hasattr(args, "image") and not DIGEST_IMAGE.fullmatch(args.image):
        parser.error("--image must be an immutable repository@sha256:64-lowercase-hex digest (tags rejected)")
    if hasattr(args, "backup_ref") and not BACKUP_REF.fullmatch(args.backup_ref):
        parser.error("invalid --backup-ref (use a non-secret backup identifier)")


def caddy_text(args: Any, state: Dict[str, Any]) -> str:
    return render_caddyfile((DIRECTORY / "Caddyfile.template").read_text(),
                            args.domain, state["active"], state["route_token"])


def next_state(args: Any, old: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    color = args.color if old is None else other(old["active"])
    images = {"blue": None, "green": None} if old is None else dict(old["images"])
    image = images[color] if args.operation == "rollback" else args.image
    if image is None:
        raise StateError("the inactive color has no recorded digest to roll back to")
    return {"schema_version": SCHEMA_VERSION, "generation": 1 if old is None else old["generation"] + 1,
            "project": args.project, "domain": args.domain, "active": color,
            "images": {**images, color: image}, "route_token": new_token(color), "updated_at": now()}


def assert_stable(args: Any, old: Dict[str, Any], runtime: Runtime) -> None:
    live = args.state_dir / "caddy" / "Caddyfile"
    if not live.is_file() or live.read_text() != caddy_text(args, old):
        raise StateError("disk Caddyfile differs from recorded active state; refusing deployment")
    runtime.assert_image(old["active"])
    runtime.assert_runtime()


def recover(args: Any, old: Dict[str, Any], runtime: Runtime, transaction: Path) -> None:
    live = args.state_dir / "caddy" / "Caddyfile"
    atomic_write(live, (transaction / "old.Caddyfile").read_text())
    runtime.reload()
    runtime.assert_image(old["active"])
    runtime.assert_runtime()
    runtime.public_smoke(old["route_token"])
    # Re-write old state even if state commit partially completed before an fsync error.
    write_json(args.state_dir / "state.json", old)


def record_result(args: Any, transaction: Path, outcome: str, detail: str = "") -> None:
    event = {"at": now(), "operation": args.operation, "outcome": outcome,
             "transaction": transaction.name, "detail": detail}
    write_json(transaction / "result.json", event)
    append_history(args.state_dir / "history.jsonl", event)


def execute_transaction(args: Any, old: Optional[Dict[str, Any]]) -> None:
    target = next_state(args, old)
    runtime = Runtime(args, DIRECTORY, target["images"])
    transaction = args.state_dir / "transactions" / target["route_token"]
    transaction.mkdir(parents=True, mode=0o700)
    write_json(transaction / "target-state.json", target)
    if old:
        atomic_write(transaction / "old.Caddyfile", caddy_text(args, old))
        write_json(transaction / "old-state.json", old)
    pending = {"operation": args.operation, "transaction": transaction.name, "backup_ref": args.backup_ref,
               "phase": "preparing", "at": now()}
    write_json(args.state_dir / "pending.json", pending)
    switched = False
    committed = False
    try:
        candidate = args.state_dir / "caddy" / "candidate.Caddyfile"
        atomic_write(candidate, caddy_text(args, target))
        if old is None:
            runtime.start("postgres", "redis")
        runtime.start("app-" + target["active"])
        runtime.assert_image(target["active"])
        runtime.direct_smoke(target["active"])
        runtime.validate("candidate.Caddyfile", bootstrap=old is None)
        write_json(args.state_dir / "pending.json", {**pending, "phase": "switching"})
        switched = True  # reload can fail after changing runtime; always restore on uncertainty.
        atomic_write(args.state_dir / "caddy" / "Caddyfile", candidate.read_text())
        if old is None:
            runtime.start("caddy")
            runtime.wait_public_ready(target["route_token"])
        else:
            runtime.reload()
        runtime.observe(target["route_token"])
        write_json(args.state_dir / "state.json", target)
        committed = True
        record_result(args, transaction, "committed")
        (args.state_dir / "pending.json").unlink()
    except BaseException as error:
        if committed:
            # Never restore after a known state commit: keep pending evidence for reconciliation.
            raise StateError("deployment committed but final journal update failed; manual reconciliation required") from error
        handle_failure(args, old, runtime, transaction, switched, error)
        raise
    cleanup_old(args, old, runtime, transaction)
    LOG.info("committed active=%s image=%s; %s", target["active"], target["images"][target["active"]],
             "old color retained (--keep-old)" if args.keep_old else "old color stopped after commit")


def handle_failure(args: Any, old: Optional[Dict[str, Any]], runtime: Runtime,
                   transaction: Path, switched: bool, error: BaseException) -> None:
    if switched and old is not None:
        try:
            recover(args, old, runtime, transaction)
        except BaseException as recovery_error:
            record_result(args, transaction, "RECOVERY_REQUIRED", str(recovery_error))
            raise StateError("cutover failed; old config restore could not be fully verified; pending.json retained, both colors untouched") from error
    elif old is None:
        record_result(args, transaction, "BOOTSTRAP_INCOMPLETE", str(error))
        raise StateError("bootstrap incomplete; pending.json retained; inspect before manual recovery (no active state assumed)") from error
    record_result(args, transaction, "rolled_back" if switched else "preflight_failed", str(error))
    (args.state_dir / "pending.json").unlink()
    # Preserve the candidate and logs for investigation. No DB or cache restore is attempted.


def cleanup_old(args: Any, old: Optional[Dict[str, Any]], runtime: Runtime, transaction: Path) -> None:
    if old is None or args.keep_old:
        return
    try:
        runtime.compose("stop", "app-" + old["active"], timeout=120)
    except RuntimeErrorDetail as error:
        record_result(args, transaction, "cleanup_pending", str(error))
        raise StateError("new target COMMITTED; cleanup of old color failed (no rollback); inspect retained old container") from error


def run(args: Any) -> None:
    args.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    (args.state_dir / "caddy").mkdir(mode=0o700, exist_ok=True)
    with operation_lock(args.state_dir / "operation.lock"):
        if (args.state_dir / "pending.json").exists():
            raise StateError("pending.json exists: unfinished transaction/recovery required; refusing all new operations")
        state_path = args.state_dir / "state.json"
        old = None
        if args.operation == "bootstrap":
            if state_path.exists() or (args.state_dir / "caddy" / "Caddyfile").exists():
                raise StateError("bootstrap requires an empty state/config; never overwrite an existing deployment")
            runtime = Runtime(args, DIRECTORY, {"blue": None, "green": None})
            for service in ("app-blue", "app-green", "caddy", "postgres", "redis"):
                if runtime.compose("ps", "-a", "-q", service).strip():
                    raise StateError("bootstrap refuses existing project containers; migrate/adopt explicitly outside this tool")
        else:
            old = load_state(state_path, args.project, args.domain)
            assert_stable(args, old, Runtime(args, DIRECTORY, old["images"]))
        if args.operation == "status":
            print(json.dumps(old, indent=2, sort_keys=True))
            return
        execute_transaction(args, old)


def interrupted(signum: int, frame: Any) -> None:
    raise KeyboardInterrupt("interrupted by signal {}".format(signum))


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    signal.signal(signal.SIGTERM, interrupted)
    try:
        run(arguments())
        return 0
    except (StateError, LockBusy, RuntimeErrorDetail, OSError, KeyboardInterrupt) as error:
        LOG.error("%s", error)
        return 1


if __name__ == "__main__":
    sys.exit(main())
