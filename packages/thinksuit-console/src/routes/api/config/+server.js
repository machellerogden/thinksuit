import { json } from '@sveltejs/kit';
import { buildConfig } from 'thinksuit';

export async function GET() {
    try {
        // Build config without CLI parsing (server context)
        const config = buildConfig({ argv: [] });
        
        // Mask sensitive data
        const sanitizedConfig = {
            ...config,
            providerConfig: config.providerConfig ? {
                openai: config.providerConfig.openai?.apiKey ? { apiKey: '***' } : undefined,
                vertexAi: config.providerConfig.vertexAi?.projectId ? {
                    projectId: config.providerConfig.vertexAi.projectId,
                    location: config.providerConfig.vertexAi.location
                } : undefined,
                anthropic: config.providerConfig.anthropic?.apiKey ? { apiKey: '***' } : undefined
            } : undefined,
            // Preserve sources metadata including error/isEmpty flags
            _sources: config._sources,
            // Add TTY configuration
            ttyPort: parseInt(process.env.THINKSUIT_TTY_PORT || '60662'),
            ttyToken: process.env.THINKSUIT_TTY_AUTH_TOKEN || '',
            ttyCwd: config.cwd || process.env.HOME
        };
        
        // Remove internal CLI object
        delete sanitizedConfig._cli;
        
        return json(sanitizedConfig);
    } catch (error) {
        console.error('Error fetching config:', error);
        return json({ error: 'Failed to fetch configuration' }, { status: 500 });
    }
}