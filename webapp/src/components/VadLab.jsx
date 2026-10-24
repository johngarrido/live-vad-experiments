import { useEffect, useRef, useState } from "react";

import { BACKENDS } from "../api.js";
import { NOISE_TYPES } from "../audio/noise.js";
import { VAD_PRESETS, sameVad } from "../vad.js";
import VadTimeline from "./VadTimeline.jsx";

const SENSITIVITY = [
  { id: "default", label: "padrão" },
  { id: "high", label: "alta" },
  { id: "low", label: "baixa" },
];

function Segmented({ value, options, onChange, disabled }) {
  return (
    <div className={`segmented ${disabled ? "disabled" : ""}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? "on" : ""}
          onClick={() => onChange(o.id)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Slider com opção "padrão do modelo" (null = não envia o campo).
function MsSlider({ label, hint, value, min, max, step, fallback, onChange, disabled }) {
  const isDefault = value == null;
  return (
    <div className={`field ${disabled ? "disabled" : ""}`}>
      <div className="field-head">
        <span title={hint}>{label}</span>
        <span className="mono">{isDefault ? "padrão" : `${value} ms`}</span>
      </div>
      <div className="slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? fallback}
          disabled={disabled || isDefault}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={isDefault}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? null : fallback)}
          />
          padrão
        </label>
      </div>
      <div className="field-hint">{hint}</div>
    </div>
  );
}

function Metrics({ monitor }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 300);
    return () => clearInterval(id);
  }, []);

  const { metrics, log } = monitor.state;
  const lat = metrics.latencies;
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
  const last = lat.length ? Math.round(lat.at(-1)) : null;

  return (
    <>
      <div className="metrics">
        <div>
          <strong>{metrics.turns}</strong>
          <span>turnos</span>
        </div>
        <div className={metrics.falseTriggers ? "warn" : ""}>
          <strong>{metrics.falseTriggers}</strong>
          <span>falsos disparos</span>
        </div>
        <div>
          <strong>{metrics.interruptions}</strong>
          <span>interrupções</span>
        </div>
        <div>
          <strong>{last ?? "—"}</strong>
          <span>latência últ. (ms)</span>
        </div>
        <div>
          <strong>{avg ?? "—"}</strong>
          <span>latência méd. (ms)</span>
        </div>
      </div>
      <ul className="vad-log">
        {log.length === 0 && (
          <li className="muted">Os eventos de VAD aparecem aqui quando a sessão começar.</li>
        )}
        {log
          .slice(-40)
          .reverse()
          .map((entry, i) => (
            <li key={log.length - i} className={`tone-${entry.tone}`}>
              <span className="mono muted">
                {entry.wall.toLocaleTimeString("pt-BR")}.
                {String(entry.wall.getMilliseconds()).padStart(3, "0")}
              </span>{" "}
              {entry.text}
            </li>
          ))}
      </ul>
    </>
  );
}

export default function VadLab({ live, backend, setBackend, vad, applyVad, noise, setNoise, browserDsp, setBrowserDsp, monitor }) {
  const [draft, setDraft] = useState(vad);
  const fileRef = useRef(null);

  useEffect(() => setDraft(vad), [vad]);

  const pending = !sameVad(draft, vad);
  const activePreset = VAD_PRESETS.find((p) => sameVad(p.settings, draft));
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const manual = draft.manual;

  const pickPreset = (preset) => {
    setDraft(preset.settings);
    if (!live) applyVad(preset.settings); // sem sessão: aplica direto, vale na próxima conexão
  };

  return (
    <>
      <aside className="lab">
        <header className="lab-header">
          <div>
            <div className="lab-title">Laboratório de VAD</div>
            <div className="lab-sub mono">gemini-3.8-live · pt-BR · voz Leda</div>
          </div>
          <span className={`live-pill ${live ? "on" : ""}`}>{live ? "● ao vivo" : "○ offline"}</span>
        </header>

        <section className="lab-section">
          <div className="lab-section-title">0 · Backend</div>
          <Segmented value={backend} options={BACKENDS} onChange={setBackend} disabled={live} />
          <div className="field-hint">
            {live
              ? "Encerre a sessão para trocar — o contexto não é compartilhado entre backends."
              : backend === "adk"
                ? "Runner do ADK: tools via OpenAPIToolset, callbacks e histórico em SQLite."
                : "Live API direto pelo genai SDK: tools, account_id e contexto (session resumption) feitos à mão."}
          </div>
        </section>

        <section className="lab-section">
          <div className="lab-section-title">1 · Cenário de VAD (servidor)</div>
          <div className="preset-grid">
            {VAD_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset ${activePreset?.id === p.id ? "on" : ""}`}
                onClick={() => pickPreset(p)}
                title={p.hint}
              >
                <span>{p.icon}</span> {p.label}
              </button>
            ))}
          </div>
          <div className="field-hint">{activePreset ? activePreset.hint : "Configuração personalizada."}</div>

          <details className="advanced">
            <summary>Ajuste fino (AutomaticActivityDetection)</summary>
            <div className={`field ${manual ? "disabled" : ""}`}>
              <div className="field-head">
                <span>start_of_speech_sensitivity</span>
              </div>
              <Segmented
                value={draft.startSensitivity}
                options={SENSITIVITY}
                onChange={(v) => patch({ startSensitivity: v })}
                disabled={manual}
              />
              <div className="field-hint">
                baixa = precisa de fala mais clara para abrir o turno (menos falsos disparos)
              </div>
            </div>
            <div className={`field ${manual ? "disabled" : ""}`}>
              <div className="field-head">
                <span>end_of_speech_sensitivity</span>
              </div>
              <Segmented
                value={draft.endSensitivity}
                options={SENSITIVITY}
                onChange={(v) => patch({ endSensitivity: v })}
                disabled={manual}
              />
              <div className="field-hint">baixa = tolera pausas maiores antes de encerrar o turno</div>
            </div>
            <MsSlider
              label="prefix_padding_ms"
              hint="fala contínua necessária para confirmar o início (filtra buzinas, tosses, batidas)"
              value={draft.prefixPaddingMs}
              min={0}
              max={1000}
              step={20}
              fallback={300}
              onChange={(v) => patch({ prefixPaddingMs: v })}
              disabled={manual}
            />
            <MsSlider
              label="silence_duration_ms"
              hint="silêncio necessário para considerar fim de fala"
              value={draft.silenceDurationMs}
              min={100}
              max={2500}
              step={50}
              fallback={800}
              onChange={(v) => patch({ silenceDurationMs: v })}
              disabled={manual}
            />
            <label className="check field">
              <input
                type="checkbox"
                checked={draft.interruptible}
                onChange={(e) => patch({ interruptible: e.target.checked })}
              />
              fala do usuário interrompe o modelo <span className="mono muted">(activity_handling)</span>
            </label>
            <label className="check field">
              <input type="checkbox" checked={manual} onChange={(e) => patch({ manual: e.target.checked })} />
              VAD desligado · push-to-talk <span className="mono muted">(disabled=true)</span>
            </label>
          </details>

          <button
            type="button"
            className={`apply ${pending ? "pending" : ""}`}
            disabled={!pending}
            onClick={() => applyVad(draft)}
          >
            {pending ? (live ? "Aplicar e reconectar" : "Aplicar") : "Configuração aplicada ✓"}
          </button>
        </section>

        <section className="lab-section">
          <div className="lab-section-title">2 · Ruído simulado (mixado no microfone)</div>
          <div className="preset-grid noise">
            {NOISE_TYPES.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`preset ${noise.type === n.id ? "on" : ""}`}
                title={n.hint}
                onClick={() => (n.id === "file" ? fileRef.current?.click() : setNoise({ type: n.id }))}
              >
                <span>{n.icon}</span> {n.id === "file" && noise.file ? noise.file.name.slice(0, 12) : n.label}
              </button>
            ))}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setNoise({ type: "file", file });
              e.target.value = "";
            }}
          />
          <div className="field">
            <div className="field-head">
              <span>volume do ruído</span>
              <span className="mono">{Math.round(noise.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={noise.volume}
              onChange={(e) => setNoise({ volume: Number(e.target.value) })}
            />
          </div>
          <label className="check field">
            <input
              type="checkbox"
              checked={noise.monitor}
              onChange={(e) => setNoise({ monitor: e.target.checked })}
            />
            ouvir o ruído no alto-falante <span className="muted">(use fone)</span>
          </label>

          <div className="lab-section-title sub">Processamento do navegador (getUserMedia)</div>
          <div className="dsp-row">
            {[
              ["noiseSuppression", "supressão de ruído"],
              ["echoCancellation", "cancelamento de eco"],
              ["autoGainControl", "ganho automático"],
            ].map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={browserDsp[key]}
                  onChange={(e) => setBrowserDsp({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="field-hint">
            Desligue a supressão para mandar o áudio cru e ver só o VAD do Gemini trabalhando. O ruído
            simulado entra depois desse processamento, então ele sempre chega ao modelo.
          </div>
        </section>
      </aside>

      <aside className="lab">
        <header className="lab-header">
          <div>
            <div className="lab-title">Monitor de VAD</div>
            <div className="lab-sub mono">explicit_vad_signal · eventos do servidor</div>
          </div>
        </header>
        <section className="lab-section grow">
          <div className="lab-section-title">Linha do tempo · últimos 20s</div>
          <VadTimeline monitor={monitor} />
          <div className="legend">
            <span>
              <i className="lg-user" />
              VAD
            </span>
            <span>
              <i className="lg-manual" />
              manual
            </span>
            <span>
              <i className="lg-false" />
              falso disparo
            </span>
            <span>
              <i className="lg-model" />
              Lumi
            </span>
            <span>
              <i className="lg-int" />
              interrupção
            </span>
            <span>
              <i className="lg-tool" />
              tool
            </span>
          </div>
          <Metrics monitor={monitor} />
        </section>
      </aside>
    </>
  );
}
