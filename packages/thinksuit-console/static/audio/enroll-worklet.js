// AudioWorklet processor for wakeword enrollment. It simply forwards each input
// block (mono Float32) to the main thread, which computes the live level and, when
// recording, accumulates the clip. Kept dumb on purpose — all policy lives on the
// main thread.
class EnrollProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch && ch.length) {
            // The render buffer is reused across calls, so post a copy.
            this.port.postMessage(ch.slice());
        }
        return true;
    }
}

registerProcessor('enroll-processor', EnrollProcessor);
