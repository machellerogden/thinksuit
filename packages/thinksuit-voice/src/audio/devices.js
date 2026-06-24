// Input-device enumeration via naudiodon2 (PortAudio). Deliberately imports
// nothing but the audio binding so consumers (e.g. the console config UI) can
// list devices without pulling in the ONNX runtime or STT stack.

import naudiodon from 'naudiodon2';

// [{ id, name, channels }] for every input-capable device.
export function listInputDevices() {
    return naudiodon
        .getDevices()
        .filter((d) => d.maxInputChannels > 0)
        .map((d) => ({ id: d.id, name: d.name, channels: d.maxInputChannels }));
}
