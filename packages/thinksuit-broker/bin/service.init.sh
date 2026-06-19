#!/usr/bin/env bash

launchctl kill 9 gui/$UID/thinksuit-broker.service
launchctl bootout gui/$UID/thinksuit-broker.service
rm ~/Library/Logs/thinksuit-broker.service.stdout.log
rm ~/Library/Logs/thinksuit-broker.service.stderr.log
touch ~/Library/Logs/thinksuit-broker.service.stdout.log
touch ~/Library/Logs/thinksuit-broker.service.stderr.log

launchctl bootstrap gui/$UID ~/Library/LaunchAgents/thinksuit-broker.service.plist
launchctl print gui/$UID/thinksuit-broker.service

launchctl kickstart -kp gui/$UID/thinksuit-broker.service

tail -q -n 1000 -f ~/Library/Logs/thinksuit-broker.service.stdout.log ~/Library/Logs/thinksuit-broker.service.stderr.log | awk '{ print; fflush(stdout) }'
