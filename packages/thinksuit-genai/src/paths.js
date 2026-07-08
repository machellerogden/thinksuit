import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveSocketPath() {
    return process.env.THINKSUIT_GENAI_SOCK || join(homedir(), '.thinksuit', 'genai.sock');
}
