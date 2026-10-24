import { brl, pct } from "../format.js";

export default function MarketCard({ market }) {
  if (!market?.selic) return null;
  return (
    <div className="card">
      <div className="card-title">📡 Mercado hoje</div>
      <div className="market-grid">
        <div><span className="muted small">Selic</span><strong>{market.selic.toFixed(2).replace(".", ",")}%</strong></div>
        <div><span className="muted small">CDI</span><strong>{market.cdi.toFixed(2).replace(".", ",")}%</strong></div>
        <div><span className="muted small">IPCA 12m</span><strong>{market.ipca_12m.toFixed(2).replace(".", ",")}%</strong></div>
        <div>
          <span className="muted small">Ibovespa</span>
          <strong>{market.ibovespa.pontos.toLocaleString("pt-BR")}</strong>
          <small className={market.ibovespa.variacao_dia >= 0 ? "up" : "down"}>{pct(market.ibovespa.variacao_dia)}</small>
        </div>
        <div>
          <span className="muted small">Dólar</span>
          <strong>{brl(market.dolar.cotacao)}</strong>
          <small className={market.dolar.variacao_dia >= 0 ? "up" : "down"}>{pct(market.dolar.variacao_dia)}</small>
        </div>
      </div>
      <ul className="position-list">
        {(market.cripto ?? []).map((c) => (
          <li key={c.product_id}>
            <span>🪙 {c.name}</span>
            <span className="position-value">
              {brl(c.price)} <small className={c.variacao_dia >= 0 ? "up" : "down"}>{pct(c.variacao_dia)}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
