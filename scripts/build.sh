#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deveco_root="${DEVECO_STUDIO_HOME:-$HOME/Applications/DevEco-Studio.app}"
if [[ ! -x "$deveco_root/Contents/tools/hvigor/bin/hvigorw" ]]; then
  printf 'Set DEVECO_STUDIO_HOME to your DevEco-Studio.app directory.\n' >&2
  exit 1
fi
build_tasks=(assembleHap)
if [[ "${1:-}" == "--clean" && $# == 1 ]]; then
  build_tasks=(clean assembleHap)
elif [[ $# != 0 ]]; then
  printf 'Usage: bash scripts/build.sh [--clean]\n' >&2
  exit 2
fi
export NODE_HOME="$deveco_root/Contents/tools/node"
export JAVA_HOME="$deveco_root/Contents/jbr"
export DEVECO_SDK_HOME="$deveco_root/Contents/sdk"
export PATH="$NODE_HOME/bin:$PATH"
cd "$project_root"
exec "$deveco_root/Contents/tools/hvigor/bin/hvigorw" --mode module \
  -p module=entry@default -p product=default -p buildMode=debug \
  "${build_tasks[@]}" --no-daemon
