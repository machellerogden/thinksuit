#!/usr/bin/env bash

launchctl kill 9 gui/$UID/thinksuit-voice.service
launchctl bootout gui/$UID/thinksuit-voice.service
rm ~/Library/Logs/thinksuit-voice.service.stdout.log
rm ~/Library/Logs/thinksuit-voice.service.stderr.log
touch ~/Library/Logs/thinksuit-voice.service.stdout.log
touch ~/Library/Logs/thinksuit-voice.service.stderr.log

launchctl bootstrap gui/$UID ~/Library/LaunchAgents/thinksuit-voice.service.plist
launchctl print gui/$UID/thinksuit-voice.service

# The voice service is currently keyless (wake + STT + TTS all run locally). When
# a cloud provider is selected, forward its key here before kickstart (see
# service.setenv.sh) — keep the two in sync.
launchctl kickstart -k gui/$UID/thinksuit-voice.service

tail -q -n 1000 -f ~/Library/Logs/thinksuit-voice.service.stdout.log ~/Library/Logs/thinksuit-voice.service.stderr.log | awk '{ print; fflush(stdout) }'
