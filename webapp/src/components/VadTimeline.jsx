import { useEffect, useRef } from "react";

const LANES = [
  { key: "mic", label: "MIC (com ruído)", y: 6, h: 44 },
  { key: "user", label: "VOCÊ · VAD", y: 64, h: 18 },
  { key: "model", label: "LUMI", y: 96, h: 18 },
];
const HEIGHT = 124;

// Linha do tempo rolante dos últimos ~20s: nível do microfone (já com o ruído
// simulado), turnos de fala detectados pelo VAD do servidor, fala do modelo,
// interrupções (vermelho) e chamadas de tool (losango).
export default function VadTimeline({ monitor, width = 336 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0;

    const draw = () => {
      const m = monitor.state;
      const now = performance.now();
      const t0 = now - monitor.WINDOW_MS;
      const x = (t) => ((t - t0) / monitor.WINDOW_MS) * width;

      ctx.clearRect(0, 0, width, HEIGHT);

      for (const lane of LANES) {
        ctx.fillStyle = "rgba(255,255,255,0.035)";
        ctx.fillRect(0, lane.y, width, lane.h);
      }

      // Nível do mic: escala log, ~-60 dBFS..0 dBFS.
      const mic = LANES[0];
      for (const { t, rms } of m.levels) {
        const db = 20 * Math.log10(Math.max(rms, 1e-4));
        const v = Math.max(0, Math.min(1, (db + 60) / 60));
        const h = v * mic.h;
        ctx.fillStyle = v > 0.55 ? "rgba(46,230,166,0.9)" : "rgba(160,170,200,0.55)";
        ctx.fillRect(x(t), mic.y + mic.h - h, Math.max(1, width / 500), h);
      }

      const drawSegments = (segments, lane, colorFor) => {
        for (const s of segments) {
          const x1 = x(s.start);
          const x2 = x(s.end ?? now);
          ctx.fillStyle = colorFor(s);
          ctx.beginPath();
          ctx.roundRect(x1, lane.y + 2, Math.max(2, x2 - x1), lane.h - 4, 4);
          ctx.fill();
        }
      };
      drawSegments(m.userSegments, LANES[1], (s) =>
        s.falseTrigger ? "#ffb547" : s.manual ? "#4cc9f0" : "#2ee6a6"
      );
      drawSegments(m.modelSegments, LANES[2], () => "#7b61ff");

      for (const mark of m.marks) {
        const mx = x(mark.t);
        if (mark.kind === "interrupt") {
          ctx.strokeStyle = "#ff5c7a";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(mx, LANES[1].y - 2);
          ctx.lineTo(mx, LANES[2].y + LANES[2].h + 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#ffd166";
          ctx.save();
          ctx.translate(mx, LANES[2].y - 6);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-3, -3, 6, 6);
          ctx.restore();
        }
      }

      ctx.font = "600 9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(220,225,245,0.55)";
      for (const lane of LANES) ctx.fillText(lane.label, 4, lane.y + 10);
      ctx.fillText("-20s", 4, HEIGHT - 1);
      ctx.fillText("agora", width - 34, HEIGHT - 1);

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [monitor, width]);

  return <canvas ref={canvasRef} style={{ width, height: HEIGHT }} className="vad-timeline" />;
}
