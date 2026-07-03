import { json } from '@sveltejs/kit';
import { loadPlans, savePlan, deletePlan } from 'thinksuit';

/**
 * GET /api/plans?module=thinksuit/mu
 * Load all plans for a module (module + user plans merged)
 */
export async function GET({ url }) {
    try {
        const moduleName = url.searchParams.get('module');
        if (!moduleName) {
            return json({ error: 'Module name required' }, { status: 400 });
        }

        // Load modules to get the specific module object
        const { buildConfig, loadModules } = await import('thinksuit');
        const { modules: defaultModules } = await import('thinksuit-modules');

        const baseConfig = buildConfig({ argv: [] });

        let modules;
        const packagePath = baseConfig.modulesPackage;
        if (packagePath) {
            modules = await loadModules(packagePath);
        } else {
            modules = defaultModules;
        }

        const module = modules[moduleName];
        if (!module) {
            return json({ error: `Module ${moduleName} not found` }, { status: 404 });
        }

        // Load merged plans (module plans + user plans)
        const plans = await loadPlans(moduleName, module);

        return json({ plans });
    } catch (error) {
        console.error('Error loading plans:', error);
        return json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/plans
 * Save a user plan (module-agnostic)
 * Body: { plan: { id, name, description?, ...Node } }  // inline plan.v1 node
 */
export async function POST({ request }) {
    try {
        const { plan } = await request.json();

        if (!plan) {
            return json({ error: 'Plan required' }, { status: 400 });
        }

        if (!plan.id || !plan.name || !plan.type) {
            return json({ error: 'Plan must have id, name, and type' }, { status: 400 });
        }

        const result = await savePlan(plan);

        if (!result.success) {
            return json({ error: result.error }, { status: 500 });
        }

        return json({ success: true });
    } catch (error) {
        console.error('Error saving plan:', error);
        return json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/plans?id=my-plan
 * Delete a user plan (module plans cannot be deleted)
 */
export async function DELETE({ url }) {
    try {
        const planId = url.searchParams.get('id');

        if (!planId) {
            return json({ error: 'Plan ID required' }, { status: 400 });
        }

        const result = await deletePlan(planId);

        if (!result.success) {
            return json({ error: result.error }, { status: 500 });
        }

        return json({ success: true });
    } catch (error) {
        console.error('Error deleting plan:', error);
        return json({ error: error.message }, { status: 500 });
    }
}
