import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SETTINGS_DIR = join(homedir(), '.thinksuit', 'console');
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json');

const DEFAULT_SETTINGS = {};

async function ensureSettingsDir() {
    try {
        await fs.mkdir(SETTINGS_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating settings directory:', error);
    }
}

async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return DEFAULT_SETTINGS;
        }
        throw error;
    }
}

async function saveSettings(settings) {
    await ensureSettingsDir();
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function GET() {
    try {
        const settings = await loadSettings();
        return json(settings);
    } catch (error) {
        console.error('Error loading console settings:', error);
        return json({ error: 'Failed to load settings' }, { status: 500 });
    }
}

export async function POST({ request }) {
    try {
        const settings = await request.json();
        await saveSettings(settings);
        return json({ success: true });
    } catch (error) {
        console.error('Error saving console settings:', error);
        return json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
