"""Issue #2: /simulate e /orders/redeem rejeitam valores não positivos (valor_invalido, HTTP 200)."""

import pytest
from fastapi.testclient import TestClient

from mock_api import store
from mock_api.main import app

ACCOUNT = "acc-001"
INVALID_AMOUNTS = [("-50", -50), ("0", 0), ("nan", None), ("inf", None), ("-inf", None)]


@pytest.fixture(autouse=True)
def reset_store(monkeypatch):
    monkeypatch.setattr(store, "_accounts", {ACCOUNT: store._seed()})


@pytest.fixture
def client():
    return TestClient(app)


def _assert_invalid(res, field, value):
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "valor_invalido"
    assert body["retryable"] is True
    assert body["field"] == field
    assert isinstance(body["message"], str) and body["message"]
    assert isinstance(body["retry_hint"], str) and body["retry_hint"]
    assert field in body and body[field] == value
    return body


# --- /simulate ---

@pytest.mark.parametrize("raw,expected", INVALID_AMOUNTS)
def test_simulate_rejects_invalid_amount(client, raw, expected):
    res = client.get("/simulate", params={"product_id": "td-selic-29", "amount": raw})
    body = _assert_invalid(res, "amount", expected)
    assert body["message"] == "O valor precisa ser maior que zero."


@pytest.mark.parametrize("months", [0, -1, -12])
def test_simulate_rejects_invalid_months(client, months):
    res = client.get("/simulate", params={"product_id": "td-selic-29", "amount": 1000, "months": months})
    body = _assert_invalid(res, "months", months)
    assert body["message"] == "O prazo precisa ser de pelo menos 1 mês."


def test_simulate_checks_amount_before_months(client):
    res = client.get("/simulate", params={"product_id": "td-selic-29", "amount": -1, "months": 0})
    _assert_invalid(res, "amount", -1)


def test_simulate_checks_values_before_product(client):
    res = client.get("/simulate", params={"product_id": "nao-existe", "amount": -50})
    _assert_invalid(res, "amount", -50)
    res = client.get("/simulate", params={"product_id": "nao-existe", "amount": 100, "months": 0})
    _assert_invalid(res, "months", 0)


def test_simulate_unknown_product_unchanged(client):
    res = client.get("/simulate", params={"product_id": "nao-existe", "amount": 100})
    assert res.status_code == 200
    assert res.json()["status"] == "produto_nao_encontrado"


def test_simulate_happy_path(client):
    res = client.get("/simulate", params={"product_id": "td-selic-29", "amount": 1000, "months": 24})
    assert res.status_code == 200
    body = res.json()
    assert "status" not in body
    assert body["product_id"] == "td-selic-29"
    assert body["amount"] == 1000
    assert body["months"] == 24
    assert body["projected_value"] == round(1000 * 1.1060 ** 2, 2)


def test_simulate_default_months_still_12(client):
    res = client.get("/simulate", params={"product_id": "td-selic-29", "amount": 1000})
    assert res.json()["months"] == 12


# --- /orders/redeem ---

@pytest.mark.parametrize("raw,expected", INVALID_AMOUNTS)
def test_redeem_rejects_invalid_amount_without_side_effects(client, raw, expected):
    before = client.get("/portfolio", params={"account_id": ACCOUNT}).json()
    res = client.post(
        "/orders/redeem", params={"product_id": "rf-cdb-liq", "amount": raw, "account_id": ACCOUNT}
    )
    _assert_invalid(res, "amount", expected)
    after = client.get("/portfolio", params={"account_id": ACCOUNT}).json()
    assert after["cash_available"] == before["cash_available"]
    cdb = lambda p: next(x for x in p["positions"] if x["product_id"] == "rf-cdb-liq")  # noqa: E731
    assert cdb(after) == cdb(before)
    assert store._accounts[ACCOUNT]["orders"] == []


def test_redeem_checks_amount_before_position(client):
    res = client.post(
        "/orders/redeem", params={"product_id": "nao-existe", "amount": -50, "account_id": ACCOUNT}
    )
    _assert_invalid(res, "amount", -50)


def test_redeem_unknown_position_unchanged(client):
    res = client.post(
        "/orders/redeem", params={"product_id": "nao-existe", "amount": 50, "account_id": ACCOUNT}
    )
    assert res.json()["status"] == "posicao_nao_encontrada"


def test_redeem_happy_path(client):
    res = client.post(
        "/orders/redeem", params={"product_id": "rf-cdb-liq", "amount": 500, "account_id": ACCOUNT}
    )
    assert res.status_code == 200
    body = res.json()
    # Comportamento existente (fora do escopo): o "status" da ordem ("executada") sobrescreve o "ok".
    assert body["status"] == "executada"
    assert body["type"] == "resgate"
    assert body["amount"] == 500
    assert body["cash_available_after"] == 25_500.00
    portfolio = client.get("/portfolio", params={"account_id": ACCOUNT}).json()
    cdb = next(x for x in portfolio["positions"] if x["product_id"] == "rf-cdb-liq")
    assert cdb["current_value"] == pytest.approx(8_012.35 - 500)


# --- OpenAPI ---

def _query_schema(spec, path, method, name):
    params = spec["paths"][path][method]["parameters"]
    return next(p for p in params if p["name"] == name)["schema"]


def test_openapi_schema_constraints():
    spec = app.openapi()
    assert _query_schema(spec, "/simulate", "get", "amount")["exclusiveMinimum"] == 0
    assert _query_schema(spec, "/simulate", "get", "months")["minimum"] == 1
    assert _query_schema(spec, "/simulate", "get", "months")["default"] == 12
    assert _query_schema(spec, "/orders/redeem", "post", "amount")["exclusiveMinimum"] == 0


def test_openapi_operation_ids_unchanged():
    spec = app.openapi()
    assert spec["paths"]["/simulate"]["get"]["operationId"] == "simulate_investment"
    assert spec["paths"]["/orders/redeem"]["post"]["operationId"] == "redeem"
