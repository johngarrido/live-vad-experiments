"""Catálogo mockado de produtos de investimento e indicadores de mercado."""

import random

ACCOUNTS = {
    "acc-001": "Conta Aurora · João",
}

# Indicadores de referência (valores fictícios, apenas para a demo).
MARKET = {
    "selic": 10.50,
    "cdi": 10.40,
    "ipca_12m": 4.20,
    "ibovespa": {"pontos": 131_250, "variacao_dia": 0.84},
    "dolar": {"cotacao": 5.42, "variacao_dia": -0.31},
}

# risco: "baixo" | "moderado" | "alto" | "muito alto"
# rentabilidade_anual: estimativa usada nas simulações (fração ao ano).
PRODUCTS = [
    # --- renda fixa ---
    {"id": "rf-cdb-liq", "name": "CDB Liquidez Diária Aurora", "category": "renda fixa", "risk": "baixo",
     "yield_label": "102% do CDI", "rentabilidade_anual": 0.1061, "min_investment": 1.0,
     "liquidity": "D+0", "tags": ["reserva de emergência", "fgc", "liquidez diária"]},
    {"id": "rf-cdb-2a", "name": "CDB Banco Aurora 2 anos", "category": "renda fixa", "risk": "baixo",
     "yield_label": "115% do CDI", "rentabilidade_anual": 0.1196, "min_investment": 500.0,
     "liquidity": "no vencimento (2 anos)", "tags": ["fgc"]},
    {"id": "rf-lci-1a", "name": "LCI Aurora 1 ano", "category": "renda fixa", "risk": "baixo",
     "yield_label": "92% do CDI (isento de IR)", "rentabilidade_anual": 0.0957, "min_investment": 1000.0,
     "liquidity": "no vencimento (1 ano)", "tags": ["isento de ir", "fgc", "imobiliário"]},
    {"id": "rf-lca-9m", "name": "LCA Aurora 9 meses", "category": "renda fixa", "risk": "baixo",
     "yield_label": "90% do CDI (isento de IR)", "rentabilidade_anual": 0.0936, "min_investment": 1000.0,
     "liquidity": "no vencimento (9 meses)", "tags": ["isento de ir", "fgc", "agronegócio"]},
    # --- tesouro direto ---
    {"id": "td-selic-29", "name": "Tesouro Selic 2029", "category": "tesouro direto", "risk": "baixo",
     "yield_label": "Selic + 0,10%", "rentabilidade_anual": 0.1060, "min_investment": 150.0,
     "liquidity": "D+1", "tags": ["governo", "reserva de emergência", "pós-fixado"]},
    {"id": "td-ipca-35", "name": "Tesouro IPCA+ 2035", "category": "tesouro direto", "risk": "moderado",
     "yield_label": "IPCA + 6,40%", "rentabilidade_anual": 0.1087, "min_investment": 35.0,
     "liquidity": "D+1 (sujeito à marcação a mercado)", "tags": ["governo", "inflação", "aposentadoria"]},
    {"id": "td-pre-27", "name": "Tesouro Prefixado 2027", "category": "tesouro direto", "risk": "moderado",
     "yield_label": "11,80% ao ano", "rentabilidade_anual": 0.1180, "min_investment": 35.0,
     "liquidity": "D+1 (sujeito à marcação a mercado)", "tags": ["governo", "prefixado"]},
    # --- fundos ---
    {"id": "fd-multi", "name": "Aurora Multimercado FIC", "category": "fundos", "risk": "moderado",
     "yield_label": "CDI + 2% (alvo)", "rentabilidade_anual": 0.1240, "min_investment": 100.0,
     "liquidity": "D+30", "tags": ["multimercado", "gestão ativa"]},
    {"id": "fd-fii", "name": "Aurora Fundo Imobiliário (AURA11)", "category": "fundos", "risk": "alto",
     "yield_label": "dividendos ~0,9% ao mês", "rentabilidade_anual": 0.1150, "min_investment": 95.0,
     "liquidity": "D+2 (bolsa)", "tags": ["fii", "dividendos", "imobiliário"]},
    # --- ações e etfs ---
    {"id": "etf-bova11", "name": "ETF BOVA11 (Ibovespa)", "category": "ações", "risk": "alto",
     "yield_label": "acompanha o Ibovespa", "rentabilidade_anual": 0.1300, "min_investment": 128.0,
     "liquidity": "D+2 (bolsa)", "tags": ["etf", "bolsa brasileira", "diversificado"], "price": 128.40},
    {"id": "etf-ivvb11", "name": "ETF IVVB11 (S&P 500)", "category": "ações", "risk": "alto",
     "yield_label": "acompanha o S&P 500 em reais", "rentabilidade_anual": 0.1400, "min_investment": 340.0,
     "liquidity": "D+2 (bolsa)", "tags": ["etf", "exterior", "dólar"], "price": 341.75},
    {"id": "ac-petr4", "name": "Petrobras PN (PETR4)", "category": "ações", "risk": "alto",
     "yield_label": "renda variável", "rentabilidade_anual": 0.1200, "min_investment": 38.0,
     "liquidity": "D+2 (bolsa)", "tags": ["ação", "petróleo", "dividendos"], "price": 38.12},
    {"id": "ac-itub4", "name": "Itaú Unibanco PN (ITUB4)", "category": "ações", "risk": "alto",
     "yield_label": "renda variável", "rentabilidade_anual": 0.1150, "min_investment": 34.0,
     "liquidity": "D+2 (bolsa)", "tags": ["ação", "bancos", "dividendos"], "price": 34.55},
    # --- cripto ---
    {"id": "cr-btc", "name": "Bitcoin (BTC)", "category": "cripto", "risk": "muito alto",
     "yield_label": "renda variável · alta volatilidade", "rentabilidade_anual": 0.25, "min_investment": 10.0,
     "liquidity": "imediata (24/7)", "tags": ["cripto", "bitcoin"], "price": 352_400.00},
    {"id": "cr-eth", "name": "Ethereum (ETH)", "category": "cripto", "risk": "muito alto",
     "yield_label": "renda variável · alta volatilidade", "rentabilidade_anual": 0.22, "min_investment": 10.0,
     "liquidity": "imediata (24/7)", "tags": ["cripto", "ethereum"], "price": 13_850.00},
    {"id": "cr-sol", "name": "Solana (SOL)", "category": "cripto", "risk": "muito alto",
     "yield_label": "renda variável · alta volatilidade", "rentabilidade_anual": 0.30, "min_investment": 10.0,
     "liquidity": "imediata (24/7)", "tags": ["cripto", "solana"], "price": 812.30},
    {"id": "cr-hash11", "name": "ETF HASH11 (cesta de cripto)", "category": "cripto", "risk": "muito alto",
     "yield_label": "cesta de criptoativos na B3", "rentabilidade_anual": 0.24, "min_investment": 45.0,
     "liquidity": "D+2 (bolsa)", "tags": ["cripto", "etf", "diversificado"], "price": 46.90},
    # Cripto fictícia (issue #6).
    {"id": "cr-jpmasc", "name": "JPMasc (JPMASC)", "category": "cripto", "risk": "muito alto",
     "yield_label": "renda variável · alta volatilidade", "rentabilidade_anual": 0.40, "min_investment": 10.0,
     "liquidity": "imediata (24/7)", "tags": ["cripto", "jpmasc"], "price": 4.20},
]

