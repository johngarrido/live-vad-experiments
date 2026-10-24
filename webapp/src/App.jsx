import { useEffect, useState } from "react";

import { fetchPortfolio } from "./api.js";
import Chat from "./components/Chat.jsx";
import { AllocationBar } from "./components/PortfolioCard.jsx";
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
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (phase !== "idle") return;
    fetchPortfolio().then(setPortfolio).catch(() => setPortfolio(null));
  }, [phase, portfolioVersion]);

  const preset = VAD_PRESETS.find((p) => sameVad(p.settings, vad));

  return (
    <div className="stage">
      <div className="phone">
        <div className="notch" />

        {phase === "idle" && (
          <div className="screen home">
            <div className="home-top">
              <div>
                <div className="hello">Olá, João 👋</div>
                <div className="brand">
                  aurora <span>invest</span>
                </div>
              </div>
              <div className="avatar">J</div>
            </div>

            <HomeCard portfolio={portfolio} hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} />

            <div className="assistant-cta">
              <Sphere getAmplitude={() => 0} size={120} />
              <div className="cta-text">
                <strong>Fale com a Lumi</strong>
                <span className="muted">sua assessora de investimentos por voz</span>
              </div>
              <button className="talk-button" onClick={start}>
                🎤 Começar a conversar
              </button>
              <div className="cta-row">
                <VoiceToggle enabled={voiceEnabled} onChange={toggleVoice} />
                <span className="mode-chip" title="Configure no Laboratório de VAD ao lado">
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

        {phase === "sphere" && (
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
            <button className="stop-button" onClick={stop}>
              encerrar
            </button>
            {error && <p className="error">{error}</p>}
          </div>
        )}

        {phase === "chat" && (
          <div className="screen">
            <Chat
              items={items}
              speaking={speaking}
              sendText={sendText}
              getAmplitude={getAmplitude}
              voiceEnabled={voiceEnabled}
              toggleVoice={toggleVoice}
              manual={vad.manual}
              pttActive={pttActive}
              pttDown={pttDown}
              pttUp={pttUp}
            />
            <div className="chat-footer">
              {error && <p className="error">{error}</p>}
              <button className="stop-button small" onClick={stop}>
                encerrar sessão
              </button>
            </div>
          </div>
        )}
      </div>

      <VadLab
        live={live}
        backend={session.backend}
        setBackend={session.setBackend}
        vad={vad}
        applyVad={session.applyVad}
        noise={session.noise}
        setNoise={session.setNoise}
        browserDsp={session.browserDsp}
        setBrowserDsp={session.setBrowserDsp}
        monitor={session.monitor}
      />
    </div>
  );
}
