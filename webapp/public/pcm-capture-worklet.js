// Acumula áudio do mic e posta chunks Float32 (~40ms) + nível RMS para a main thread.
// Chunks pequenos (20–40ms) são a recomendação do Live API: o VAD do servidor reage mais rápido.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.samples = 0;
    this.chunkSize = Math.floor(sampleRate * 0.04);
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      this.buffer.push(new Float32Array(channel));
      this.samples += channel.length;
      if (this.samples >= this.chunkSize) {
        const merged = new Float32Array(this.samples);
        let offset = 0;
        let sum = 0;
        for (const part of this.buffer) {
          merged.set(part, offset);
          offset += part.length;
        }
        for (let i = 0; i < merged.length; i++) sum += merged[i] * merged[i];
        this.port.postMessage({ pcm: merged, rms: Math.sqrt(sum / merged.length) }, [merged.buffer]);
        this.buffer = [];
        this.samples = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
