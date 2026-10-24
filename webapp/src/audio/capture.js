import { createNoise } from "./noise.js";

const TARGET_RATE = 16000;

function downsample(float32, fromRate, toRate) {
  if (fromRate === toRate) return float32;
  const ratio = fromRate / toRate;
  const length = Math.floor(float32.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, float32.length - 1);
    const frac = pos - left;
    result[i] = float32[left] * (1 - frac) + float32[right] * frac;
  }
  return result;
}

function toBase64Pcm16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Grafo: mic ─┐
//             ├─> mix ─> worklet (PCM16 16kHz -> modelo)
//   ruído ─> gain ─┘ └─> monitor (opcional: ouvir o ruído localmente)
//
// `browserDsp` liga/desliga o echoCancellation/noiseSuppression/autoGainControl do
// navegador — desligar mostra como o VAD do Gemini lida com o áudio cru.
export async function startCapture(onChunk, { browserDsp, noise }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: browserDsp.echoCancellation,
      noiseSuppression: browserDsp.noiseSuppression,
      autoGainControl: browserDsp.autoGainControl,
    },
  });
  const context = new AudioContext({ sampleRate: TARGET_RATE });
  await context.resume();
  await context.audioWorklet.addModule("/pcm-capture-worklet.js");

  const source = context.createMediaStreamSource(stream);
  const mix = context.createGain();
  const noiseGain = context.createGain();
  const monitorGain = context.createGain();
  const worklet = new AudioWorkletNode(context, "pcm-capture");

  source.connect(mix);
  noiseGain.connect(mix);
  noiseGain.connect(monitorGain).connect(context.destination);
  mix.connect(worklet);

  worklet.port.onmessage = (e) => {
    const resampled = downsample(e.data.pcm, context.sampleRate, TARGET_RATE);
    onChunk(toBase64Pcm16(resampled), e.data.rms);
  };

  let generator = null;
  let generatorKey = null;

  async function setNoise({ type, file, volume, monitor }) {
    // Curva quadrática: o slider fica mais fino nos volumes baixos.
    noiseGain.gain.setTargetAtTime(volume * volume * 1.5, context.currentTime, 0.05);
    monitorGain.gain.value = monitor ? 1 : 0;
    const key = `${type}:${file?.name ?? ""}`;
    if (key === generatorKey) return;
    generator?.output.disconnect();
    generator?.stop();
    generator = null;
    generatorKey = key;
    const next = await createNoise(context, type, file);
    if (generatorKey !== key || context.state === "closed") {
      next?.stop(); // outra troca de ruído (ou stop) chegou enquanto este carregava
      return;
    }
    generator = next;
    generator?.output.connect(noiseGain);
  }

  await setNoise(noise);

  return {
    setNoise,
    stop() {
      worklet.port.onmessage = null;
      generator?.stop();
      source.disconnect();
      worklet.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      context.close();
    },
  };
}
