#!/usr/bin/env bash

launchctl kill 9 gui/$UID/thinksuit-console.service
launchctl bootout gui/$UID/thinksuit-console.service
rm ~/Library/Logs/thinksuit-console.service.stdout.log
rm ~/Library/Logs/thinksuit-console.service.stderr.log
touch ~/Library/Logs/thinksuit-console.service.stdout.log
touch ~/Library/Logs/thinksuit-console.service.stderr.log

launchctl bootstrap gui/$UID ~/Library/LaunchAgents/thinksuit-console.service.plist
launchctl print gui/$UID/thinksuit-console.service

launchctl kickstart -kp gui/$UID/thinksuit-console.service

tail -q -n 1000 -f ~/Library/Logs/thinksuit-console.service.stdout.log ~/Library/Logs/thinksuit-console.service.stderr.log | awk '{ print; fflush(stdout) }'