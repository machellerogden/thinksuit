import { createGraniteProvider } from './providers/granite.js';
import pino from 'pino';

const provider = createGraniteProvider({ dtype: 'q4' });
const logger = pino({ level: 'info' });

const machineContext = {
    execLogger: logger,
    abortSignal: null
};

const params = {
    model: 'ibm-granite/granite-4.0-h-1b',
    thread: [{ role: 'user', content: 'What is 2+2?' }],
    maxTokens: 50,
    temperature: 0.7
};

console.log('Starting provider test...');
const start = Date.now();

try {
    const response = await provider.callLLM(machineContext, params);
    const elapsed = Date.now() - start;
    console.log(`\nCompleted in ${elapsed}ms`);
    console.log('\nResponse structure:');
    console.log(JSON.stringify({
        output: response.output,
        usage: response.usage,
        model: response.model,
        finishReason: response.finishReason,
        toolCalls: response.toolCalls,
        hasRaw: !!response.raw
    }, null, 2));
    process.exit(0);
} catch (err) {
    console.error('\nERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
}
