import { describe, it, expect } from 'vitest';
import { getTemperature } from '../../../engine/handlers/utils/temperature.js';

describe('getTemperature', () => {
    it('returns role-specific temperature when available', () => {
        const module = {
            roles: [
                { name: 'assistant', temperature: 0.7, isDefault: false },
                { name: 'analyzer', temperature: 0.3, isDefault: false }
            ]
        };

        expect(getTemperature(module, 'assistant')).toBe(0.7);
        expect(getTemperature(module, 'analyzer')).toBe(0.3);
    });

    it('returns default temperature when role not found', () => {
        const module = {
            roles: [
                { name: 'assistant', temperature: 0.7, isDefault: true }
            ]
        };

        expect(getTemperature(module, 'unknown')).toBe(0.7);
    });

    it('returns fallback when no default or role temperature', () => {
        const module = {
            roles: [
                { name: 'assistant', temperature: 0.7, isDefault: false }
            ]
        };

        expect(getTemperature(module, 'unknown')).toBe(0.7); // default fallback
        expect(getTemperature(module, 'unknown', 0.9)).toBe(0.9); // custom fallback
    });

    it('handles missing module gracefully', () => {
        expect(getTemperature(null, 'assistant')).toBe(0.7);
        expect(getTemperature(undefined, 'assistant')).toBe(0.7);
        expect(getTemperature({}, 'assistant')).toBe(0.7);
    });

    it('handles missing roles array gracefully', () => {
        const module = {};
        expect(getTemperature(module, 'assistant')).toBe(0.7);
    });

    it('handles empty roles array gracefully', () => {
        const module = {
            roles: []
        };
        expect(getTemperature(module, 'assistant')).toBe(0.7);
    });

    it('respects explicit 0 temperature', () => {
        const module = {
            roles: [
                { name: 'assistant', temperature: 0, isDefault: true }
            ]
        };

        expect(getTemperature(module, 'assistant')).toBe(0);
    });

    it('respects explicit 1.0 temperature', () => {
        const module = {
            roles: [
                { name: 'explorer', temperature: 1.0, isDefault: true }
            ]
        };

        expect(getTemperature(module, 'explorer')).toBe(1.0);
    });
});
