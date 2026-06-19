#!/usr/bin/env node

/**
 * ThinkSuit CLI entry point.
 *
 * Bare `thinksuit` launches the interactive REPL. A recognized first arg routes
 * to the broker subcommand dispatcher (thin client over the broker socket).
 */

const KNOWN_VERBS = new Set([
    'run',
    'sessions',
    'status',
    'log',
    'attach',
    'interrupt',
    'approve'
]);

const verb = process.argv[2];

if (verb && KNOWN_VERBS.has(verb)) {
    const { dispatch } = await import('./src/cli.js');
    await dispatch(verb, process.argv.slice(3));
} else {
    await import('./src/main.js');
}
