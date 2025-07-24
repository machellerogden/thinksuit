import { describe, it, expect } from 'vitest';
import { getTemperature } from '../../../engine/handlers/utils/temperature.js';

describe('getTemperature', () => {
    it('returns role-specific temperature when available', () => {
        const module = {
            instructionSchema: {
                temperature: {
                    assistant: 0.7,
                    analyzer: 0.3,
                    default: 0.5
                }
            }
        };

        expect(getTemperature(module, 'assistant')).toBe(0.7);
        expect(getTemperature(module, 'analyzer')).toBe(0.3);
    });

    it('returns default temperature when role not found', () => {
        const module = {
            instructionSchema: {
                temperature: {
                    assistant: 0.7,
                    default: 0.5
                }
            }
        };

        expect(getTemperature(module, 'unknown')).toBe(0.5);
    });

    it('returns fallback when no default or role temperature', () => {
        const module = {
            instructionSchema: {
                temperature: {
                    assistant: 0.7
                    // no default
                }
            }
        };

        expect(getTemperature(module, 'unknown')).toBe(0.7); // default fallback
        expect(getTemperature(module, 'unknown', 0.9)).toBe(0.9); // custom fallback
    });

    it('handles missing module gracefully', () => {
        expect(getTemperature(null, 'assistant')).toBe(0.7);
        expect(getTemperature(undefined, 'assistant')).toBe(0.7);
        expect(getTemperature({}, 'assistant')).toBe(0.7);
    });

    it('handles missing instructionSchema gracefully', () => {
        const module = {};
        expect(getTemperature(module, 'assistant')).toBe(0.7);
    });

    it('handles missing temperature config gracefully', () => {
        const module = {
            instructionSchema: {}
        };
        expect(getTemperature(module, 'assistant')).toBe(0.7);
    });

    it('respects explicit 0 temperature', () => {
        const module = {
            instructionSchema: {
                temperature: {
                    assistant: 0,
                    default: 0.5
                }
            }
        };

        expect(getTemperature(module, 'assistant')).toBe(0);
    });

    it('respects explicit 1.0 temperature', () => {
        const module = {
            instructionSchema: {
                temperature: {
                    explorer: 1.0,
                    default: 0.5
                }
            }
        };

        expect(getTemperature(module, 'explorer')).toBe(1.0);
    });
});
