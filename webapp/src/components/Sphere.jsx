import { useEffect, useRef } from "react";

export default function Sphere({ getAmplitude, size = 220 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let smooth = 0;
    let t = 0;

    const draw = () => {
      t += 0.016;
      const amp = getAmplitude();
      smooth += (amp - smooth) * 0.2;

      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const base = size * 0.28;
      const radius = base * (1 + smooth * 1.6 + Math.sin(t * 1.4) * 0.02);

      const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.7);
      glow.addColorStop(0, `rgba(46, 230, 166, ${0.25 + smooth * 1.1})`);
      glow.addColorStop(1, "rgba(123, 97, 255, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      const points = 64;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const wobble =
          Math.sin(angle * 3 + t * 2.1) * 0.04 + Math.sin(angle * 5 - t * 1.7) * 0.03;
        const r = radius * (1 + wobble * (0.4 + smooth * 4));
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const fill = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        radius * 0.1,
        cx,
        cy,
        radius * 1.1
      );
      fill.addColorStop(0, "#7dffd2");
      fill.addColorStop(0.55, "#2ee6a6");
      fill.addColorStop(1, "#6a4dff");
      ctx.fillStyle = fill;
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getAmplitude, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      aria-label="Lumi"
    />
  );
}
