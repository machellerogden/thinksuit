import { json } from '@sveltejs/kit';
import { loadFrames, saveFrame, deleteFrame } from 'thinksuit';

/**
 * GET /api/frames?module=thinksuit/mu
 * Load all frames for a module (module + user frames merged)
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

        // Load merged frames (module frames + user frames)
        const frames = await loadFrames(moduleName, module);

        return json({ frames });
    } catch (error) {
        console.error('Error loading frames:', error);
        return json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/frames
 * Save a user frame (module-agnostic)
 * Body: { frame: { id, name, description, text } }
 */
export async function POST({ request }) {
    try {
        const { frame } = await request.json();

        if (!frame) {
            return json({ error: 'Frame required' }, { status: 400 });
        }

        if (!frame.id || !frame.name || !frame.text) {
            return json({ error: 'Frame must have id, name, and text' }, { status: 400 });
        }

        const result = await saveFrame(frame);

        if (!result.success) {
            return json({ error: result.error }, { status: 500 });
        }

        return json({ success: true });
    } catch (error) {
        console.error('Error saving frame:', error);
        return json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/frames?id=my-frame
 * Delete a user frame (module frames cannot be deleted)
 */
export async function DELETE({ url }) {
    try {
        const frameId = url.searchParams.get('id');

        if (!frameId) {
            return json({ error: 'Frame ID required' }, { status: 400 });
        }

        const result = await deleteFrame(frameId);

        if (!result.success) {
            return json({ error: result.error }, { status: 500 });
        }

        return json({ success: true });
    } catch (error) {
        console.error('Error deleting frame:', error);
        return json({ error: error.message }, { status: 500 });
    }
}
