#!/usr/bin/env bash

tail -q -n 1000 -f ~/Library/Logs/thinksuit-console.service.stdout.log ~/Library/Logs/thinksuit-console.service.stderr.log | awk '{ print; fflush(stdout) }'