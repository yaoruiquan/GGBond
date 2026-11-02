#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

python3 - <<'PY'
from pathlib import Path
import re

repo = "yaoruiquan/GGBond"
installer = Path("deploy/install.sh").read_text()
assert f'GITHUB_REPO="{repo}"' in installer, "installer must use fork releases"
assert f"Documentation=https://github.com/{repo}" in installer
assert 'SERVICE_NAME="sub2api"' in installer
assert 'ExecStart=/opt/sub2api/sub2api' in installer
assert 'sub2api_${' in installer, "archive names must remain compatible"
assert 'TimeoutStopSec=90s' in installer, "systemd must allow default HTTP drain and cleanup"
assert 'Environment=SHUTDOWN_TIMEOUT_SECONDS=60' in installer
for unit in (installer, Path("deploy/sub2api.service").read_text()):
    assert 'TimeoutStopSec=90s' in unit
    assert 'Environment=SHUTDOWN_TIMEOUT_SECONDS=60' in unit
    assert 'Documentation=https://github.com/yaoruiquan/GGBond' in unit

docker = Path("deploy/docker-deploy.sh").read_text()
assert f'GITHUB_RAW_URL="https://raw.githubusercontent.com/{repo}/main/deploy"' in docker
assert 'POSTGRES_PASSWORD=$(generate_secret)' in docker
assert 'ADMIN_EMAIL=$(generate_admin_email)' in docker
assert 'chmod 600 .env' in docker
assert 'auto-generated' in docker, "keep backend-generated admin passwords"
assert 'SHUTDOWN_TIMEOUT_SECONDS=60' in Path("deploy/.env.example").read_text()

for name in ("docker-compose.yml", "docker-compose.local.yml", "docker-compose.standalone.yml"):
    text = (Path("deploy") / name).read_text()
    application = text.split("  sub2api:\n", 1)[1]
    application = re.split(r"\n  [a-zA-Z0-9_-]+:\n", application, maxsplit=1)[0]
    assert 'image: ghcr.io/yaoruiquan/ggbond:latest' in application, name
    assert 'stop_grace_period: 90s' in application, name
    assert application.count('SHUTDOWN_TIMEOUT_SECONDS=${SHUTDOWN_TIMEOUT_SECONDS:-60}') == 1, name

print("release deployment sources and shutdown checks passed")
PY
