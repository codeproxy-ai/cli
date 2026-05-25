#!/usr/bin/env sh
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
npx @codeproxy/cli --config "$DIR/codeproxy.config.json"
