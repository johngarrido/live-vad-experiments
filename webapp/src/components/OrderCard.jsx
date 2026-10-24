import { brl } from "../format.js";

export default function OrderCard({ order }) {
  if (order?.status === "requer_ciencia_de_risco") {
    return (
      <div className="card warn-card">
        <div className="card-title">⚠️ Produto acima do seu perfil</div>
        <div className="small">
          Risco <strong>{order.product_risk}</strong> · seu perfil é <strong>{order.investor_profile}</strong>.
          A Lumi vai pedir sua confirmação antes de seguir.
        </div>
      </div>
    );
  }
  if (order?.status !== "ok") return null;
  const isInvest = order.type === "aplicação";
  return (
    <div className="card receipt">
      <div className="receipt-check">✓</div>
      <div className="card-title">{isInvest ? "Aplicação realizada" : "Resgate realizado"}</div>
      <div className="receipt-amount">{brl(order.amount)}</div>
      <div className="kv">
        <span className="muted">Produto</span> <span>{order.product_name}</span>
      </div>
      {order.quantity != null && (
        <div className="kv">
          <span className="muted">Quantidade</span>
          <span>
            {order.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} @ {brl(order.unit_price)}
          </span>
        </div>
      )}
      <div className="kv">
        <span className="muted">Liquidação</span> <span>{order.settlement_date}</span>
      </div>
      <div className="kv">
        <span className="muted">Saldo em conta</span> <span>{brl(order.cash_available_after)}</span>
      </div>
      <div className="kv">
        <span className="muted">Ordem</span> <span className="mono">{order.order_id}</span>
      </div>
    </div>
  );
}
