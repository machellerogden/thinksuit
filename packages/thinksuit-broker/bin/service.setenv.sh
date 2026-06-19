#!/usr/bin/env bash

# Bridge provider credentials from the current shell environment into the
# launchd user domain, then restart the broker so it inherits them.
#
# Keys ride on environment variables (no secret at rest). This script must be
# run from a context that already has them exported — e.g. your shell, or as
# part of service.init.sh. Add `thinksuit-broker-service-setenv` to your shell
# profile to refresh the broker's env on each login.

KEYS=(ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_LOCATION HF_TOKEN)

for k in "${KEYS[@]}"; do
    if [ -n "${!k}" ]; then
        launchctl setenv "$k" "${!k}"
        echo "setenv $k (set)"
    else
        echo "skip   $k (not in environment)"
    fi
done

# Restart so the running broker picks up the refreshed environment.
launchctl kickstart -k gui/$UID/thinksuit-broker.service
