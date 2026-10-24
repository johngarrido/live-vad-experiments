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
      return <SimulationCard sim={response} />;
    case "invest":
    case "redeem":
      return <OrderCard order={response} />;
    case "get_market_overview":
      return <MarketCard market={response} />;
    default:
      return null;
  }
}
