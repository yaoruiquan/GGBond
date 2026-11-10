#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_VERSION:?}" "${RELEASE_SHA:?}" "${GITHUB_REPOSITORY:?}" "${RUNNER_TEMP:?}" "${GITHUB_OUTPUT:?}"
repository=$(printf '%s' "$GITHUB_REPOSITORY" | tr '[:upper:]' '[:lower:]')
image_name=${repository##*/}
registries=("ghcr.io/${repository}")
if [[ ${SIMPLE_RELEASE:-false} != true && ${DOCKERHUB_USERNAME:-skip} != skip ]]; then
  registries+=("${DOCKERHUB_USERNAME}/${image_name}")
fi
arches=(amd64 arm64)
if [[ ${SIMPLE_RELEASE:-false} == true ]]; then arches=(amd64); fi
ghcr_digest=
amd64_digest=
arm64_digest=
read_digest() {
  python3 - "$1" <<'PY'
import json
import re
import sys
from pathlib import Path

digest = json.loads(Path(sys.argv[1]).read_text()).get("containerimage.digest", "")
if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
    raise SystemExit("Buildx metadata did not contain a valid image digest")
print(digest)
PY
}
for arch in "${arches[@]}"; do
  metadata="$RUNNER_TEMP/build-$arch-metadata.json"
  args=(--platform "linux/$arch" --file ".release-context/$arch/Dockerfile"
    --metadata-file "$metadata"
    --label "org.opencontainers.image.version=$RELEASE_VERSION"
    --label "org.opencontainers.image.revision=$RELEASE_SHA"
    --label "org.opencontainers.image.source=https://github.com/$GITHUB_REPOSITORY")
  for registry in "${registries[@]}"; do
    args+=(--tag "$registry:$RELEASE_VERSION-$arch")
    if [[ ${SIMPLE_RELEASE:-false} == true ]]; then
      args+=(--tag "$registry:$RELEASE_VERSION" --tag "$registry:latest")
    fi
  done
  if [[ ${DRY_RUN:-false} == true ]]; then
    args+=(--output "type=oci,dest=$RUNNER_TEMP/sub2api-$arch.oci.tar")
  else
    args+=(--push)
  fi
  docker buildx build "${args[@]}" ".release-context/$arch"
  digest=$(read_digest "$metadata")
  if [[ $arch == amd64 ]]; then amd64_digest=$digest; else arm64_digest=$digest; fi
  if [[ $arch == amd64 && ${SIMPLE_RELEASE:-false} == true && ${DRY_RUN:-false} != true ]]; then
    ghcr_digest=$amd64_digest
  fi
done
if [[ ${DRY_RUN:-false} != true && ${SIMPLE_RELEASE:-false} != true ]]; then
  major=${RELEASE_VERSION%%.*}
  minor=${RELEASE_VERSION#*.}; minor=${minor%%.*}
  for registry in "${registries[@]}"; do
    docker buildx imagetools create \
      --tag "$registry:$RELEASE_VERSION" --tag "$registry:latest" \
      --tag "$registry:$major.$minor" --tag "$registry:$major" \
      "$registry:$RELEASE_VERSION-amd64" "$registry:$RELEASE_VERSION-arm64"
    if [[ $registry == "ghcr.io/$repository" ]]; then
      ghcr_digest=$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$registry:$RELEASE_VERSION")
      [[ $ghcr_digest =~ ^sha256:[a-f0-9]{64}$ ]] || {
        echo "imagetools inspect did not return a valid manifest digest" >&2
        exit 1
      }
    fi
  done
fi

published=false
image_ref=
if [[ ${DRY_RUN:-false} != true ]]; then
  published=true
  image_ref="ghcr.io/$repository@$ghcr_digest"
fi
python3 - "$RUNNER_TEMP/release-image.json" "$repository" "$ghcr_digest" "$image_ref" "$published" "${DRY_RUN:-false}" "$amd64_digest" "$arm64_digest" <<'PY'
import json
import sys
from pathlib import Path

path, repository, digest, image_ref, published, dry_run, amd64, arm64 = sys.argv[1:]
data = {
    "ghcr_repository": "ghcr.io/" + repository,
    "ghcr_digest": digest or None,
    "ghcr_image_ref": image_ref or None,
    "image_published": published == "true",
    "dry_run": dry_run == "true",
    "build_digests": {arch: value for arch, value in (("amd64", amd64), ("arm64", arm64)) if value},
}
Path(path).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
import os

with open(os.environ["GITHUB_OUTPUT"], "a") as output:
    for key, value in (("ghcr_repository", data["ghcr_repository"]), ("ghcr_digest", digest),
                       ("ghcr_image_ref", image_ref), ("image_published", published)):
        output.write(f"{key}={value}\n")
PY
