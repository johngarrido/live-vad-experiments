import { useEffect, useState } from "react";

import { brl } from "../format.js";
import { TOOL_LABELS } from "./ToolCallout.jsx";

// How long each completed operation lingers before the notification advances to
// the next one, so the user can read each step instead of seeing only the last.
const STEP_MS = 1600;

const TOOL_ICONS = {
  get_market_overview: "📡",
  search_investments: "🔍",
  get_portfolio: "💼",
  simulate_investment: "🧮",
  invest: "✅",
  redeem: "↩️",
};

const STATUS_TEXT = {
  requer_ciencia_de_risco: "Aguardando ciência de risco",
  saldo_insuficiente: "Saldo insuficiente",
  abaixo_do_minimo: "Valor abaixo do mínimo",
  produto_nao_encontrado: "Produto não encontrado",
  posicao_nao_encontrada: "Posição não encontrada",
  valor_maior_que_posicao: "Valor maior que a posição",
};

function summarize(item) {
  const { name, status, args, response } = item;
  const term = args?.category ?? args?.query;

  if (status !== "done") {
    const text =
      name === "search_investments" && term ? `Buscando “${term}”…` : `${TOOL_LABELS[name] ?? name}…`;
    return { icon: null, text, loading: true };
  }

  const r = response && typeof response === "object" ? response : {};
  if (r.status && r.status !== "ok" && STATUS_TEXT[r.status]) {
    return { icon: "⚠️", text: STATUS_TEXT[r.status] };
  }
  switch (name) {
    case "search_investments": {
      const n = r.results?.length ?? 0;
      const label = term ? ` em “${term}”` : "";
      return { icon: TOOL_ICONS[name], text: n ? `${n} ${n === 1 ? "opção" : "opções"}${label}` : `Nada encontrado${label}` };
    }
    case "get_portfolio":
      return { icon: TOOL_ICONS[name], text: `Patrimônio ${brl(r.net_worth)}` };
    case "simulate_investment":
      return { icon: TOOL_ICONS[name], text: `${brl(r.amount)} → ${brl(r.projected_value)} em ${r.months} meses` };
    case "invest":
      return { icon: TOOL_ICONS[name], text: `Aplicação de ${brl(r.amount)} executada` };
    case "redeem":
      return { icon: TOOL_ICONS[name], text: `Resgate de ${brl(r.amount)} executado` };
    case "get_market_overview":
      return { icon: TOOL_ICONS[name], text: "Indicadores atualizados" };
    default:
      return { icon: null, text: TOOL_LABELS[name] ?? name };
  }
}

// One inline "popup" that narrates every tool operation in turn, swapping the message
// in the SAME element instead of stacking a card per operation.
export default function ToolNotification({ tools }) {
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (cursor >= tools.length - 1) return;
    const t = setTimeout(() => setCursor((c) => Math.min(c + 1, tools.length - 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [cursor, tools.length]);

  if (!tools.length) return null;

  const idx = Math.min(cursor, tools.length - 1);
  const item = tools[idx];
  const { icon, text, loading } = summarize(item);

  return (
    <div className="tool-notif">
      {loading ? <span className="spinner" /> : <span className="tool-notif-icon">{icon}</span>}
      <span key={`${item.id}-${item.status}`} className="tool-notif-text">
        {text}
      </span>
      {tools.length > 1 && (
        <span className="tool-notif-count">
          {idx + 1}/{tools.length}
        </span>
      )}
    </div>
  );
}
