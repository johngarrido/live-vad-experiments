export default function VoiceToggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      className={`voice-toggle ${enabled ? "on" : "off"}`}
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      title={enabled ? "Voz + texto" : "Só texto"}
    >
      <span className="voice-toggle-icon">{enabled ? "🔊" : "💬"}</span>
      <span className="voice-toggle-label">{enabled ? "Voz + texto" : "Só texto"}</span>
    </button>
  );
}
