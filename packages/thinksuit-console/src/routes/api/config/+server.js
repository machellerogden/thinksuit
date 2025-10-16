import { json } from '@sveltejs/kit';
import { buildConfig } from 'thinksuit';

export async function GET() {
    try {
        // Build config without CLI parsing (server context)
        const config = buildConfig({ argv: [] });

        // Add TTY configuration
        const configWithTty = {
            ...config,
            ttyPort: parseInt(process.env.THINKSUIT_TTY_PORT || '60662'),
            ttyToken: process.env.THINKSUIT_TTY_AUTH_TOKEN || '',
            ttyCwd: config.cwd || process.env.HOME
        };

        // Remove internal CLI object
        delete configWithTty._cli;

        return json(configWithTty);
    } catch (error) {
        console.error('Error fetching config:', error);
        return json({ error: 'Failed to fetch configuration' }, { status: 500 });
    }
}
