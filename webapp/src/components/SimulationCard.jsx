import { brl } from "../format.js";

export default function SimulationCard({ sim }) {
  if (!sim?.projected_value) return null;
  const gain = sim.projected_value / sim.amount - 1;
  return (
    <div className="card">
      <div className="card-title">🧮 Simulação · {sim.product_name}</div>
      <div className="sim-row">
        <div>
          <div className="muted small">Hoje</div>
          <strong>{brl(sim.amount)}</strong>
        </div>
        <div className="sim-arrow">→</div>
        <div>
          <div className="muted small">Em {sim.months} meses</div>
          <strong className="up">{brl(sim.projected_value)}</strong>
        </div>
      </div>
      <div className="sim-bar">
        <span style={{ width: `${Math.min(100, (1 / (1 + gain)) * 100)}%` }} />
      </div>
      <div className="muted small">
        {sim.yield_label} · risco {sim.risk}. {sim.disclaimer}
      </div>
    </div>
  );
}
