import { json } from '@sveltejs/kit';
import { buildConfig, loadModules } from 'thinksuit';
import { modules as defaultModules } from 'thinksuit-modules';

/**
 * Walk a plan.v1 node tree, composing instructions for every task node encountered.
 * Composites (sequence/parallel) recurse into their children; the flat result list
 * carries a path label so the UI can show where each composition sits in the tree.
 */
async function walkNode(node, module, results, path = 'root') {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'sequence' || node.type === 'parallel') {
        const children = node.children || [];
        for (let i = 0; i < children.length; i++) {
            await walkNode(children[i], module, results, `${path}.${node.type}[${i + 1}]`);
        }
        return;
    }

    // Default: a task node.
    const instructions = await module.composeInstructions({ plan: node }, module);
    results.push({
        type: 'task',
        path,
        role: node.role,
        instructions
    });
}

export async function POST({ request, url }) {
    try {
        const { plan } = await request.json();

        if (!plan) {
            return json({ error: 'Plan is required' }, { status: 400 });
        }

        const baseConfig = buildConfig({ argv: [] });
        const moduleName = url.searchParams.get('module') || baseConfig.module || 'thinksuit/mu';

        // Load modules
        let modules;
        const packagePath = baseConfig.modulesPackage;
        if (packagePath) {
            modules = await loadModules(packagePath);
        } else {
            modules = defaultModules;
        }

        const module = modules[moduleName];
        if (!module) {
            return json({
                error: `Module ${moduleName} not found`,
                availableModules: Object.keys(modules)
            }, { status: 404 });
        }

        const results = [];
        await walkNode(plan, module, results);

        return json({
            plan: {
                name: plan.name,
                type: plan.type
            },
            results
        });
    } catch (error) {
        console.error('Error composing instructions:', error);
        return json({
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
