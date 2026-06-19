import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveSocketPath() {
    return process.env.THINKSUIT_BROKER_SOCK || join(homedir(), '.thinksuit', 'broker.sock');
}
