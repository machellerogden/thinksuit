#!/usr/bin/env bash

tail -q -n 1000 -f ~/Library/Logs/thinksuit-broker.service.stdout.log ~/Library/Logs/thinksuit-broker.service.stderr.log | awk '{ print; fflush(stdout) }'
