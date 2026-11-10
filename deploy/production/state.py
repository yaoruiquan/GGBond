"""Persistent state, validation, locking, and Caddyfile rendering."""
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import tempfile
import time
from typing import Any, Dict, Iterator, Optional

COLORS = ("blue", "green")
SCHEMA_VERSION = 1
DIGEST_IMAGE = re.compile(
    r"^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?/)?"
    r"[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*"
    r"@sha256:[a-f0-9]{64}$"
)
DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
PROJECT = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")
BACKUP_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/@+-]{2,199}$")
TOKEN = re.compile(r"^(blue|green)-[a-f0-9]{32}$")


class StateError(Exception):
    """Persistent state cannot be trusted."""


class LockBusy(Exception):
    """Another mutating operation owns the lock."""


def other(color: str) -> str:
    return COLORS[1] if color == COLORS[0] else COLORS[0]


def new_token(color: str) -> str:
    return color + "-" + secrets.token_hex(16)


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(prefix="." + path.name + ".", dir=str(path.parent))
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as output:
            output.write(text)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, path)
        directory = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise


def write_json(path: Path, value: Dict[str, Any]) -> None:
    atomic_write(path, json.dumps(value, indent=2, sort_keys=True) + "\n")


def read_json(path: Path) -> Dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise StateError("cannot read {}: {}".format(path, error)) from error
    if not isinstance(value, dict):
        raise StateError("{} must contain a JSON object".format(path))
    return value


def validate_state(value: Dict[str, Any], project: str, domain: str) -> Dict[str, Any]:
    expected = {"schema_version", "generation", "project", "domain", "active", "images", "route_token", "updated_at"}
    if set(value) != expected or value["schema_version"] != SCHEMA_VERSION:
        raise StateError("state schema mismatch")
    if value["project"] != project or value["domain"] != domain:
        raise StateError("state project/domain differs from command arguments")
    if value["active"] not in COLORS or not isinstance(value["generation"], int) or value["generation"] < 1:
        raise StateError("state active color or generation is invalid")
    images = value["images"]
    if not isinstance(images, dict) or set(images) != set(COLORS):
        raise StateError("state must contain one image slot per color")
    for image in images.values():
        if image is not None and (not isinstance(image, str) or not DIGEST_IMAGE.fullmatch(image)):
            raise StateError("state contains a non-digest image")
    if images[value["active"]] is None:
        raise StateError("active color has no image")
    token = value["route_token"]
    if not isinstance(token, str) or not TOKEN.fullmatch(token) or not token.startswith(value["active"] + "-"):
        raise StateError("route token does not match active color")
    return value


def load_state(path: Path, project: str, domain: str) -> Dict[str, Any]:
    if not path.is_file():
        raise StateError("state.json missing; run bootstrap explicitly (no color is assumed)")
    return validate_state(read_json(path), project, domain)


def render_caddyfile(template: str, domain: str, color: str, token: str, drain_seconds: int = 300) -> str:
    replacements = {"{{SITE_ADDRESS}}": domain, "{{UPSTREAM}}": "app-" + color + ":8080",
                    "{{ROUTE_TOKEN}}": token, "{{DRAIN_SECONDS}}": str(drain_seconds)}
    for marker in replacements:
        if template.count(marker) != 1:
            raise StateError("Caddy template must contain {} exactly once".format(marker))
    for marker, value in replacements.items():
        template = template.replace(marker, value)
    return template


def append_history(path: Path, event: Dict[str, Any]) -> None:
    descriptor = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(descriptor, "a", encoding="utf-8") as output:
        output.write(json.dumps(event, sort_keys=True) + "\n")
        output.flush()
        os.fsync(output.fileno())


@contextmanager
def operation_lock(path: Path) -> Iterator[None]:
    descriptor = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise LockBusy("another deployment or rollback is running") from error
        yield
    finally:
        os.close(descriptor)


def optional_image(value: Optional[str]) -> str:
    """Compose requires both variables; unused slots get an unresolvable reference."""
    return value or "invalid.invalid/unset@sha256:" + "0" * 64
