#!/usr/bin/env bash

launchctl kill 9 gui/$UID/thinksuit-tty.service
launchctl bootout gui/$UID/thinksuit-tty.service
rm ~/Library/Logs/thinksuit-tty.service.stdout.log
rm ~/Library/Logs/thinksuit-tty.service.stderr.log
touch ~/Library/Logs/thinksuit-tty.service.stdout.log
touch ~/Library/Logs/thinksuit-tty.service.stderr.log

launchctl bootstrap gui/$UID ~/Library/LaunchAgents/thinksuit-tty.service.plist
launchctl print gui/$UID/thinksuit-tty.service

launchctl kickstart -kp gui/$UID/thinksuit-tty.service

tail -q -n 1000 -f ~/Library/Logs/thinksuit-tty.service.stdout.log ~/Library/Logs/thinksuit-tty.service.stderr.log | awk '{ print; fflush(stdout) }'
