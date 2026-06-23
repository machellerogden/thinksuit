#!/usr/bin/env bash

if [ -n "$1" ]; then
    launchctl kill $1 gui/$UID/thinksuit-voice.service
else
    launchctl kill 9 gui/$UID/thinksuit-voice.service
fi
