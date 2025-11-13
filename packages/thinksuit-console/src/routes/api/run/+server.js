import { json } from '@sveltejs/kit';
import { schedule, createLogger, buildConfig, loadModules } from 'thinksuit';
import { validatePlan } from 'thinksuit/schemas/validate';
import { modules as defaultModules } from 'thinksuit-modules';
import { SESSION_STATUS } from 'thinksuit/constants/events';
import { registerExecution, removeExecution } from '$lib/server/activeExecutions.js';

export async function POST({ request }) {
    try {
        const {
            input,
            trace = false,
            cwd,
            allowedDirectories,
            mcpServers,
            sessionId: providedSessionId,
            modulesPackage,
            selectedPlan,
            frame,
            // Accept config overrides
            module,
            provider,
            model,
            allowedTools,
            autoApproveTools,
            policy,
            ...otherOverrides
        } = await request.json();
        
        if (!input || typeof input !== 'string') {
            return json({ error: 'Input is required and must be a string' }, { status: 400 });
        }

        // Validate selectedPlan if provided
        if (selectedPlan) {
            const validation = validatePlan(selectedPlan);
            if (!validation.valid) {
                return json({
                    error: 'Invalid plan structure',
                    validationErrors: validation.errors
                }, { status: 400 });
            }
        }

        // Load base config from filesystem
        const baseConfig = buildConfig({ argv: [] });

        // Create logger for server context
        const logger = createLogger({
            level: 'info',
            silent: false,  // We want server-side logs
            trace,
            session: true,  // Enable session logging
            format: 'json'  // Use JSON format instead of pretty for server
        });

        // Determine modules
        let modules;
        const packagePath = modulesPackage || baseConfig.modulesPackage;
        if (packagePath) {
            modules = await loadModules(packagePath);
        } else {
            modules = defaultModules;
        }

        // Build final config with overrides taking precedence
        const config = {
            input,
            sessionId: providedSessionId,  // May be undefined
            selectedPlan: selectedPlan || undefined,  // Manual plan override
            frame: frame || null,  // Frame context
            module: module || baseConfig.module,
            modules,
            provider: provider || baseConfig.provider,
            model: model || baseConfig.model,
            providerConfig: baseConfig.providerConfig,
            cwd: cwd || baseConfig.cwd,
            allowedDirectories: allowedDirectories || baseConfig.allowedDirectories,
            mcpServers: mcpServers || baseConfig.mcpServers,
            // Pass through allowedTools if specified (no default - all discovered tools allowed)
            allowedTools: allowedTools || undefined,
            autoApproveTools: autoApproveTools ?? baseConfig.autoApproveTools,
            policy: policy || baseConfig.policy,
            trace,
            logger,  // Pass our custom logger
            ...otherOverrides  // Any other config overrides
        };

        // Schedule execution
        const { sessionId, scheduled, isNew, execution, interrupt, reason } = await schedule(config);

        if (!scheduled) {
            return json({
                error: reason,
                sessionId
            }, { status: 409 }); // 409 Conflict
        }

        // Store the interrupt function in registry
        registerExecution(sessionId, interrupt);

        // Execute in background - don't await completion
        execution
            .then(result => {
                console.log(`[Session ${sessionId}] Execution completed`, result.success ? 'successfully' : 'with errors');
                // Clean up from registry when done
                removeExecution(sessionId);
            })
            .catch(error => {
                console.error(`[Session ${sessionId}] Execution failed:`, error);
                // Clean up from registry on error
                removeExecution(sessionId);
            });

        // Always return the session ID immediately
        return json({
            sessionId,
            status: isNew ? SESSION_STATUS.INITIALIZED : SESSION_STATUS.READY
        });
    } catch (error) {
        console.error('Error starting ThinkSuit:', error);
        return json({ 
            error: error.message 
        }, { status: 500 });
    }
}