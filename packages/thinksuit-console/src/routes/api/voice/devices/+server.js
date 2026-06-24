import { json } from '@sveltejs/kit';
import { listInputDevices } from 'thinksuit-voice/devices';

export async function GET() {
    try {
        return json({ devices: listInputDevices() });
    } catch (error) {
        console.error('Error listing input devices:', error);
        return json(
            { error: 'Failed to list input devices', message: error.message },
            { status: 500 }
        );
    }
}
