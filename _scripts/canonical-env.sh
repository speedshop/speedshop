#!/usr/bin/env bash
set -euo pipefail

image="${DEVCONTAINER_IMAGE:-speedshop-devcontainer}"
platform="${DEVCONTAINER_PLATFORM:-linux/amd64}"

declare -a env_names=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      env_names+=("$2")
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -ne 1 ]]; then
  echo "usage: $0 [--env NAME]... 'command'" >&2
  exit 1
fi

command="$1"
temp_home="$(mktemp -d)"

declare -a docker_args=(
  run --rm
  --platform "$platform"
  --user "$(id -u):$(id -g)"
  -e HOME=/tmp/speedshop-home
)

cleanup() {
  rm -rf "$temp_home"
}
trap cleanup EXIT

docker build --platform "$platform" -f .devcontainer/Dockerfile -t "$image" .

if (( ${#env_names[@]} > 0 )); then
  for env_name in "${env_names[@]}"; do
    docker_args+=( -e "$env_name" )
  done
fi

docker_args+=(
  -v "$PWD:/workspaces/speedshop"
  -v "$temp_home:/tmp/speedshop-home"
  -w /workspaces/speedshop
  "$image"
  bash -lc "$command"
)

docker "${docker_args[@]}"
