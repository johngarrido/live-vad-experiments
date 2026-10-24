// Presets de VAD (viram query params do /live -> RealtimeInputConfig no server.py).
// null = deixa o padrão do modelo.
export const VAD_PRESETS = [
  {
    id: "default",
    label: "Padrão do modelo",
    icon: "⚙️",
    hint: "Sem override: referência para comparar os outros cenários.",
    settings: { manual: false, startSensitivity: "default", endSensitivity: "default", prefixPaddingMs: null, silenceDurationMs: null, interruptible: true },
  },
  {
    id: "quiet",
    label: "Silencioso · ágil",
    icon: "🤫",
    hint: "Ambiente calmo: abre o turno rápido e responde logo após pausas curtas.",
    settings: { manual: false, startSensitivity: "high", endSensitivity: "high", prefixPaddingMs: 20, silenceDurationMs: 300, interruptible: true },
  },
  {
    id: "street",
    label: "Rua / café",
    icon: "🚦",
    hint: "Exige fala mais clara para abrir o turno e tolera pausas — menos falsos disparos.",
    settings: { manual: false, startSensitivity: "low", endSensitivity: "low", prefixPaddingMs: 300, silenceDurationMs: 800, interruptible: true },
  },
  {
    id: "loud",
    label: "Muito ruidoso",
    icon: "📢",
    hint: "Show, estádio, obra: ignora ruídos curtos e não deixa o ruído cortar a resposta.",
    settings: { manual: false, startSensitivity: "low", endSensitivity: "low", prefixPaddingMs: 600, silenceDurationMs: 1200, interruptible: false },
  },
  {
    id: "manual",
    label: "Push-to-talk",
    icon: "🎙️",
    hint: "VAD desligado: você segura o botão para falar (activity_start / activity_end).",
    settings: { manual: true, startSensitivity: "default", endSensitivity: "default", prefixPaddingMs: null, silenceDurationMs: null, interruptible: true },
  },
];

export const DEFAULT_VAD = VAD_PRESETS[0].settings;

export function vadQueryParams(s) {
  const params = {
    manual: String(s.manual),
    start_sensitivity: s.startSensitivity,
    end_sensitivity: s.endSensitivity,
    interruptible: String(s.interruptible),
  };
  if (s.prefixPaddingMs != null) params.prefix_padding_ms = String(s.prefixPaddingMs);
  if (s.silenceDurationMs != null) params.silence_duration_ms = String(s.silenceDurationMs);
  return params;
}

export function sameVad(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Monitor: guarda uma janela dos últimos segundos (nível do mic, segmentos de fala
// detectados pelo servidor, fala do modelo, interrupções) + métricas agregadas.

const WINDOW_MS = 20000;
const FALSE_TRIGGER_GRACE_MS = 1500;
const NEW_RESPONSE_GAP_MS = 250;

export function createVadMonitor() {
  const m = {
    levels: [], // { t, rms }
    userSegments: [], // { start, end|null, manual, transcribed }
    modelSegments: [], // { start, end|null }
    marks: [], // { t, kind: "interrupt" | "tool" }
    log: [], // { t, text, tone }
    metrics: { turns: 0, falseTriggers: 0, interruptions: 0, latencies: [] },
    awaitingAudioSince: null,
    lastAudioAt: null,
    transcribedChars: 0,
    version: 0,
  };

  const now = () => performance.now();

  function push(text, tone = "info") {
    m.log.push({ t: now(), wall: new Date(), text, tone });
    if (m.log.length > 60) m.log.shift();
    m.version++;
  }

  function prune() {
    const cutoff = now() - WINDOW_MS;
    while (m.levels.length && m.levels[0].t < cutoff) m.levels.shift();
    const keep = (s) => s.end == null || s.end > cutoff;
    m.userSegments = m.userSegments.filter(keep);
    m.modelSegments = m.modelSegments.filter(keep);
    m.marks = m.marks.filter((x) => x.t > cutoff);
  }

  function userStart(manual) {
    const open = m.userSegments.at(-1);
    if (open && open.end == null) return;
    m.userSegments.push({ start: now(), end: null, manual, chars: m.transcribedChars });
    push(manual ? "🎙️ botão pressionado (activity_start)" : "🟢 início de fala detectado (VAD)", "start");
  }

  function userEnd(manual) {
    const seg = m.userSegments.at(-1);
    if (!seg || seg.end != null) return;
    seg.end = now();
    m.metrics.turns++;
    m.awaitingAudioSince = seg.end;
    const dur = ((seg.end - seg.start) / 1000).toFixed(1);
    push(manual ? `🎙️ botão solto (activity_end) · ${dur}s` : `🔴 fim de fala (VAD) · ${dur}s`, "end");
    // Falso disparo: o VAD abriu um turno mas nenhuma palavra foi transcrita.
    setTimeout(() => {
      if (m.transcribedChars === seg.chars) {
        seg.falseTrigger = true;
        m.metrics.falseTriggers++;
        push("⚠️ turno sem transcrição — provável falso disparo por ruído", "warn");
      }
    }, FALSE_TRIGGER_GRACE_MS);
  }

  return {
    state: m,
    WINDOW_MS,
    reset() {
      Object.assign(m, createVadMonitor().state, { version: m.version + 1 });
    },
    note: push,
    micLevel(rms) {
      m.levels.push({ t: now(), rms });
      prune();
    },
    manualStart: () => userStart(true),
    manualEnd: () => userEnd(true),
    modelSpeaking(speaking) {
      const open = m.modelSegments.at(-1);
      if (speaking && !(open && open.end == null)) m.modelSegments.push({ start: now(), end: null });
      if (!speaking && open && open.end == null) open.end = now();
    },
    serverEvent(event) {
      const type = event.voiceActivity?.voiceActivityType;
      if (type === "ACTIVITY_START") userStart(false);
      if (type === "ACTIVITY_END") userEnd(false);
      if (event.inputTranscription?.text) m.transcribedChars += event.inputTranscription.text.length;
      if (event.interrupted) {
        m.metrics.interruptions++;
        m.marks.push({ t: now(), kind: "interrupt" });
        push("✋ modelo interrompido pela fala do usuário", "warn");
      }
      for (const part of event.content?.parts ?? []) {
        if (part.functionCall) {
          m.marks.push({ t: now(), kind: "tool" });
          push(`🛠️ ${part.functionCall.name}`, "tool");
        }
        if (part.inlineData?.data) {
          // Só conta como "nova resposta" se houve um intervalo no stream de áudio —
          // chunks colados são o restante da resposta anterior (ex.: NO_INTERRUPTION).
          const t = now();
          const isNewResponse = t - (m.lastAudioAt ?? 0) > NEW_RESPONSE_GAP_MS;
          m.lastAudioAt = t;
          if (isNewResponse && m.awaitingAudioSince != null) {
            const latency = t - m.awaitingAudioSince;
            m.awaitingAudioSince = null;
            m.metrics.latencies.push(latency);
            push(`🔊 1º áudio da resposta em ${Math.round(latency)} ms`, "audio");
          }
        }
      }
    },
  };
}
