import { CATEGORY_ICON, brl, pct } from "../format.js";

const ALLOCATION_COLORS = ["#2ee6a6", "#7b61ff", "#ffb547", "#4cc9f0", "#ff6b8b"];

export function AllocationBar({ allocation }) {
  const entries = Object.entries(allocation ?? {});
  if (!entries.length) return null;
  return (
    <>
      <div className="alloc-bar">
        {entries.map(([cat, value], i) => (
          <span key={cat} style={{ width: `${value}%`, background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }} />
        ))}
      </div>
      <div className="alloc-legend">
        {entries.map(([cat, value], i) => (
          <span key={cat}>
            <i style={{ background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }} />
            {cat} {value.toFixed(0)}%
          </span>
        ))}
      </div>
    </>
  );
}

export default function PortfolioCard({ portfolio, compact = false }) {
  if (!portfolio?.positions) return null;
  return (
    <div className="card">
      <div className="card-title">💼 Sua carteira</div>
      <div className="networth">
        <span className="muted">Patrimônio</span>
        <strong>{brl(portfolio.net_worth)}</strong>
      </div>
      <div className="kv">
        <span className="muted">Investido</span> <span>{brl(portfolio.invested_total)}</span>
      </div>
      <div className="kv">
        <span className="muted">Saldo em conta</span> <span>{brl(portfolio.cash_available)}</span>
      </div>
      <div className="kv">
        <span className="muted">Rendimento</span>
        <span className={portfolio.profit_total >= 0 ? "up" : "down"}>{brl(portfolio.profit_total)}</span>
      </div>
      <AllocationBar allocation={portfolio.allocation_pct} />
      {!compact && (
        <ul className="position-list">
          {portfolio.positions.map((p) => (
            <li key={p.product_id}>
              <span>
                {CATEGORY_ICON[p.category] ?? "💼"} {p.name}
              </span>
              <span className="position-value">
                {brl(p.current_value)} <small className={p.profit >= 0 ? "up" : "down"}>{pct(p.profit_pct)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
