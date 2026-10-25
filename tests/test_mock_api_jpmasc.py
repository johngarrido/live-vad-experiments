"""Issue #6: cripto fictícia JPMASC integrada ao catálogo, mercado, simulação e ordens."""

import pytest
from fastapi.testclient import TestClient

from mock_api import catalog, store
from mock_api.main import app

ACCOUNT = "acc-001"
JPMASC = "cr-jpmasc"


@pytest.fixture(autouse=True)
def reset_store(monkeypatch):
    monkeypatch.setattr(store, "_accounts", {ACCOUNT: store._seed()})


@pytest.fixture
def client():
    return TestClient(app)


def _ids(res):
    return [p["product_id"] if "product_id" in p else p["id"] for p in res.json()["results"]]


def _portfolio(client):
    return client.get("/portfolio", params={"account_id": ACCOUNT}).json()


def _invest(client, amount, **extra):
    return client.post(
        "/orders/invest",
        params={"product_id": JPMASC, "amount": amount, "account_id": ACCOUNT, **extra},
    )


def test_catalog_entry():
    p = catalog.get_product(JPMASC)
    assert p["name"] == "JPMasc (JPMASC)"
    assert p["category"] == "cripto"
    assert p["risk"] == "muito alto"
    assert p["price"] == 4.20
    assert p["min_investment"] == 10.0
    assert p["liquidity"] == "imediata (24/7)"


def test_market_lists_jpmasc(client):
    crypto = client.get("/market").json()["cripto"]
    jp = next(c for c in crypto if c["product_id"] == JPMASC)
    assert jp["name"] == "JPMasc (JPMASC)"
    assert jp["price"] == pytest.approx(4.20, rel=0.003)  # jitter de ±0,2%
    assert isinstance(jp["variacao_dia"], float)


def test_products_by_category(client):
    res = client.get("/products", params={"category": "cripto"})
    jp = next(p for p in res.json()["results"] if p["id"] == JPMASC)
    assert "rentabilidade_anual" not in jp  # public_view
    assert jp["price"] == pytest.approx(4.20, rel=0.003)
    assert "variacao_dia" in jp


@pytest.mark.parametrize("query", ["jpmasc", "JPMASC", "JPMasc"])
def test_products_by_query(client, query):
    assert _ids(client.get("/products", params={"query": query})) == [JPMASC]


@pytest.mark.parametrize("query", ["jp masc", "jota pe masc", "jota pê masc", "j p masc", "jp mask", "jpmask"])
def test_products_spoken_variants_find_only_jpmasc(client, query):
    assert _ids(client.get("/products", params={"query": query})) == [JPMASC]


def test_existing_search_unaffected(client):
    assert _ids(client.get("/products", params={"query": "bitcoin"})) == ["cr-btc"]
    assert "ac-petr4" in _ids(client.get("/products", params={"query": "petr4"}))


def test_simulate(client):
    res = client.get("/simulate", params={"product_id": JPMASC, "amount": 1000, "months": 12})
    body = res.json()
    assert res.status_code == 200
    assert body["product_name"] == "JPMasc (JPMASC)"
    assert body["projected_value"] == 1400.0
    assert body["risk"] == "muito alto"
    assert body["disclaimer"] == "Estimativa bruta, sem garantia de rentabilidade."


def test_invest_requires_risk_acknowledgement(client):
    before = _portfolio(client)
    body = _invest(client, 100).json()
    assert body["status"] == "requer_ciencia_de_risco"
    assert body["product_risk"] == "muito alto"
    assert body["investor_profile"] == "moderado"
    after = _portfolio(client)
    assert after["cash_available"] == before["cash_available"]
    assert all(p["product_id"] != JPMASC for p in after["positions"])
    assert store._accounts[ACCOUNT]["orders"] == []


def test_invest_below_minimum(client):
    assert _invest(client, 5, risk_acknowledged=True).json()["status"] == "abaixo_do_minimo"


def test_invest_with_acknowledgement_creates_quantity_position(client):
    body = _invest(client, 100, risk_acknowledged=True).json()
    # Status "executada" vem da ordem (sobrescreve o "ok"; comportamento existente).
    assert body["status"] == "executada"
    assert body["type"] == "aplicação"
    assert body["product_id"] == JPMASC
    assert body["unit_price"] == pytest.approx(4.20, rel=0.003)
    assert body["quantity"] == pytest.approx(100 / body["unit_price"], rel=1e-6)
    assert body["cash_available_after"] == 24_900.00

    portfolio = _portfolio(client)
    pos = next(p for p in portfolio["positions"] if p["product_id"] == JPMASC)
    assert pos["quantity"] == pytest.approx(body["quantity"])
    assert pos["invested"] == 100
    assert pos["current_value"] == pytest.approx(100, rel=0.005)
    assert portfolio["cash_available"] == 24_900.00
    assert "cripto" in portfolio["allocation_pct"]


def test_redeem(client):
    _invest(client, 100, risk_acknowledged=True)
    pos = store._accounts[ACCOUNT]["positions"][JPMASC]
    qty_before, invested_before = pos["quantity"], pos["invested"]
    body = client.post(
        "/orders/redeem", params={"product_id": JPMASC, "amount": 40, "account_id": ACCOUNT}
    ).json()
    assert body["status"] == "executada"
    assert body["type"] == "resgate"
    assert body["amount"] == 40
    assert body["cash_available_after"] == 24_940.00
    # Resgata ~40% da posição (o valor atual oscila com o jitter da cotação).
    assert pos["quantity"] == pytest.approx(qty_before * 0.6, rel=0.01)
    assert pos["invested"] == pytest.approx(invested_before * 0.6, rel=0.01)
    assert body["quantity"] == pytest.approx(qty_before * 0.4, rel=0.01)
