#!/bin/sh
# Proves the supply chain gates of CI can fail: each scanner is given something it must refuse. Needs Docker and npm.
# Everything is generated in a temporary directory, so no leaked key and no vulnerable dependency is ever committed.
set -eu
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
chmod 755 "$dir"

printf 'token = "ghp_%s"\n' "$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 36)" >"$dir/leak.txt"
printf '{"name":"canary","version":"1.0.0","dependencies":{"lodash":"4.17.15"}}\n' >"$dir/package.json"
printf '{"name":"canary","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"canary","version":"1.0.0","dependencies":{"lodash":"4.17.15"}},"node_modules/lodash":{"version":"4.17.15"}}}\n' >"$dir/package-lock.json"

# expect <exit code> <word the report must name> <command...>: any other outcome, a broken scanner included, fails.
expect() {
  code=$1 word=$2
  shift 2
  status=0
  report=$("$@" 2>&1) || status=$?
  if [ "$status" -ne "$code" ] || ! printf '%s' "$report" | grep -q -- "$word"; then
    printf '%s\n' "$report"
    echo "FAIL: expected exit $code naming '$word', got $status: $1 $2 $3" >&2
    exit 1
  fi
  echo "ok: the gate refused it (exit $status, $word)"
}

expect 3 leak.txt docker run --rm -v "$dir:/src:ro" ghcr.io/gitleaks/gitleaks:v8.30.1 dir /src --redact --verbose --no-color --exit-code 3
expect 1 lodash docker run --rm -v "$dir:/src:ro" ghcr.io/google/osv-scanner:v2.7.1 scan source --lockfile=/src/package-lock.json
expect 1 lodash npm audit --omit=dev --package-lock-only --prefix "$dir"
