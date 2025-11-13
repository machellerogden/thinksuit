import { json } from '@sveltejs/kit';
import { loadPresets, savePreset, deletePreset } from 'thinksuit';

/**
 * GET /api/presets?module=thinksuit/mu
 * Load all presets for a module (module + user presets merged)
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

        // Load merged presets
        const presets = await loadPresets(moduleName, module);

        return json({ presets });
    } catch (error) {
        console.error('Error loading presets:', error);
        return json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/presets
 * Save a user preset
 * Body: { module: string, preset: { id, name, description, plan } }
 */
export async function POST({ request }) {
    try {
        const { module, preset } = await request.json();

        if (!module || !preset) {
            return json({ error: 'Module and preset required' }, { status: 400 });
        }

        if (!preset.id || !preset.name || !preset.plan) {
            return json({ error: 'Preset must have id, name, and plan' }, { status: 400 });
        }

        const result = await savePreset(module, preset);

        if (!result.success) {
            return json({ error: result.error }, { status: 500 });
        }

        return json({ success: true });
    } catch (error) {
        console.error('Error saving preset:', error);
        return json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/presets?module=thinksuit/mu&id=my-preset
 * Delete a user preset (module presets cannot be deleted)
 */
export async function DELETE({ url }) {
    try {
        const moduleName = url.searchParams.get('module');
        const presetId = url.searchParams.get('id');

        if (!moduleName || !presetId) {
            return json({ error: 'Module name and preset ID required' }, { status: 400 });
        }

        const result = await deletePreset(moduleName, presetId);

        if (!result.success) {
            return json({ error: result.error }, { status: 500 });
        }

        return json({ success: true });
    } catch (error) {
        console.error('Error deleting preset:', error);
        return json({ error: error.message }, { status: 500 });
    }
}
