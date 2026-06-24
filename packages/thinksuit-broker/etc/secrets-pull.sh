#!/usr/bin/env bash
set -euo pipefail

# EXAMPLE — not an installed command. Populate ~/.thinksuit/secrets.env from 1Password.
#
# thinksuit knows nothing about 1Password (or any vendor): at startup it simply
# reads each secret by name from the environment, then from ~/.thinksuit/secrets.env.
# This script is one way to produce that file — it resolves a set of `op://`
# references with `op inject`. Run it interactively (1Password app unlocked,
# approve once) whenever a key changes; the file persists across reboots, so
# nothing runs at login. Copy and adapt it — or swap in a Keychain reader, a
# hand-edited file, whatever suits you.
#
# Edit the references below to match your vault/item, then:  ./secrets-pull.sh

OUT="${THINKSUIT_SECRETS_FILE:-$HOME/.thinksuit/secrets.env}"

mkdir -p "$(dirname "$OUT")"
op inject -f -o "$OUT" <<'EOF'
OPENAI_API_KEY=op://services/thinksuit/OPENAI_API_KEY
ANTHROPIC_API_KEY=op://services/thinksuit/ANTHROPIC_API_KEY
# HF_TOKEN=op://services/thinksuit/HF_TOKEN
EOF
chmod 600 "$OUT"
echo "wrote $OUT (chmod 600)"
