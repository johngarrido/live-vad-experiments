import { useEffect, useRef, useState } from "react";

import { fetchPortfolio } from "../api.js";
import PortfolioPanel from "./PortfolioPanel.jsx";
import PushToTalk from "./PushToTalk.jsx";
import Sphere from "./Sphere.jsx";
import ToolCallout from "./ToolCallout.jsx";
import ToolNotification from "./ToolNotification.jsx";
import VoiceToggle from "./VoiceToggle.jsx";

export default function Chat({
  items,
  live = true,
  speaking,
  start,
  sendText,
  getAmplitude,
  voiceEnabled,
  toggleVoice,
  manual,
  pttActive,
  pttDown,
  pttUp,
  portfolioVersion = 0,
  onOpenLab,
  onOpenMonitor,
}) {
  const [draft, setDraft] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const loadPortfolio = () => {
    setLoading(true);
    fetchPortfolio()
      .then(setPortfolio)
      .catch(() => setPortfolio(null))
      .finally(() => setLoading(false));
  };

  const togglePanel = () => {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
    loadPortfolio();
  };

  useEffect(() => {
    if (panelOpen) loadPortfolio();
  }, [portfolioVersion]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items]);

  const submit = (e) => {
    e.preventDefault();
    sendText(draft);
    setDraft("");
  };

  const tools = items.filter((item) => item.kind === "tool");

  // A carteira é cumulativa: só o card mais recente fica visível.
  let lastPortfolioId = null;
  for (const item of tools) {
    if (item.status === "done" && item.name === "get_portfolio") lastPortfolioId = item.id;
  }

  const status = !live
    ? "pronta para conversar"
    : speaking
      ? "falando…"
      : manual
        ? pttActive
          ? "ouvindo"
          : "push-to-talk"
        : "ouvindo";

  return (
    <div className="chat">
      <header className="chat-header">
        <Sphere getAmplitude={getAmplitude} size={36} />
        <div className="chat-header-meta">
          <div className="chat-title">Lumi</div>
          <div className="chat-status">{status}</div>
        </div>
        <VoiceToggle enabled={voiceEnabled} onChange={toggleVoice} />
        {onOpenLab && (
          <button
            type="button"
            className="mobile-drawer-btn mobile-only"
            onClick={onOpenLab}
            aria-label="Abrir Laboratório de VAD"
            title="Laboratório de VAD"
          >
            <span aria-hidden="true">🎛️</span> Lab
          </button>
        )}
        {onOpenMonitor && (
          <button
            type="button"
            className="mobile-drawer-btn mobile-only"
            onClick={onOpenMonitor}
            aria-label="Abrir Monitor de VAD"
            title="Monitor de VAD"
          >
            <span aria-hidden="true">📈</span> Monitor
          </button>
        )}
        <button
          type="button"
          className={`icon-button ${panelOpen ? "open" : ""}`}
          onClick={togglePanel}
          aria-label="Ver carteira"
        >
          💼
        </button>
        <span className={`mic-dot ${!live || speaking || (manual && !pttActive) ? "" : "live"}`} />
        {panelOpen && (
          <PortfolioPanel
            portfolio={portfolio}
            loading={loading}
            onClose={() => setPanelOpen(false)}
            onRetry={loadPortfolio}
          />
        )}
      </header>

      <div className="messages" ref={scrollRef}>
        {items.length === 0 ? (
          <div className="chat-empty">
            <Sphere getAmplitude={live ? getAmplitude : () => 0} size={108} />
            <div className="chat-empty-text">
              <strong>{live ? "Lumi está na escuta" : "Converse com a Lumi"}</strong>
              <span className="muted small">
                {live
                  ? manual
                    ? "Segure o botão abaixo para falar ou envie uma mensagem de texto."
                    : "Fale no microfone ou digite uma mensagem abaixo para começar."
                  : "Inicie uma sessão para consultar o mercado, simular rendimentos ou movimentar sua carteira."}
              </span>
            </div>
            {!live && start && (
              <button type="button" className="talk-button" onClick={start}>
                🎤 Começar a conversar
              </button>
            )}
          </div>
        ) : (
          <>
            {items.map((item) => {
              if (item.kind === "tool")
                return <ToolCallout key={item.id} item={item} showPortfolio={item.id === lastPortfolioId} />;
              if (item.kind === "note")
                return (
                  <div key={item.id} className="system-note">
                    {item.text}
                  </div>
                );
              return (
                <div key={item.id} className={`bubble ${item.kind}`}>
                  {item.text}
                  {!item.final && <span className="cursor">▍</span>}
                </div>
              );
            })}
            <ToolNotification tools={tools} />
          </>
        )}
      </div>

      {(live || items.length > 0) && (
        <form className="composer" onSubmit={submit}>
          {live && manual && <PushToTalk active={pttActive} onDown={pttDown} onUp={pttUp} compact />}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!live}
            placeholder={live ? "Ou digite uma mensagem…" : "Sessão encerrada — inicie uma nova conversa"}
          />
          <button type="submit" className="send" disabled={!live || !draft.trim()} aria-label="Enviar mensagem">
            ↑
          </button>
        </form>
      )}
    </div>
  );
}
