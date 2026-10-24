import { CATEGORY_ICON, RISK_TONE, brl, pct } from "../format.js";

export default function ProductCarousel({ results }) {
  return (
    <div className="carousel">
      {results.map((p) => (
        <div className="product-card" key={p.id}>
          <div className="product-top">
            <span className="product-icon">{CATEGORY_ICON[p.category] ?? "💼"}</span>
            <span className={`risk risk-${RISK_TONE[p.risk]}`}>risco {p.risk}</span>
          </div>
          <div className="product-name">{p.name}</div>
          <div className="product-yield">{p.yield_label}</div>
          {p.price != null && (
            <div className="product-price">
              {brl(p.price)}{" "}
              <span className={p.variacao_dia >= 0 ? "up" : "down"}>{pct(p.variacao_dia)}</span>
            </div>
          )}
          <div className="product-meta">
            <span>mín. {brl(p.min_investment)}</span>
            <span>liquidez {p.liquidity}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
