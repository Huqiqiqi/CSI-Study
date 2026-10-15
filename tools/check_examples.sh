#!/usr/bin/env bash
# Offline validation only; no access to a real camera or a streaming server.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
for file in "$root"/examples/*.sh "$root"/tools/check_examples.sh; do
    bash -n "$file"
done
tmp=$(mktemp -d)
trap 'rm -f -- "$tmp/env.sh"; rmdir -- "$tmp"' EXIT
sed 's|CAM=/dev/videoREPLACE_ME|CAM=/dev/video62|' "$root/examples/env.example.sh" > "$tmp/env.sh"
for mode in capture record segments publish dual; do
    CAM_ENV="$tmp/env.sh" bash "$root/examples/01_camera.sh" "$mode" --dry-run
done
if CAM_ENV="$root/examples/env.example.sh" bash "$root/examples/01_camera.sh" capture --dry-run; then
    echo 'ERROR: placeholder should have been rejected' >&2
    exit 1
fi
python3 "$root/examples/pipeline.py" --help >/dev/null
if python3 "$root/examples/pipeline.py" --device /dev/not-a-camera; then
    echo 'ERROR: invalid device should have been rejected' >&2
    exit 1
fi
printf 'Offline script checks passed. Hardware behavior was not tested.\n'
