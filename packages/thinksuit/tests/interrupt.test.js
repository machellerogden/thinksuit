import { describe, it, expect, afterEach, vi } from 'vitest';
import { createInterruptController, InterruptError, isInterruptError } from '../engine/errors/InterruptError.js';

describe('Interrupt Support', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('InterruptError', () => {
        it('should create interrupt error with context', () => {
            const error = new InterruptError('Test interrupt', {
                stage: 'test-stage',
                roundCount: 2,
                tokensUsed: 100
            });

            expect(error.message).to.equal('Test interrupt');
            expect(error.isInterrupt).to.be.true;
            expect(error.stage).to.equal('test-stage');
            expect(error.roundCount).to.equal(2);
            expect(error.tokensUsed).to.equal(100);
        });

        it('should identify interrupt errors correctly', () => {
            const interruptError = new InterruptError('Interrupted');
            const normalError = new Error('Regular error');

            expect(isInterruptError(interruptError)).to.be.true;
            expect(isInterruptError(normalError)).to.be.false;
        });

        it('should determine if synthesis is possible', () => {
            const errorWithData = new InterruptError('Interrupted', {
                gatheredData: { some: 'data' }
            });
            const errorWithThread = new InterruptError('Interrupted', {
                thread: [{ role: 'user', content: 'test' }, { role: 'assistant', content: 'response' }]
            });
            const errorWithoutData = new InterruptError('Interrupted');

            expect(errorWithData.canSynthesize()).to.be.true;
            expect(errorWithThread.canSynthesize()).to.be.true;
            expect(errorWithoutData.canSynthesize()).to.be.false;
        });
    });

    describe('createInterruptController', () => {
        it('should create controller with interrupt method', () => {
            const controller = createInterruptController();

            expect(controller).to.have.property('signal');
            expect(controller).to.have.property('interrupt');
            expect(controller.signal.aborted).to.be.false;
        });

        it('should mark signal as user interrupt when interrupted', () => {
            const controller = createInterruptController();

            controller.interrupt('Test reason');

            expect(controller.signal.aborted).to.be.true;
            expect(controller.signal.reason).to.have.property('isUserInterrupt', true);
            expect(controller.signal.reason).to.have.property('reason', 'Test reason');
        });
    });
});