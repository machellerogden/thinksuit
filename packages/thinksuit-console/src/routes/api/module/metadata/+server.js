import { json } from '@sveltejs/kit';
import { buildConfig, loadModules } from 'thinksuit';
import { modules as defaultModules } from 'thinksuit-modules';

export async function GET({ url }) {
    try {
        const baseConfig = buildConfig({ argv: [] });

        // Get module name from query param or use default
        const moduleName = url.searchParams.get('module') || baseConfig.module || 'thinksuit/mu';

        // Determine modules - use configured package or default
        let modules;
        const packagePath = baseConfig.modulesPackage;
        if (packagePath) {
            modules = await loadModules(packagePath);
        } else {
            modules = defaultModules;
        }

        // Get the specific module
        const module = modules[moduleName];

        if (!module) {
            return json({
                error: `Module ${moduleName} not found`,
                availableModules: Object.keys(modules)
            }, { status: 404 });
        }

        // Extract metadata by reflecting on the module structure
        const metadata = {
            namespace: module.namespace,
            name: module.name,
            version: module.version,
            description: module.description,
            roles: module.roles?.map(r =>
                typeof r === 'string' ? r : r.name
            ) || [],
            strategies: ['direct', 'task', 'sequential', 'parallel'],
            signals: Object.keys(module.signals || {}),
            adaptations: Object.keys(module.adaptations || {})
        };

        return json(metadata);
    } catch (error) {
        console.error('Error fetching module metadata:', error);
        return json({
            error: error.message
        }, { status: 500 });
    }
}
