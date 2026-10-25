import { useCallback, useEffect, useRef, useState } from "react";

import { fetchPortfolio } from "./api.js";
import Chat from "./components/Chat.jsx";
import { AllocationBar } from "./components/PortfolioCard.jsx";
import PortfolioPanel from "./components/PortfolioPanel.jsx";
import PushToTalk from "./components/PushToTalk.jsx";
import Sphere from "./components/Sphere.jsx";
import VadLab from "./components/VadLab.jsx";
import VoiceToggle from "./components/VoiceToggle.jsx";
import { brl } from "./format.js";
import { useLiveSession } from "./useLiveSession.js";
import { VAD_PRESETS, sameVad } from "./vad.js";

const SUGGESTIONS = [
  "“Quero investir em cripto”",
  "“Quanto rendeu minha carteira?”",
  "“Simula mil reais no Tesouro Selic por dois anos”",
  "“Como está o dólar hoje?”",
  "“Resgata quinhentos reais do CDB”",
];

const TABS = [
  { id: "home", label: "Início", icon: "🏠" },
  { id: "chat", label: "Conversa", icon: "💬" },
  { id: "portfolio", label: "Carteira", icon: "💼" },
];

const LAB_OPEN_KEY = "lumi:labOpen";
const MONITOR_OPEN_KEY = "lumi:monitorOpen";

function readStoredBool(key, fallback = true) {
  try {
    const val = localStorage.getItem(key);
    return val == null ? fallback : val !== "false";
  } catch {
    return fallback;
  }
}

function HomeCard({ portfolio, hidden, onToggleHidden }) {
  return (
    <div className="home-card">
      <div className="home-card-head">
        <span className="muted">Patrimônio total</span>
        <button type="button" className="eye" onClick={onToggleHidden} aria-label="Mostrar/ocultar valores">
          {hidden ? "🙈" : "👁️"}
        </button>
      </div>
      <div className="home-networth">{portfolio ? (hidden ? "R$ ••••••" : brl(portfolio.net_worth)) : "…"}</div>
      {portfolio && !hidden && (
        <>
          <div className="home-row">
            <span>
              Rendimento <strong className={portfolio.profit_total >= 0 ? "up" : "down"}>{brl(portfolio.profit_total)}</strong>
            </span>
            <span>
              Em conta <strong>{brl(portfolio.cash_available)}</strong>
            </span>
          </div>
          <AllocationBar allocation={portfolio.allocation_pct} />
        </>
      )}
    </div>
  );
}

