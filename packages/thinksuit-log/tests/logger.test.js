import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { createServiceLogger } from '../src/logger.js';

function memorySink() {
    const lines = [];
    const stream = new Writable({
        write(chunk, _enc, cb) {
            lines.push(...chunk.toString().split('\n').filter(Boolean));
            cb();
        }
    });
    return { stream, lines };
}

describe('createServiceLogger', () => {
    it('emits contract-shaped JSONL: time, level, service, msg', () => {
        const { stream, lines } = memorySink();
        const log = createServiceLogger('testsvc', { destination: stream });

        log.info({ event: 'test.ping', count: 3 }, 'hello');

        const record = JSON.parse(lines[0]);
        expect(record.service).toBe('testsvc');
        expect(record.level).toBe(30);
        expect(record.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(record.msg).toBe('hello');
        expect(record.event).toBe('test.ping');
        expect(record.count).toBe(3);
        expect(record.pid).toBe(process.pid);
    });

    it('redacts credential-shaped fields', () => {
        const { stream, lines } = memorySink();
        const log = createServiceLogger('testsvc', { destination: stream });

        log.info({ apiKey: 'sk-live-oops', config: { token: 't' } }, 'careless');

        const record = JSON.parse(lines[0]);
        expect(record.apiKey).toBe('[REDACTED]');
        expect(record.config.token).toBe('[REDACTED]');
        expect(lines[0]).not.toContain('sk-live-oops');
    });

    it('honors an explicit level', () => {
        const { stream, lines } = memorySink();
        const log = createServiceLogger('testsvc', { level: 'warn', destination: stream });

        log.info('dropped');
        log.warn('kept');

        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0]).msg).toBe('kept');
    });
});
