import { useEffect } from "react";

// Botão de push-to-talk (modo VAD manual). Segure o botão — ou a barra de espaço.
export default function PushToTalk({ active, onDown, onUp, compact = false }) {
  useEffect(() => {
    const isTyping = (e) => ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
    const down = (e) => {
      if (e.code === "Space" && !e.repeat && !isTyping(e)) {
        e.preventDefault();
        onDown();
      }
    };
    const up = (e) => {
      if (e.code === "Space" && !isTyping(e)) onUp();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onDown, onUp]);

  return (
    <button
      type="button"
      className={`ptt ${active ? "active" : ""} ${compact ? "compact" : ""}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {active ? "🎙️ ouvindo… solte para enviar" : compact ? "🎙️" : "🎙️ segure para falar (ou espaço)"}
    </button>
  );
}
