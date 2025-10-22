import { json } from '@sveltejs/kit';
import { buildConfig, loadModules } from 'thinksuit';
import { modules as defaultModules } from 'thinksuit-modules';

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

        // Compose instructions based on plan strategy
        const results = [];

        if (plan.strategy === 'direct' || plan.strategy === 'task') {
            // Single instruction composition
            const instructions = await module.composeInstructions(
                { plan, factMap: { Signal: [] } },
                module
            );
            results.push({
                type: plan.strategy,
                role: plan.role,
                instructions
            });
        } else if (plan.strategy === 'sequential') {
            // Compose for each step in sequence
            for (let i = 0; i < (plan.sequence || []).length; i++) {
                const step = plan.sequence[i];
                const stepPlan = typeof step === 'string'
                    ? { role: step, strategy: 'direct' }
                    : step;

                const instructions = await module.composeInstructions(
                    { plan: stepPlan, factMap: { Signal: [] } },
                    module
                );

                results.push({
                    type: 'step',
                    index: i + 1,
                    role: stepPlan.role,
                    strategy: stepPlan.strategy,
                    instructions
                });
            }
        } else if (plan.strategy === 'parallel') {
            // Compose for each branch
            for (let i = 0; i < (plan.roles || []).length; i++) {
                const branch = plan.roles[i];
                const branchPlan = typeof branch === 'string'
                    ? { role: branch, strategy: 'direct' }
                    : branch;

                const instructions = await module.composeInstructions(
                    { plan: branchPlan, factMap: { Signal: [] } },
                    module
                );

                results.push({
                    type: 'branch',
                    index: i + 1,
                    role: branchPlan.role,
                    strategy: branchPlan.strategy,
                    instructions
                });
            }
        }

        return json({
            plan: {
                name: plan.name,
                strategy: plan.strategy
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