CATEGORIES = sorted({p["category"] for p in PRODUCTS})

_SYNONYMS = {
    "crypto": "cripto", "criptomoeda": "cripto", "criptomoedas": "cripto", "bitcoin": "btc",
    "tesouro": "tesouro direto", "acao": "ações", "acoes": "ações", "ação": "ações",
    "fundo": "fundos", "renda": "renda fixa", "fii": "fii", "emergencia": "reserva de emergência",
}


# Variantes faladas/transcritas de nomes com mais de uma palavra, unidas ANTES de quebrar a
# busca em termos (a busca aceita qualquer termo; "pe" sozinho casaria PETR4, petróleo etc.).
_PHRASES = {
    "jota pê masc": "jpmasc", "jota pe masc": "jpmasc", "j p masc": "jpmasc",
    "jp masc": "jpmasc", "jp mask": "jpmasc", "jpmask": "jpmasc",
}


def _join_phrases(query: str) -> str:
    for phrase, joined in _PHRASES.items():
        query = query.replace(phrase, joined)
    return query


def _normalize(term: str) -> str:
    return _SYNONYMS.get(term, term)


def public_view(p: dict) -> dict:
    view = {k: v for k, v in p.items() if k != "rentabilidade_anual"}
    if "price" in p:
        view["price"] = quote(p["id"])
        view["variacao_dia"] = _daily_change(p["id"])
    return view


def search(query: str | None = None, category: str | None = None) -> list[dict]:
    results = []
    for p in PRODUCTS:
        if category and _normalize(category.strip().lower()) not in p["category"]:
            continue
        if query:
            haystack = " ".join([p["name"], p["category"], p["risk"], p["id"], *p["tags"]]).lower()
            terms = [_normalize(t) for t in _join_phrases(query.strip().lower()).split()]
            if not any(t in haystack for t in terms):
                continue
        results.append(public_view(p))
    return results


def get_product(product_id: str) -> dict | None:
    return next((p for p in PRODUCTS if p["id"] == product_id), None)


# Cotações com uma oscilação leve por chamada, para o app parecer "vivo".
_rng = random.Random(42)
_changes: dict[str, float] = {}


def _daily_change(product_id: str) -> float:
    if product_id not in _changes:
        p = get_product(product_id)
        spread = 4.0 if p and p["category"] == "cripto" else 1.5
        _changes[product_id] = round(_rng.uniform(-spread, spread), 2)
    return _changes[product_id]


def quote(product_id: str) -> float | None:
    p = get_product(product_id)
    if not p or "price" not in p:
        return None
    jitter = 1 + random.uniform(-0.002, 0.002)
    return round(p["price"] * jitter, 2)
