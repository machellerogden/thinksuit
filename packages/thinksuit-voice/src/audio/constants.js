// Audio constants shared across capture, endpointing, and the wake pipeline.
// Kept dependency-free so device enumeration can import it without loading the
// ONNX runtime.

export const SAMPLE_RATE = 16000;
