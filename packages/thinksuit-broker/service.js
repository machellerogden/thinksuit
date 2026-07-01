// Service definition consumed by thinksuitctl (packages/thinksuit-control). Lives
// on the lightweight `./service` subpath, not the package main, so the control
// plane can discover it without loading the daemon or its dependencies.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const service = {
    name: 'thinksuit-broker',
    entry: join(here, 'bin/service.mjs'),
    cwd: here,
    // Auto-restart only on a crash signal (throttled 30s in the control plane);
    // `thinkctl stop` (TERM) is respected. The only service opted into this.
    restart: 'on-crash'
};
