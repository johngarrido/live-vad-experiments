import PortfolioCard from "./PortfolioCard.jsx";

export default function PortfolioPanel({ portfolio, loading, onClose, inline = false, onRetry }) {
  const content = loading ? (
    <div className="card muted">Carregando carteira…</div>
  ) : portfolio ? (
    <PortfolioCard portfolio={portfolio} />
  ) : (
    <div className="card portfolio-empty-card">
      <div className="card-title">💼 Sua carteira</div>
      <div className="muted small">Não foi possível carregar a carteira no momento.</div>
      {onRetry && (
        <button type="button" className="retry-button" onClick={onRetry}>
          ↻ Tentar novamente
        </button>
      )}
    </div>
  );

  if (inline) {
    return <div className="portfolio-inline">{content}</div>;
  }

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <div className="portfolio-panel">{content}</div>
    </>
  );
}
