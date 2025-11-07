/**
 * Custom error class for user interrupts
 * Allows handlers to distinguish interrupts from other errors
 */
export class InterruptError extends Error {
    constructor(message = 'User interrupted', context = {}) {
        super(message);
        this.name = 'InterruptError';
        this.isInterrupt = true;
        this.context = context;

        // Capture where the interrupt occurred
        this.interruptedAt = new Date().toISOString();
        this.stage = context.stage || 'unknown';
        this.cycleCount = context.cycleCount || 0;
        this.tokensUsed = context.tokensUsed || 0;
        this.toolCallsExecuted = context.toolCallsExecuted || 0;

        // Preserve gathered data for potential synthesis
        this.gatheredData = context.gatheredData || null;
        this.thread = context.thread || [];
    }

    /**
     * Check if we have enough data for graceful synthesis
     */
    canSynthesize() {
        return this.gatheredData !== null || this.thread.length > 1;
    }

    /**
     * Get interrupt summary for logging
     */
    getSummary() {
        return {
            stage: this.stage,
            cycleCount: this.cycleCount,
            tokensUsed: this.tokensUsed,
            toolCallsExecuted: this.toolCallsExecuted,
            interruptedAt: this.interruptedAt,
            canSynthesize: this.canSynthesize()
        };
    }
}

/**
 * Helper to check if an error is an interrupt
 */
export function isInterruptError(error) {
    return error?.isInterrupt === true || error?.name === 'InterruptError';
}

/**
 * Helper to check if an AbortSignal was triggered by user interrupt vs timeout
 */
export function isUserInterrupt(signal) {
    // Check if the signal has our custom interrupt marker
    return signal?.aborted && signal?.reason?.isUserInterrupt === true;
}

/**
 * Create an AbortController configured for user interrupts
 */
export function createInterruptController() {
    // eslint-disable-next-line no-undef
    const controller = new AbortController();

    // Add custom abort method that marks it as user interrupt
    controller.interrupt = (reason = 'User interrupted') => {
        controller.abort({
            isUserInterrupt: true,
            reason,
            time: new Date().toISOString()
        });
    };

    return controller;
}
