import MarketCard from "./MarketCard.jsx";
import OrderCard from "./OrderCard.jsx";
import PortfolioCard from "./PortfolioCard.jsx";
import ProductCarousel from "./ProductCarousel.jsx";
import SimulationCard from "./SimulationCard.jsx";

export const TOOL_LABELS = {
  get_market_overview: "Consultando o mercado",
  search_investments: "Buscando investimentos",
  get_portfolio: "Consultando sua carteira",
  simulate_investment: "Simulando rendimento",
  invest: "Enviando aplicação",
  redeem: "Enviando resgate",
};

export const STATUS_TEXT = {
  requer_ciencia_de_risco: "Aguardando ciência de risco",
  saldo_insuficiente: "Saldo insuficiente",
  abaixo_do_minimo: "Valor abaixo do mínimo",
  produto_nao_encontrado: "Produto não encontrado",
  posicao_nao_encontrada: "Posição não encontrada",
  valor_maior_que_posicao: "Valor maior que a posição",
  valor_invalido: "Valor inválido",
};

const ERROR_CARD_STATUSES = new Set([
  "valor_invalido",
  "produto_nao_encontrado",
  "posicao_nao_encontrada",
  "valor_maior_que_posicao",
]);

const GENERIC_ERROR_MESSAGE = "Não foi possível concluir a operação.";

function ToolErrorCard({ name, response }) {
  const title =
    response.status === "valor_invalido" && response.field === "months"
      ? "Prazo inválido"
      : STATUS_TEXT[response.status] ??
        (name === "simulate_investment" ? "Simulação não realizada" : "Operação não realizada");
  const message =
    (typeof response.message === "string" && response.message.trim()) ||
    (typeof response.retry_hint === "string" && response.retry_hint.trim()) ||
    GENERIC_ERROR_MESSAGE;

  return (
    <div className="card error-card" role="alert">
      <div className="card-title">⚠️ {title}</div>
      <div className="small">{message}</div>
    </div>
  );
}

// Card persistente para uma tool concluída. Buscas vazias e erros recuperáveis
// aparecem só na ToolNotification, para não empilhar cards inúteis.
export default function ToolCallout({ item, showPortfolio = true }) {
  if (item.status !== "done") return null;
  if (item.name === "get_portfolio" && !showPortfolio) return null;
  const card = toolResult(item.name, item.response);
  return card && <div className="tool-result">{card}</div>;
}

function toolResult(name, response) {
  if (!response || typeof response !== "object") return null;

  switch (name) {
    case "search_investments":
      return response.results?.length ? <ProductCarousel results={response.results} /> : null;
    case "get_portfolio":
      return <PortfolioCard portfolio={response} compact />;
    case "simulate_investment":
      if (ERROR_CARD_STATUSES.has(response.status)) {
        return <ToolErrorCard name={name} response={response} />;
      }
      return <SimulationCard sim={response} />;
    case "redeem":
      if (ERROR_CARD_STATUSES.has(response.status)) {
        return <ToolErrorCard name={name} response={response} />;
      }
      return <OrderCard order={response} />;
    case "invest":
      return <OrderCard order={response} />;
    case "get_market_overview":
      return <MarketCard market={response} />;
    default:
      return null;
  }
}
