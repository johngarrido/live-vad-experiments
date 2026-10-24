import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { createSession, deleteSession, liveWebSocketUrl } from "./api.js";
import { startCapture } from "./audio/capture.js";
import { createPlayer } from "./audio/player.js";
import { DEFAULT_VAD, createVadMonitor } from "./vad.js";

const LAST_SESSION_KEY = "lumi:lastSessionId";

const initialState = {
  phase: "idle", // idle | sphere | chat
  items: [],
  portfolioVersion: 0, // incrementa a cada ordem executada (para recarregar a carteira)
  error: null,
};

let nextItemId = 1;

// Deltas chegam com finished=false; um evento final repete o texto COMPLETO com finished=true.
function appendTranscription(items, role, transcription) {
  const { text = "", finished = false } = transcription;
  const last = items[items.length - 1];
  if (last && last.kind === role && !last.final) {
    const merged = finished ? text : last.text + text;
    return [...items.slice(0, -1), { ...last, text: merged, final: finished }];
  }
  return [...items, { id: nextItemId++, kind: role, text, final: finished }];
}

function finalizeDrafts(items) {
  let changed = false;
  const next = items.map((item) => {
    if ((item.kind === "user" || item.kind === "assistant") && !item.final) {
      changed = true;
      return { ...item, final: true };
    }
    return item;
  });
  return changed ? next : items;
}

function toChat(state) {
  return state.phase === "sphere" ? { ...state, phase: "chat" } : state;
}

function reducer(state, action) {
  switch (action.type) {
    case "start":
      return { ...initialState, phase: "sphere", portfolioVersion: state.portfolioVersion };
    case "stop":
      return { ...state, phase: "idle" };
    case "error":
      return { ...state, error: action.message };
    case "clear_error":
      return { ...state, error: null };
    case "user_text": {
      const items = [
        ...finalizeDrafts(state.items),
        { id: nextItemId++, kind: "user", text: action.text, final: true },
      ];
      return toChat({ ...state, items });
    }
    case "system_note":
      return { ...state, items: [...finalizeDrafts(state.items), { id: nextItemId++, kind: "note", text: action.text }] };
    case "event":
      return reduceEvent(state, action.event);
    default:
      return state;
  }
}

function reduceEvent(state, event) {
  let next = state;

  if (event.inputTranscription?.text) {
    next = toChat({
      ...next,
      items: appendTranscription(next.items, "user", event.inputTranscription),
    });
  }
  if (event.outputTranscription?.text) {
    next = {
      ...next,
      items: appendTranscription(next.items, "assistant", event.outputTranscription),
    };
  }

  for (const part of event.content?.parts ?? []) {
    if (part.functionCall) {
      const { id, name, args } = part.functionCall;
      next = toChat({
        ...next,
        items: [
          ...finalizeDrafts(next.items),
          { id: nextItemId++, kind: "tool", callId: id, name, args, status: "loading" },
        ],
      });
    }
    if (part.functionResponse) {
      const { id, name, response } = part.functionResponse;
      const items = next.items.map((item) => {
        if (
          item.kind === "tool" &&
          item.status === "loading" &&
          (item.callId === id || (!item.callId && item.name === name))
        ) {
          return { ...item, status: "done", response };
        }
        return item;
      });
      const executed = (name === "invest" || name === "redeem") && response?.status === "ok";
      next = toChat({
        ...next,
        items,
        portfolioVersion: next.portfolioVersion + (executed ? 1 : 0),
      });
    }
    if (part.text && !part.thought) {
      next = {
        ...next,
        items: appendTranscription(next.items, "assistant", { text: part.text, finished: !event.partial }),
      };
    }
  }

  if (event.turnComplete || event.interrupted) {
    next = { ...next, items: finalizeDrafts(next.items) };
  }
  if (event.errorMessage) {
    next = { ...next, error: event.errorMessage };
  }
  return next;
}

