#!/usr/bin/env bash
set -euo pipefail

# EXAMPLE — not an installed command. Populate ~/.thinksuit/.env from 1Password.
#
# thinksuit knows nothing about 1Password (or any vendor): the genai service
# simply reads each value by name from the environment, then from
# ~/.thinksuit/.env — credentials and plain settings (GOOGLE_CLOUD_PROJECT,
# ONNX_DTYPE, ...) alike. This script is one way to produce that file — it
# resolves a set of `op://` references with `op inject`. Run it interactively
# (1Password app unlocked, approve once) whenever a key changes, then
# `thinkctl start genai`; the file persists across reboots, so nothing runs
# at login. Copy and adapt it — or swap in a Keychain reader, a hand-edited
# file, whatever suits you.
#
# Edit the references below to match your vault/item, then:  ./env-pull.sh

OUT="${THINKSUIT_ENV_FILE:-$HOME/.thinksuit/.env}"

mkdir -p "$(dirname "$OUT")"
op inject -f -o "$OUT" <<'EOF'
OPENAI_API_KEY=op://services/thinksuit/OPENAI_API_KEY
ANTHROPIC_API_KEY=op://services/thinksuit/ANTHROPIC_API_KEY
# HF_TOKEN=op://services/thinksuit/HF_TOKEN
# GOOGLE_CLOUD_PROJECT=my-project
# GOOGLE_CLOUD_LOCATION=global
EOF
chmod 600 "$OUT"
echo "wrote $OUT (chmod 600)"
