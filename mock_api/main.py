"""API mock estilo app de investimentos. Spec OpenAPI gerada pelo FastAPI vira tools do agente.

Erros de negócio voltam como 200 com campos estruturados (status, retryable, retry_hint,
valid_options) em vez de HTTP 4xx — recomendação do guia de migração do Gemini 3.8 Live
para evitar chamadas de tool redundantes em sequência.
"""

import math
from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from . import catalog, store

app = FastAPI(
    title="Aurora Invest Mock API",
    description="API mockada de investimentos (mercado, catálogo, carteira, simulação e ordens).",
    version="1.0.0",
)

# Permite que a webapp (Vite) leia a carteira direto da API mock.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5190"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Restrições só como metadado do schema OpenAPI (orientam o modelo). NÃO usar Query(gt=0):
# a validação do FastAPI viraria 422, quebrando a convenção de erro de negócio com HTTP 200.
PositiveAmount = Annotated[float, Query(json_schema_extra={"exclusiveMinimum": 0})]
PositiveMonths = Annotated[int, Query(json_schema_extra={"minimum": 1})]

_INVALID_MESSAGES = {
    "amount": (
        "O valor precisa ser maior que zero.",
        "Peça ao cliente um valor maior que zero e repita a chamada.",
    ),
    "months": (
        "O prazo precisa ser de pelo menos 1 mês.",
        "Peça ao cliente um prazo de pelo menos 1 mês e repita a chamada.",
    ),
}


def _invalid_value(field: str, value: float | int) -> dict | None:
    """Erro valor_invalido se o valor não for finito e maior que zero; senão None."""
    if math.isfinite(value) and value > 0:
        return None
    message, retry_hint = _INVALID_MESSAGES[field]
    return {
        "status": "valor_invalido",
        "retryable": True,
        "field": field,
        "message": message,
        "retry_hint": retry_hint,
        field: value if math.isfinite(value) else None,
    }


def _not_found(product_id: str) -> dict:
    return {
        "status": "produto_nao_encontrado",
        "retryable": True,
        "retry_hint": "Use search_investments para obter um product_id válido.",
        "product_id": product_id,
    }


@app.get(
    "/market",
    operation_id="get_market_overview",
    summary="Panorama do mercado",
    description="Indicadores do dia: Selic, CDI, IPCA 12 meses, Ibovespa, dólar e cotações de cripto.",
)
def get_market_overview() -> dict:
    crypto = [catalog.public_view(p) for p in catalog.PRODUCTS if p["category"] == "cripto" and "price" in p]
    return {
        **catalog.MARKET,
        "cripto": [
            {"product_id": c["id"], "name": c["name"], "price": c["price"], "variacao_dia": c["variacao_dia"]}
            for c in crypto
        ],
    }


@app.get(
    "/products",
    operation_id="search_investments",
    summary="Busca produtos de investimento",
    description=(
        "Busca produtos por termo livre (nome, ticker, tag como 'isento de ir' ou 'reserva de emergência') "
        "e/ou por categoria: 'renda fixa', 'tesouro direto', 'fundos', 'ações' ou 'cripto'. "
        "Sem parâmetros, lista todo o catálogo."
    ),
)
def search_investments(query: str | None = None, category: str | None = None) -> dict:
    results = catalog.search(query, category)
    return {
        "query": query,
        "category": category,
        "results": results,
        **({} if results else {
            "status": "sem_resultados",
            "retryable": True,
            "retry_hint": "Tente buscar só pela categoria.",
            "valid_options": catalog.CATEGORIES,
        }),
    }


@app.get(
    "/portfolio",
    operation_id="get_portfolio",
    summary="Mostra a carteira do cliente",
    description="Saldo disponível em conta, posições, rentabilidade, alocação por categoria e perfil de investidor.",
)
def get_portfolio(account_id: str) -> dict:
    return store.get_portfolio(account_id)


@app.get(
    "/simulate",
    operation_id="simulate_investment",
    summary="Simula a rentabilidade de um investimento",
    description=(
        "Projeta o valor bruto de um aporte (amount, em reais) em um produto após N meses. "
        "Não executa nenhuma ordem."
    ),
)
def simulate_investment(product_id: str, amount: PositiveAmount, months: PositiveMonths = 12) -> dict:
    if error := _invalid_value("amount", amount) or _invalid_value("months", months):
        return error
    product = catalog.get_product(product_id)
    if not product:
        return _not_found(product_id)
    gross = amount * (1 + product["rentabilidade_anual"]) ** (months / 12)
    return {
        "product_id": product_id,
        "product_name": product["name"],
        "amount": round(amount, 2),
        "months": months,
        "yield_label": product["yield_label"],
        "projected_value": round(gross, 2),
        "projected_profit": round(gross - amount, 2),
        "risk": product["risk"],
        "disclaimer": (
            "Estimativa bruta, sem garantia de rentabilidade."
            if product["category"] in ("ações", "cripto", "fundos")
            else "Estimativa bruta, antes de impostos."
        ),
    }


@app.post(
    "/orders/invest",
    operation_id="invest",
    summary="Aplica dinheiro em um produto",
    description=(
        "Executa uma aplicação de amount reais no product_id, debitando o saldo em conta. "
        "Produtos acima do perfil do investidor (ex.: cripto) exigem risk_acknowledged=true, "
        "que só deve ser enviado depois que o cliente confirmar explicitamente que entende o risco."
    ),
)
def invest(product_id: str, amount: float, account_id: str, risk_acknowledged: bool = False) -> dict:
    product = catalog.get_product(product_id)
    if not product:
        return _not_found(product_id)
    portfolio = store.get_portfolio(account_id)
    if amount < product["min_investment"]:
        return {
            "status": "abaixo_do_minimo",
            "retryable": True,
            "retry_hint": f"O aporte mínimo é R$ {product['min_investment']:.2f}.",
            "min_investment": product["min_investment"],
        }
    if amount > portfolio["cash_available"]:
        return {
            "status": "saldo_insuficiente",
            "retryable": True,
            "retry_hint": "Ofereça um valor menor ou igual ao saldo disponível.",
            "cash_available": portfolio["cash_available"],
        }
    if store.exceeds_profile(account_id, product) and not risk_acknowledged:
        return {
            "status": "requer_ciencia_de_risco",
            "retryable": True,
            "retry_hint": (
                "Explique o risco ao cliente e, só após confirmação explícita, "
                "repita a chamada com risk_acknowledged=true."
            ),
            "product_risk": product["risk"],
            "investor_profile": portfolio["investor_profile"],
        }
    return {"status": "ok", **store.invest(account_id, product, amount)}


@app.post(
    "/orders/redeem",
    operation_id="redeem",
    summary="Resgata dinheiro de uma posição",
    description="Resgata amount reais de uma posição da carteira e credita o saldo em conta.",
)
def redeem(product_id: str, amount: PositiveAmount, account_id: str) -> dict:
    if error := _invalid_value("amount", amount):
        return error
    portfolio = store.get_portfolio(account_id)
    position = next((p for p in portfolio["positions"] if p["product_id"] == product_id), None)
    if not position:
        return {
            "status": "posicao_nao_encontrada",
            "retryable": True,
            "retry_hint": "Escolha uma das posições atuais da carteira.",
            "valid_options": [p["product_id"] for p in portfolio["positions"]],
        }
    if amount > position["current_value"]:
        return {
            "status": "valor_maior_que_posicao",
            "retryable": True,
            "retry_hint": "O resgate não pode exceder o valor atual da posição.",
            "current_value": position["current_value"],
        }
    return {"status": "ok", **store.redeem(account_id, product_id, amount)}
