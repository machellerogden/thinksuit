/**
 * composeInstructions Tests
 * Tests instruction composition for the mu module
 */

import { describe, it, expect } from 'vitest';
import { composeInstructions } from '../composeInstructions.js';
import mu from '../index.js';

describe('composeInstructions', () => {
    describe('basic composition', () => {
        it('should resolve prompt keys from module.prompts', async () => {
            const plan = { role: 'capture' };
            const result = await composeInstructions({ plan, factMap: {} }, mu);

            // System instructions are now in the thread at indices.systemInstruction
            expect(result.thread).toBeDefined();
            expect(result.indices.systemInstruction).toBeGreaterThanOrEqual(0);
            expect(result.thread[result.indices.systemInstruction].content).toContain(mu.prompts['system.capture']);
            // Primary prompt is in the thread at indices.primaryPrompt
            expect(result.indices.primaryPrompt).toBeGreaterThanOrEqual(0);
            expect(result.thread[result.indices.primaryPrompt].content).toBe(mu.prompts['primary.capture']);
        });

        it('should use default role when role not found', async () => {
            const plan = { role: 'nonexistent' };
            const result = await composeInstructions({ plan, factMap: {} }, mu);

            const defaultRole = mu.roles.find(r => r.isDefault);
            expect(result.metadata.role).toBe(defaultRole.name);
        });

        it('should use first role as fallback if no default', async () => {
            const moduleWithoutDefault = {
                ...mu,
                roles: mu.roles.map(r => ({ ...r, isDefault: false }))
            };
            const plan = {};
            const result = await composeInstructions({ plan, factMap: {} }, moduleWithoutDefault);

            expect(result.metadata.role).toBe(mu.roles[0].name);
        });
    });

    describe('adaptation formatting', () => {
        it('should format adaptations with markdown when specified in plan', async () => {
            const plan = {
                role: 'investigate',
                params: { adaptations: ['tools-available', 'task-execution'] }
            };
            const result = await composeInstructions({ plan }, mu);

            expect(result.adaptations).toContain('## Adaptations');
            expect(result.adaptations).toContain('The following adjustments apply based on the current context:');
            expect(result.adaptations).toContain('Tools are available');
        });

        it('should return empty string when no adaptations', async () => {
            const plan = { role: 'analyze', adaptations: [] };
            const result = await composeInstructions({ plan, factMap: {} }, mu);

            expect(result.adaptations).toBe('');
        });

        it('should filter out invalid adaptation keys', async () => {
            const plan = {
                role: 'analyze',
                params: { adaptations: ['tools-available', 'nonexistent-key'] }
            };
            const result = await composeInstructions({ plan }, mu);

            expect(result.adaptations).toContain('Tools are available');
            expect(result.adaptations).not.toContain('nonexistent');
        });
    });

    describe('length guidance', () => {
        it('should use brief length level', async () => {
            const plan = { role: 'capture', params: { lengthLevel: 'brief' } };
            const result = await composeInstructions({ plan }, mu);

            expect(result.lengthGuidance).toBe(mu.prompts['length.brief']);
        });

        it('should use standard length level as default', async () => {
            const plan = { role: 'analyze' };
            const result = await composeInstructions({ plan, factMap: {} }, mu);

            expect(result.lengthGuidance).toBe(mu.prompts['length.standard']);
        });

        it('should use comprehensive length level', async () => {
            const plan = { role: 'synthesize', params: { lengthLevel: 'comprehensive' } };
            const result = await composeInstructions({ plan }, mu);

            expect(result.lengthGuidance).toBe(mu.prompts['length.comprehensive']);
        });
    });

    describe('tool instructions', () => {
        it('should include tool instructions when tools are present', async () => {
            const plan = {
                role: 'investigate',
                tools: ['read_text_file', 'read_media_file', 'read_multiple_files', 'search']
            };
            const result = await composeInstructions({ plan, factMap: {} }, mu);

            expect(result.toolInstructions).toContain('Tools are available');
            expect(result.toolInstructions).toContain('Working on a task');
        });

        it('should return empty string when no tools', async () => {
            const plan = { role: 'analyze' };
            const result = await composeInstructions({ plan, factMap: {} }, mu);

            expect(result.toolInstructions).toBe('');
        });
    });

    describe('token calculation', () => {
        it('should use role baseTokens when plan.maxTokens not specified', async () => {
            const plan = { role: 'capture' };
            const result = await composeInstructions({ plan, factMap: {} }, mu);

            const roleConfig = mu.roles.find(r => r.name === 'capture');
            expect(result.maxTokens).toBe(roleConfig.baseTokens);
        });

        it('should use params.maxTokens when specified', async () => {
            const plan = { role: 'analyze', params: { maxTokens: 1500 } };
            const result = await composeInstructions({ plan }, mu);

            expect(result.maxTokens).toBe(1500);
        });

        it('should fallback to 500 if neither specified', async () => {
            const moduleWithoutTokens = {
                ...mu,
                roles: mu.roles.map(r => ({ ...r, baseTokens: undefined }))
            };
            const plan = { role: 'analyze' };
            const result = await composeInstructions({ plan, factMap: {} }, moduleWithoutTokens);

            expect(result.maxTokens).toBe(500);
        });
    });

    describe('metadata', () => {
        it('should return complete metadata', async () => {
            const plan = {
                role: 'investigate',
                params: { adaptations: ['tools-available'], lengthLevel: 'standard' }
            };
            const result = await composeInstructions({ plan }, mu);

            expect(result.metadata).toBeDefined();
            expect(result.metadata.role).toBe('investigate');
            expect(result.metadata.baseTokens).toBeDefined();
            expect(result.metadata.lengthLevel).toBe('standard');
            expect(result.metadata.adaptations).toEqual(['tools-available']);
        });
    });

    describe('modality + frame prelude', () => {
        const preludeContent = (result) =>
            result.indices.frameSet >= 0 ? result.thread[result.indices.frameSet].content : null;

        it('renders the module modality text into the prelude, after the frame', async () => {
            const result = await composeInstructions(
                { plan: { role: 'chat' }, factMap: {}, frame: { text: 'SITUATION-XYZ' }, modality: 'voice' },
                mu
            );
            const content = preludeContent(result);
            expect(content).toContain('SITUATION-XYZ');
            expect(content).toContain(mu.modalities.voice);
            // frame first, modality after
            expect(content.indexOf('SITUATION-XYZ')).toBeLessThan(content.indexOf(mu.modalities.voice));
        });

        it('yields a prelude from modality alone (no frame)', async () => {
            const result = await composeInstructions(
                { plan: { role: 'chat' }, factMap: {}, frame: null, modality: 'voice' },
                mu
            );
            expect(preludeContent(result)).toBe(mu.modalities.voice);
        });

        it('is a no-op for an unknown modality with no frame', async () => {
            const result = await composeInstructions(
                { plan: { role: 'chat' }, factMap: {}, frame: null, modality: 'bogus' },
                mu
            );
            expect(result.indices.frameSet).toBe(-1);
        });

        it('leaves frame-only behavior unchanged', async () => {
            const result = await composeInstructions(
                { plan: { role: 'chat' }, factMap: {}, frame: { text: 'JUST-FRAME' }, modality: null },
                mu
            );
            expect(preludeContent(result)).toBe('JUST-FRAME');
        });

        it('injects no prelude when neither frame nor modality is present', async () => {
            const result = await composeInstructions({ plan: { role: 'chat' }, factMap: {} }, mu);
            expect(result.indices.frameSet).toBe(-1);
        });
    });

    describe('all 6 roles', () => {
        const roles = ['capture', 'readback', 'analyze', 'investigate', 'synthesize', 'execute'];

        roles.forEach(roleName => {
            it(`should compose instructions for ${roleName} role`, async () => {
                const plan = { role: roleName };
                const result = await composeInstructions({ plan, factMap: {} }, mu);

                // System instructions are now in the thread at indices.systemInstruction
                expect(result.thread).toBeDefined();
                expect(result.indices.systemInstruction).toBeGreaterThanOrEqual(0);
                expect(result.thread[result.indices.systemInstruction].content).toContain(mu.prompts[`system.${roleName}`]);
                // Primary prompt is in the thread at indices.primaryPrompt
                expect(result.indices.primaryPrompt).toBeGreaterThanOrEqual(0);
                const primaryPrompt = mu.prompts[`primary.${roleName}`];
                const expectedPrimary = typeof primaryPrompt === 'function'
                    ? primaryPrompt({ plan, factMap: {}, tools: [], role: roleName, adaptations: [], lengthLevel: 'standard' })
                    : primaryPrompt;
                expect(result.thread[result.indices.primaryPrompt].content).toBe(expectedPrimary);
                expect(result.metadata.role).toBe(roleName);
                expect(typeof result.maxTokens).toBe('number');
            });
        });
    });
});
