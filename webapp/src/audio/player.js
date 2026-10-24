const OUTPUT_RATE = 24000;

// ADK/genai streams audio as URL-safe base64 (—/_) and may omit padding; atob needs standard base64.
function decodeBase64(value) {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder) normalized += "=".repeat(4 - remainder);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function createPlayer() {
  const context = new AudioContext({ sampleRate: OUTPUT_RATE });
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.connect(context.destination);

  let nextStartTime = 0;
  let sources = new Set();

  function enqueueBase64Pcm(base64) {
    const bytes = decodeBase64(base64);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

    const buffer = context.createBuffer(1, float32.length, OUTPUT_RATE);
    buffer.copyToChannel(float32, 0);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    sources.add(source);
    source.onended = () => sources.delete(source);

    const now = context.currentTime;
    if (nextStartTime < now) nextStartTime = now;
    source.start(nextStartTime);
    nextStartTime += buffer.duration;
  }

  function flush() {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    sources.clear();
    nextStartTime = 0;
  }

  function getAmplitude() {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  function isPlaying() {
    return sources.size > 0;
  }

  return {
    resume: () => context.resume(),
    enqueueBase64Pcm,
    flush,
    getAmplitude,
    isPlaying,
    close: () => context.close(),
  };
}