export const DEFAULT_NOISE = { type: "none", file: null, volume: 0.4, monitor: false };
export const DEFAULT_DSP = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export function useLiveSession() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [vad, setVad] = useState(DEFAULT_VAD); // configuração APLICADA na conexão atual
  const [noise, setNoiseState] = useState(DEFAULT_NOISE);
  const [browserDsp, setBrowserDspState] = useState(DEFAULT_DSP);
  const [pttActive, setPttActive] = useState(false);
  const [live, setLive] = useState(false);
  const [backend, setBackendState] = useState("adk"); // só muda com a sessão parada

  const wsRef = useRef(null);
  const captureRef = useRef(null);
  const playerRef = useRef(null);
  const sessionRef = useRef(null);
  const rafRef = useRef(0);
  const monitorRef = useRef(null);
  if (!monitorRef.current) monitorRef.current = createVadMonitor();
  const monitor = monitorRef.current;

  // Refs espelhando o estado, lidos dentro de callbacks de áudio/ws.
  const backendRef = useRef(backend);
  const vadRef = useRef(vad);
  const noiseRef = useRef(noise);
  const dspRef = useRef(browserDsp);
  const pttRef = useRef(false);
  backendRef.current = backend;
  vadRef.current = vad;
  noiseRef.current = noise;
  dspRef.current = browserDsp;

  const stopCapture = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
  }, []);

  // Tears down the live transport (ws/mic/player) without ending the logical session.
  const teardownTransport = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopCapture();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    playerRef.current?.close();
    playerRef.current = null;
    pttRef.current = false;
    setPttActive(false);
    setSpeaking(false);
    setLive(false);
    monitor.modelSpeaking(false);
  }, [stopCapture, monitor]);

  const stop = useCallback(() => {
    teardownTransport();
    sessionRef.current = null;
    dispatch({ type: "stop" });
  }, [teardownTransport]);

  useEffect(() => () => stop(), [stop]);

  // Mic -> ws. Em push-to-talk só envia áudio com o botão pressionado.
  const openCapture = useCallback(async () => {
    captureRef.current = await startCapture(
      (base64, rms) => {
        monitor.micLevel(rms);
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (vadRef.current.manual && !pttRef.current) return;
        ws.send(JSON.stringify({ blob: { mimeType: "audio/pcm;rate=16000", data: base64 } }));
      },
      { browserDsp: dspRef.current, noise: noiseRef.current }
    );
  }, [monitor]);

  // Opens a ws (reusing the existing session when present, so chat/context survive a
  // modality or VAD switch). Mic capture stays on in both modes; the player only exists for voice.
  const openTransport = useCallback(async (voice, vadSettings) => {
    const player = voice ? createPlayer() : null;
    if (player) {
      playerRef.current = player;
      await player.resume();
    }

    let session = sessionRef.current;
    if (!session) {
      session = await createSession();
      sessionRef.current = session;
      localStorage.setItem(LAST_SESSION_KEY, session.id);
    }
    const ws = new WebSocket(liveWebSocketUrl(session.id, voice, vadSettings, backendRef.current));
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (player && event.interrupted) player.flush();
      for (const part of event.content?.parts ?? []) {
        if (player && part.inlineData?.data) player.enqueueBase64Pcm(part.inlineData.data);
      }
      monitor.serverEvent(event);
      dispatch({ type: "event", event });
    };
    ws.onerror = () => dispatch({ type: "error", message: "Erro na conexão com o agente" });
    ws.onclose = (e) => {
      setLive(false);
      if (e.code !== 1000) {
        dispatch({ type: "error", message: e.reason || "Conexão encerrada" });
      }
    };

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.addEventListener("close", reject, { once: true });
    });

    await openCapture();
    setLive(true);

    const tick = () => {
      const playing = !!player && player.isPlaying() && player.getAmplitude() > 0.01;
      setSpeaking(playing);
      monitor.modelSpeaking(!!player && player.isPlaying());
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [monitor, openCapture]);

  const start = useCallback(async () => {
    dispatch({ type: "start" });
    monitor.reset();
    const prev = localStorage.getItem(LAST_SESSION_KEY);
    if (prev) {
      deleteSession(prev).catch(() => {});
      localStorage.removeItem(LAST_SESSION_KEY);
    }
    sessionRef.current = null;
    try {
      await openTransport(voiceEnabled, vadRef.current);
    } catch (err) {
      dispatch({ type: "error", message: err.message });
      stop();
    }
  }, [openTransport, voiceEnabled, stop, monitor]);

  // Reconecta na mesma sessão (conversa preservada) com nova modalidade/VAD.
  const reconnect = useCallback(
    async (voice, vadSettings) => {
      if (!wsRef.current) return;
      teardownTransport();
      try {
        await openTransport(voice, vadSettings);
      } catch (err) {
        dispatch({ type: "error", message: err.message });
        stop();
      }
    },
    [openTransport, teardownTransport, stop]
  );

  const toggleVoice = useCallback(
    async (next) => {
      setVoiceEnabled(next);
      await reconnect(next, vadRef.current);
    },
    [reconnect]
  );

  // O VAD é parte do setup da sessão Live, então trocar exige reconectar.
  const applyVad = useCallback(
    async (next) => {
      setVad(next);
      vadRef.current = next;
      dispatch({ type: "clear_error" });
      if (wsRef.current) {
        monitor.note("🔁 reconectando com nova configuração de VAD", "info");
        dispatch({ type: "system_note", text: "Configuração de VAD aplicada — sessão reconectada, conversa preservada." });
        await reconnect(voiceEnabled, next);
      }
    },
    [reconnect, voiceEnabled, monitor]
  );

  // O contexto da conversa não é compartilhado entre backends, então só troca offline.
  const setBackend = useCallback(
    (next) => {
      if (wsRef.current) return;
      backendRef.current = next;
      setBackendState(next);
      monitor.note(`🔀 backend: ${next}`, "info");
    },
    [monitor]
  );

  // Ruído muda ao vivo, sem reconectar.
  const setNoise = useCallback(
    (patch) => {
      const next = { ...noiseRef.current, ...patch };
      noiseRef.current = next;
      setNoiseState(next);
      captureRef.current?.setNoise(next).catch((err) =>
        dispatch({ type: "error", message: `Falha ao carregar ruído: ${err.message}` })
      );
      if ("type" in patch) monitor.note(`🔈 ruído simulado: ${next.type}`, "info");
    },
    [monitor]
  );

  // Constraints do getUserMedia só mudam reabrindo o microfone.
  const setBrowserDsp = useCallback(
    async (patch) => {
      const next = { ...dspRef.current, ...patch };
      dspRef.current = next;
      setBrowserDspState(next);
      if (captureRef.current) {
        stopCapture();
        try {
          await openCapture();
          monitor.note("🎛️ microfone reaberto com novo processamento do navegador", "info");
        } catch (err) {
          dispatch({ type: "error", message: err.message });
        }
      }
    },
    [stopCapture, openCapture, monitor]
  );

  // Push-to-talk (VAD manual): activity_start / activity_end delimitam o turno.
  const pttDown = useCallback(() => {
    const ws = wsRef.current;
    if (!vadRef.current.manual || pttRef.current || ws?.readyState !== WebSocket.OPEN) return;
    pttRef.current = true;
    setPttActive(true);
    playerRef.current?.flush(); // barge-in local imediato
    ws.send(JSON.stringify({ activity_start: {} }));
    monitor.manualStart();
  }, [monitor]);

  const pttUp = useCallback(() => {
    const ws = wsRef.current;
    if (!pttRef.current) return;
    pttRef.current = false;
    setPttActive(false);
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ activity_end: {} }));
    monitor.manualEnd();
  }, [monitor]);

  const sendText = useCallback((text) => {
    const ws = wsRef.current;
    if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ content: { role: "user", parts: [{ text }] } }));
    dispatch({ type: "user_text", text });
  }, []);

  const getAmplitude = useCallback(
    () => playerRef.current?.getAmplitude() ?? 0,
    []
  );

  return {
    state,
    live,
    speaking,
    voiceEnabled,
    toggleVoice,
    start,
    stop,
    sendText,
    getAmplitude,
    backend,
    setBackend,
    vad,
    applyVad,
    noise,
    setNoise,
    browserDsp,
    setBrowserDsp,
    pttActive,
    pttDown,
    pttUp,
    monitor,
  };
}
