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
  speaking,
  sendText,
  getAmplitude,
  voiceEnabled,
  toggleVoice,
  manual,
  pttActive,
  pttDown,
  pttUp,
}) {
  const [draft, setDraft] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const togglePanel = () => {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
    setLoading(true);
    fetchPortfolio()
      .then(setPortfolio)
      .catch(() => setPortfolio(null))
      .finally(() => setLoading(false));
  };

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

  const status = speaking ? "falando…" : manual ? (pttActive ? "ouvindo" : "push-to-talk") : "ouvindo";

  return (
    <div className="chat">
      <header className="chat-header">
        <Sphere getAmplitude={getAmplitude} size={36} />
        <div>
          <div className="chat-title">Lumi</div>
          <div className="chat-status">{status}</div>
        </div>
        <VoiceToggle enabled={voiceEnabled} onChange={toggleVoice} />
        <button
          type="button"
          className={`icon-button ${panelOpen ? "open" : ""}`}
          onClick={togglePanel}
          aria-label="Ver carteira"
        >
          💼
        </button>
        <span className={`mic-dot ${speaking || (manual && !pttActive) ? "" : "live"}`} />
        {panelOpen && (
          <PortfolioPanel portfolio={portfolio} loading={loading} onClose={() => setPanelOpen(false)} />
        )}
      </header>

      <div className="messages" ref={scrollRef}>
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
      </div>

      <form className="composer" onSubmit={submit}>
        {manual && <PushToTalk active={pttActive} onDown={pttDown} onUp={pttUp} compact />}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ou digite uma mensagem…"
        />
        <button type="submit" className="send" disabled={!draft.trim()}>
          ↑
        </button>
      </form>
    </div>
  );
}
