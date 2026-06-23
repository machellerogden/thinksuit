#!/usr/bin/env bash

tail -q -n 1000 -f ~/Library/Logs/thinksuit-voice.service.stdout.log ~/Library/Logs/thinksuit-voice.service.stderr.log | awk '{ print; fflush(stdout) }'
