/**
 * Stub ONNX worker for supervisor unit tests. Speaks the same IPC protocol as
 * the real onnx-worker.js; behavior is steered by params.stubMode:
 *   (default) — respond success, echoing params.stubText
 *   'error'   — respond success:false (worker stays alive)
 *   'crash'   — exit(7) without responding
 *   'hang'    — never respond (for abort tests)
 */
process.on('message', (request) => {
    const { id, modelId, dtype, params } = request;
    const mode = params?.stubMode;

    if (mode === 'crash') process.exit(7);
    if (mode === 'hang') return;

    setTimeout(() => {
        if (mode === 'error') {
            process.send({
                id,
                success: false,
                error: 'stub failure',
                loadedModels: [`${modelId}:${dtype}`]
            });
            return;
        }
        process.send({
            id,
            success: true,
            loadedModels: [`${modelId}:${dtype}`],
            result: {
                output: `echo:${params?.stubText ?? ''}`,
                usage: { prompt: 1, completion: 1 },
                model: params?.model,
                finishReason: 'complete',
                original: {
                    request: { modelId, dtype },
                    response: { pid: process.pid }
                }
            }
        });
    }, params?.stubDelayMs || 0);
});

process.send({ ready: true });
