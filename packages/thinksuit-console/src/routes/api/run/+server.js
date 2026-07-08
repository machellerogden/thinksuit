import { json } from '@sveltejs/kit';
import { buildConfig } from 'thinksuit';
import { validatePlan } from 'thinksuit/schemas/validate';
import * as broker from 'thinksuit-broker';

export async function POST({ request }) {
    try {
        const {
            input,
            trace = false,
            cwd,
            workdir,
            allowedDirectories,
            mcpServers,
            sessionId: providedSessionId,
            modulesPackage,
            selectedPlan,
            frame,
            modality,
            module,
            provider,
            model,
            allowedTools,
            autoApproveTools,
            policy
        } = await request.json();

        if (!input || typeof input !== 'string') {
            return json({ error: 'Input is required and must be a string' }, { status: 400 });
        }

        if (selectedPlan) {
            const validation = validatePlan(selectedPlan);
            if (!validation.valid) {
                return json(
                    { error: 'Invalid plan structure', validationErrors: validation.errors },
                    { status: 400 }
                );
            }
        }

        const baseConfig = buildConfig({ argv: [] });

        // Serializable run config for the broker. The worker loads modules itself
        // from `modulesPackage` (a string) — we never pass loaded code over the wire.
        const config = {
            input,
            sessionId: providedSessionId,
            selectedPlan: selectedPlan || undefined,
            frame: frame || null,
            modality: modality || null,
            module: module || baseConfig.module,
            modulesPackage: modulesPackage || baseConfig.modulesPackage,
            provider: provider || baseConfig.provider,
            model: model || baseConfig.model,
            // No credentials ride this config: the genai service resolves and
            // holds them; the engine calls models through its socket.
            cwd: cwd || baseConfig.cwd,
            workdir: workdir || undefined, // optional: bind session to a dir (else provisioned)
            allowedDirectories: allowedDirectories || baseConfig.allowedDirectories,
            mcpServers: mcpServers || baseConfig.mcpServers,
            allowedTools: allowedTools || undefined,
            autoApproveTools: autoApproveTools ?? baseConfig.autoApproveTools,
            policy: policy || baseConfig.policy,
            trace
        };

        const result = await broker.run(config);
        return json({ sessionId: result.sessionId, status: result.status });
    } catch (error) {
        console.error('Error starting ThinkSuit via broker:', error);
        // Propagate the broker's status code (e.g. 409 when a turn is already in flight).
        return json({ error: error.message }, { status: error.statusCode || 500 });
    }
}
