import { vadQueryParams } from "./vad.js";

// Build do Cloud Run usa VITE_API_BASE="" (mesma origem); local cai nas portas do make run.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8010";
const WS_BASE = API_BASE
  ? API_BASE.replace(/^http/, "ws")
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
const APP_NAME = "invest_live";
const USER_ID = "joao";

// A carteira vive no mock_api (porta 8092), chaveada por account_id — não na sessão.
const MOCK_API_BASE = import.meta.env.VITE_MOCK_API_BASE ?? "http://localhost:8092";
const ACCOUNT_ID = "acc-001";

export async function fetchPortfolio() {
  const res = await fetch(`${MOCK_API_BASE}/portfolio?account_id=${ACCOUNT_ID}`);
  if (!res.ok) throw new Error(`Falha ao buscar carteira: ${res.status}`);
  return res.json();
}

export async function fetchMarket() {
  const res = await fetch(`${MOCK_API_BASE}/market`);
  if (!res.ok) throw new Error(`Falha ao buscar mercado: ${res.status}`);
  return res.json();
}

export async function createSession() {
  const res = await fetch(
    `${API_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions`,
    { method: "POST", headers: { "Content-Type": "application/json" } }
  );
  if (!res.ok) throw new Error(`Falha ao criar sessão: ${res.status}`);
  return res.json();
}

export async function deleteSession(sessionId) {
  await fetch(`${API_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

// "adk" = Runner do ADK (/live); "genai" = Live API direto pelo genai SDK (/live-genai).
export const BACKENDS = [
  { id: "adk", label: "ADK", path: "/live" },
  { id: "genai", label: "genai SDK", path: "/live-genai" },
];

export function liveWebSocketUrl(sessionId, voiceEnabled, vad, backend = "adk") {
  const params = new URLSearchParams({
    app_name: APP_NAME,
    user_id: USER_ID,
    session_id: sessionId,
    modalities: voiceEnabled ? "AUDIO" : "TEXT",
    ...vadQueryParams(vad),
  });
  // Voz (Leda), idioma pt-BR e vocabulário são fixos no server.py; o VAD vem daqui.
  const { path } = BACKENDS.find((b) => b.id === backend) ?? BACKENDS[0];
  return `${WS_BASE}${path}?${params}`;
}