export default function App() {
  const session = useLiveSession();
  const { state, live, speaking, voiceEnabled, toggleVoice, start, stop, sendText, getAmplitude } = session;
  const { vad, pttActive, pttDown, pttUp } = session;
  const { phase, items, error, portfolioVersion } = state;

  const [portfolio, setPortfolio] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState("home");

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1280px)").matches : true
  );
  const [labOpen, setLabOpen] = useState(() => readStoredBool(LAB_OPEN_KEY, true));
  const [monitorOpen, setMonitorOpen] = useState(() => readStoredBool(MONITOR_OPEN_KEY, true));
  const [activeDrawer, setActiveDrawer] = useState(null); // null | "lab" | "monitor"

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1280px)");
    const onChange = (e) => {
      setIsDesktop(e.matches);
      if (e.matches) setActiveDrawer(null);
    };
    setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!activeDrawer) return;
    const onKey = (e) => {
      if (e.key === "Escape") setActiveDrawer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeDrawer]);

  const toggleLab = useCallback((next) => {
    setLabOpen(next);
    try {
      localStorage.setItem(LAB_OPEN_KEY, String(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleMonitor = useCallback((next) => {
    setMonitorOpen(next);
    try {
      localStorage.setItem(MONITOR_OPEN_KEY, String(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  // Auto-select tab when phase transitions (idle -> sphere -> chat), while allowing free tab switching.
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === phase) return;
    if (phase === "sphere") {
      setTab("home");
    } else if (phase === "chat") {
      setTab("chat");
    }
  }, [phase]);

  const loadPortfolio = useCallback(() => {
    setPortfolioLoading(true);
    fetchPortfolio()
      .then(setPortfolio)
      .catch(() => setPortfolio(null))
      .finally(() => setPortfolioLoading(false));
  }, []);

  useEffect(() => {
    if (phase === "idle" || tab === "portfolio" || tab === "home") {
      loadPortfolio();
    }
  }, [phase, tab, portfolioVersion, loadPortfolio]);

  const preset = VAD_PRESETS.find((p) => sameVad(p.settings, vad));
  const sessionActive = phase !== "idle";

  const sharedLabProps = {
    live,
    backend: session.backend,
    setBackend: session.setBackend,
    vad,
    applyVad: session.applyVad,
    noise: session.noise,
    setNoise: session.setNoise,
    browserDsp: session.browserDsp,
    setBrowserDsp: session.setBrowserDsp,
    monitor: session.monitor,
  };

  return (
    <div className="stage">
      {!isDesktop && (
        <div className="stage-toolbar" role="toolbar" aria-label="Painéis de diagnóstico VAD">
          <button
            type="button"
            className={`stage-tool-btn ${activeDrawer === "lab" ? "active" : ""}`}
            onClick={() => setActiveDrawer((d) => (d === "lab" ? null : "lab"))}
          >
            <span>🎛️</span>
            <span>Laboratório de VAD</span>
            <small className="mono">{preset ? preset.label : "personalizado"}</small>
          </button>
          <button
            type="button"
            className={`stage-tool-btn ${activeDrawer === "monitor" ? "active" : ""}`}
            onClick={() => setActiveDrawer((d) => (d === "monitor" ? null : "monitor"))}
          >
            <span>📈</span>
            <span>Monitor de VAD</span>
            <small className={`mono ${live ? "up" : ""}`}>{live ? "● ao vivo" : "○ offline"}</small>
          </button>
        </div>
      )}

      {!isDesktop && activeDrawer && (
        <div className="drawer-backdrop" onClick={() => setActiveDrawer(null)} aria-hidden="true" />
      )}

      <VadLab
        {...sharedLabProps}
        panel="lab"
        open={labOpen}
        onToggle={toggleLab}
        isDrawer={!isDesktop}
        drawerOpen={activeDrawer === "lab"}
        onCloseDrawer={() => setActiveDrawer(null)}
      />

      <main className="phone" aria-label="Aplicativo Aurora Invest">
        <div className="notch" aria-hidden="true" />

        {tab !== "chat" && (
          <header className="app-header">
            <div>
              <div className="hello">Olá, João 👋</div>
              <div className="brand">
                aurora <span>invest</span>
              </div>
            </div>
            <div className="app-header-actions">
              <button
                type="button"
                className="mobile-drawer-btn mobile-only"
                onClick={() => setActiveDrawer("lab")}
                aria-label="Abrir Laboratório de VAD"
                title="Laboratório de VAD"
              >
                <span aria-hidden="true">🎛️</span> Lab
              </button>
              <button
                type="button"
                className="mobile-drawer-btn mobile-only"
                onClick={() => setActiveDrawer("monitor")}
                aria-label="Abrir Monitor de VAD"
                title="Monitor de VAD"
              >
                <span aria-hidden="true">📈</span> Monitor
              </button>
              {sessionActive && (
                <button
                  type="button"
                  className="header-stop-button"
                  onClick={stop}
                  title="Encerrar sessão ativa"
                >
                  <span className="live-dot" /> encerrar
                </button>
              )}
              <div className="avatar" aria-hidden="true">
                J
              </div>
            </div>
          </header>
        )}

        <div className="tab-viewport" key={`${tab}-${tab === "home" ? phase : "view"}`}>
          {tab === "home" && phase === "sphere" && (
            <div className="screen centered">
              <Sphere getAmplitude={getAmplitude} />
              <p className="tagline">
                {speaking
                  ? "Lumi está falando…"
                  : vad.manual
                    ? "segure o botão para falar"
                    : "pode falar, estou ouvindo"}
              </p>
              {vad.manual && <PushToTalk active={pttActive} onDown={pttDown} onUp={pttUp} />}
              <VoiceToggle enabled={voiceEnabled} onChange={toggleVoice} />
              <button type="button" className="stop-button" onClick={stop}>
                encerrar
              </button>
              {error && <p className="error">{error}</p>}
            </div>
          )}

          {tab === "home" && phase !== "sphere" && (
            <div className="screen home">
              <HomeCard portfolio={portfolio} hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} />

              <div className="assistant-cta">
                <Sphere getAmplitude={sessionActive ? getAmplitude : () => 0} size={102} />
                <div className="cta-text">
                  <strong>Fale com a Lumi</strong>
                  <span className="muted">
                    {sessionActive ? "sessão de voz em andamento" : "sua assessora de investimentos por voz"}
                  </span>
                </div>
                {sessionActive ? (
                  <div className="cta-live-actions">
                    <button type="button" className="talk-button" onClick={() => setTab("chat")}>
                      💬 Voltar à conversa
                    </button>
                    <button type="button" className="stop-button small" onClick={stop}>
                      encerrar sessão
                    </button>
                  </div>
                ) : (
                  <button type="button" className="talk-button" onClick={start}>
                    🎤 Começar a conversar
                  </button>
                )}
                <div className="cta-row">
                  <VoiceToggle enabled={voiceEnabled} onChange={toggleVoice} />
                  <span className="mode-chip" title="Configure no Laboratório de VAD">
                    {preset ? `${preset.icon} ${preset.label}` : "🎛️ VAD personalizado"}
                  </span>
                </div>
              </div>

              <div className="suggestions">
                <div className="muted small">Experimente dizer</div>
                {SUGGESTIONS.map((s) => (
                  <span key={s} className="suggestion">
                    {s}
                  </span>
                ))}
              </div>
              {error && <p className="error">{error}</p>}
            </div>
          )}

          {tab === "chat" && (
            <div className="screen chat-screen">
              <Chat
                items={items}
                live={sessionActive}
                speaking={speaking}
                start={start}
                sendText={sendText}
                getAmplitude={getAmplitude}
                voiceEnabled={voiceEnabled}
                toggleVoice={toggleVoice}
                manual={vad.manual}
                pttActive={pttActive}
                pttDown={pttDown}
                pttUp={pttUp}
                portfolioVersion={portfolioVersion}
                onOpenLab={() => setActiveDrawer("lab")}
                onOpenMonitor={() => setActiveDrawer("monitor")}
              />
              {(error || sessionActive) && (
                <div className="chat-footer">
                  {error && <p className="error">{error}</p>}
                  {sessionActive && (
                    <button type="button" className="stop-button small" onClick={stop}>
                      encerrar sessão
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "portfolio" && (
            <div className="screen portfolio-screen">
              <PortfolioPanel
                portfolio={portfolio}
                loading={portfolioLoading}
                inline
                onRetry={loadPortfolio}
              />
              <div className="card portfolio-cta-card">
                <div className="card-title">✨ Invista ou resgate por voz</div>
                <div className="muted small">
                  Peça à Lumi para simular rendimentos, explicar ativos ou movimentar sua carteira.
                </div>
                <div className="portfolio-cta-actions">
                  <button
                    type="button"
                    className="talk-button small"
                    onClick={() => (sessionActive ? setTab("chat") : start())}
                  >
                    {sessionActive ? "💬 Ir para a conversa" : "🎤 Falar com a Lumi"}
                  </button>
                  {sessionActive && (
                    <button type="button" className="stop-button small" onClick={stop}>
                      encerrar sessão
                    </button>
                  )}
                </div>
              </div>
              {error && <p className="error">{error}</p>}
            </div>
          )}
        </div>

        <nav className="tab-bar" aria-label="Navegação principal">
          {TABS.map((t) => {
            const isActive = tab === t.id;
            const showDot =
              (t.id === "home" && phase === "sphere") ||
              (t.id === "chat" && (phase === "chat" || items.length > 0));
            return (
              <button
                key={t.id}
                type="button"
                className={`tab-button ${isActive ? "active" : ""}`}
                onClick={() => setTab(t.id)}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="tab-icon-wrap">
                  <span className="tab-icon" aria-hidden="true">
                    {t.icon}
                  </span>
                  {showDot && <span className={`tab-badge-dot ${sessionActive ? "live" : ""}`} />}
                </span>
                <span className="tab-label">{t.label}</span>
              </button>
            );
          })}
        </nav>
      </main>

      <VadLab
        {...sharedLabProps}
        panel="monitor"
        open={monitorOpen}
        onToggle={toggleMonitor}
        isDrawer={!isDesktop}
        drawerOpen={activeDrawer === "monitor"}
        onCloseDrawer={() => setActiveDrawer(null)}
      />
    </div>
  );
}
