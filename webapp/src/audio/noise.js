// Geradores de ruído sintético para testar o VAD em cenários reais. Tudo é mixado no
// sinal do microfone ANTES de ir para o modelo — o Gemini "ouve" o ruído como se
// estivesse no ambiente. Cada gerador devolve { output: AudioNode, stop() }.

export const NOISE_TYPES = [
  { id: "none", label: "Nenhum", icon: "🔇" },
  { id: "fan", label: "Ventilador", icon: "🌀", hint: "ruído rosa contínuo (ar-condicionado, ventilador)" },
  { id: "traffic", label: "Trânsito", icon: "🚗", hint: "ronco grave com carros passando e buzinas" },
  { id: "cafe", label: "Café", icon: "☕", hint: "vozes ao fundo (babble), louça e burburinho" },
  { id: "hiss", label: "Chiado", icon: "📻", hint: "ruído branco (microfone ruim, chiado de linha)" },
  { id: "file", label: "Arquivo…", icon: "📁", hint: "seu próprio áudio em loop (ex.: gravação de um bar)" },
];

function noiseBuffer(context, seconds, color) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === "white") {
      data[i] = white * 0.5;
    } else if (color === "pink") {
      // Filtro de Paul Kellet.
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 3.5;
    }
  }
  return buffer;
}

function loopSource(context, buffer) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

function bed(context, color, gain = 1) {
  const source = loopSource(context, noiseBuffer(context, 4, color));
  const g = context.createGain();
  g.gain.value = gain;
  source.connect(g);
  return { output: g, stop: () => source.stop() };
}

// Executa `fn` em intervalos aleatórios enquanto o gerador estiver ativo.
function every(minMs, maxMs, fn) {
  let timer = 0;
  let alive = true;
  const schedule = () => {
    timer = setTimeout(() => {
      if (!alive) return;
      fn();
      schedule();
    }, minMs + Math.random() * (maxMs - minMs));
  };
  schedule();
  return () => {
    alive = false;
    clearTimeout(timer);
  };
}

function traffic(context) {
  const out = context.createGain();
  const rumble = bed(context, "brown", 0.9);
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 500;
  rumble.output.connect(lowpass).connect(out);

  // Carros passando: swell de ruído filtrado.
  const stopCars = every(1500, 4500, () => {
    const now = context.currentTime;
    const src = loopSource(context, noiseBuffer(context, 3, "pink"));
    const bp = context.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(300, now);
    bp.frequency.linearRampToValueAtTime(900, now + 1.2);
    bp.frequency.linearRampToValueAtTime(250, now + 2.6);
    const g = context.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1.4, now + 1.2);
    g.gain.linearRampToValueAtTime(0, now + 2.8);
    src.connect(bp).connect(g).connect(out);
    src.stop(now + 3);
  });

  // Buzinas ocasionais — eventos curtos e fortes que testam o prefix_padding_ms.
  const stopHorns = every(5000, 11000, () => {
    const now = context.currentTime;
    const g = context.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.25, now + 0.02);
    g.gain.setValueAtTime(0.25, now + 0.35);
    g.gain.linearRampToValueAtTime(0, now + 0.4);
    g.connect(out);
    for (const f of [400, 500]) {
      const osc = context.createOscillator();
      osc.type = "square";
      osc.frequency.value = f;
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  });

  return {
    output: out,
    stop() {
      stopCars();
      stopHorns();
      rumble.stop();
    },
  };
}

// Uma "voz" sintética: fonte glotal (dente de serra) passando por dois formantes que
// variam como vogais, com envelope em ritmo de sílabas (~4–6 Hz). Várias juntas
// soam como conversa ininteligível ao fundo — o pior caso para VAD, pois É fala.
function babbleVoice(context, out) {
  const osc = context.createOscillator();
  osc.type = "sawtooth";
  const pitch = 95 + Math.random() * 150;
  osc.frequency.value = pitch;

  const f1 = context.createBiquadFilter();
  f1.type = "bandpass";
  f1.Q.value = 6;
  const f2 = context.createBiquadFilter();
  f2.type = "bandpass";
  f2.Q.value = 8;
  const env = context.createGain();
  env.gain.value = 0;
  const mix = context.createGain();
  mix.gain.value = 0.5;

  osc.connect(f1).connect(env);
  osc.connect(f2).connect(env);
  env.connect(mix).connect(out);
  osc.start();

  const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [660, 1700]];
  const stop = every(140, 280, () => {
    const now = context.currentTime;
    const [a, b] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    f1.frequency.setTargetAtTime(a, now, 0.03);
    f2.frequency.setTargetAtTime(b, now, 0.03);
    osc.frequency.setTargetAtTime(pitch * (0.85 + Math.random() * 0.35), now, 0.05);
    // Pausas entre frases: às vezes a voz se cala.
    const level = Math.random() < 0.2 ? 0 : 0.4 + Math.random() * 0.6;
    env.gain.setTargetAtTime(level, now, 0.02);
    env.gain.setTargetAtTime(level * 0.3, now + 0.09, 0.04);
  });

  return () => {
    stop();
    osc.stop();
  };
}

function cafe(context) {
  const out = context.createGain();
  const room = bed(context, "pink", 0.35);
  room.output.connect(out);
  const voices = Array.from({ length: 6 }, () => babbleVoice(context, out));

  // Louça/talheres: pings curtos e agudos.
  const stopClinks = every(700, 2500, () => {
    const now = context.currentTime;
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 2400 + Math.random() * 2600;
    const g = context.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + 0.3);
  });

  return {
    output: out,
    stop() {
      stopClinks();
      voices.forEach((stopVoice) => stopVoice());
      room.stop();
    },
  };
}

async function fileNoise(context, file) {
  const data = await file.arrayBuffer();
  const buffer = await context.decodeAudioData(data);
  const source = loopSource(context, buffer);
  return { output: source, stop: () => source.stop() };
}

export async function createNoise(context, type, file) {
  switch (type) {
    case "fan":
      return bed(context, "pink", 1);
    case "hiss":
      return bed(context, "white", 0.6);
    case "traffic":
      return traffic(context);
    case "cafe":
      return cafe(context);
    case "file":
      return file ? fileNoise(context, file) : null;
    default:
      return null;
  }
}
