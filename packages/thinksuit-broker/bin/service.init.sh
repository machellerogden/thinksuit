#!/usr/bin/env bash

launchctl kill 9 gui/$UID/thinksuit-broker.service
launchctl bootout gui/$UID/thinksuit-broker.service
rm ~/Library/Logs/thinksuit-broker.service.stdout.log
rm ~/Library/Logs/thinksuit-broker.service.stderr.log
touch ~/Library/Logs/thinksuit-broker.service.stdout.log
touch ~/Library/Logs/thinksuit-broker.service.stderr.log

launchctl bootstrap gui/$UID ~/Library/LaunchAgents/thinksuit-broker.service.plist
launchctl print gui/$UID/thinksuit-broker.service

# Forward provider credentials from this shell into launchd, then (re)start the
# broker so it inherits them. Inlined (rather than calling service.setenv.sh) so
# it works whether init is run directly or via the npm-installed bin symlink.
# Keep in sync with service.setenv.sh.
for k in ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_LOCATION HF_TOKEN; do
    [ -n "${!k}" ] && launchctl setenv "$k" "${!k}"
done
launchctl kickstart -k gui/$UID/thinksuit-broker.service

tail -q -n 1000 -f ~/Library/Logs/thinksuit-broker.service.stdout.log ~/Library/Logs/thinksuit-broker.service.stderr.log | awk '{ print; fflush(stdout) }'
