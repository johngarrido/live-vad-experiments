import PortfolioCard from "./PortfolioCard.jsx";

export default function PortfolioPanel({ portfolio, loading, onClose }) {
  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <div className="portfolio-panel">
        {loading ? (
          <div className="card muted">Carregando carteira…</div>
        ) : portfolio ? (
          <PortfolioCard portfolio={portfolio} />
        ) : (
          <div className="card muted">Não foi possível carregar a carteira.</div>
        )}
      </div>
    </>
  );
}
