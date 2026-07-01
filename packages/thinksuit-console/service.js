// Service definition consumed by thinksuitctl (packages/thinksuit-control). Lives
// on the lightweight `./service` subpath, not the package main, so the control
// plane can discover it without loading the daemon or its dependencies.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const service = {
    name: 'thinksuit-console',
    entry: join(here, 'bin/service.mjs'),
    cwd: here,
    env: (ctx) => ({
        THINKSUIT_CONSOLE_PORT: String(ctx.consolePort),
        THINKSUIT_CONSOLE_HOST: 'localhost',
        THINKSUIT_TTY_AUTH_TOKEN: ctx.token
    })
};
