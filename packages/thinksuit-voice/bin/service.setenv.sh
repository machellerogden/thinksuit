#!/usr/bin/env bash

# Bridge provider credentials from the current shell into the launchd user
# domain, then restart the voice service so it inherits them.
#
# The voice service is currently keyless: wake detection, STT, and TTS all run
# locally. This is effectively a no-op until a cloud provider is selected, at
# which point add its env var to KEYS. Keys ride on environment variables (no
# secret at rest); run from a shell that already has them exported.

KEYS=()

for k in "${KEYS[@]}"; do
    if [ -n "${!k}" ]; then
        launchctl setenv "$k" "${!k}"
        echo "setenv $k (set)"
    else
        echo "skip   $k (not in environment)"
    fi
done

# Restart so the running service picks up the refreshed environment.
launchctl kickstart -k gui/$UID/thinksuit-voice.service
