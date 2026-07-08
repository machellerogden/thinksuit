// Fixed-size chunk accumulator. Capture emits variable-length frames; neural
// detectors (silero) need exact 512-sample chunks. This buffers across pushes,
// drains full chunks, and tracks the absolute sample offset of each chunk so the
// endpointer's window math keys off sample positions, not input frame sizes.

export function createChunker(size) {
    let buf = new Int16Array(0);
    let cursor = 0; // absolute sample offset of the next chunk to emit

    return {
        reset() {
            buf = new Int16Array(0);
            cursor = 0;
        },
        // Append a frame; return an array of { chunk: Int16Array(size), sample }.
        push(frame) {
            const merged = new Int16Array(buf.length + frame.length);
            merged.set(buf, 0);
            merged.set(frame, buf.length);

            const out = [];
            let off = 0;
            while (off + size <= merged.length) {
                out.push({ chunk: merged.subarray(off, off + size), sample: cursor });
                cursor += size;
                off += size;
            }
            buf = merged.slice(off); // hold the < size remainder
            return out;
        }
    };
}
