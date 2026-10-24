"""Carteira em memória, uma por conta."""

import random
from datetime import datetime, timedelta

from . import catalog

# Perfil de investidor (suitability) — produtos acima dele exigem ciência de risco.
RISK_LEVELS = ["baixo", "moderado", "alto", "muito alto"]
INVESTOR_PROFILE = {"acc-001": "moderado"}


def _seed() -> dict:
    return {
        "cash": 25_000.00,
        # Renda fixa/fundos: valor aplicado + valor atual. Ativos com cotação: quantidade.
        "positions": {
            "rf-cdb-liq": {"invested": 7_500.00, "current_value": 8_012.35},
            "td-ipca-35": {"invested": 5_000.00, "current_value": 5_318.90},
            "etf-bova11": {"invested": 2_380.00, "quantity": 20.0},
        },
        "orders": [],
    }


_accounts: dict[str, dict] = {"acc-001": _seed()}


def _account(account_id: str) -> dict:
    return _accounts.setdefault(account_id, _seed())


def _position_view(product_id: str, pos: dict) -> dict:
    product = catalog.get_product(product_id)
    if "quantity" in pos:
        current = round(pos["quantity"] * (catalog.quote(product_id) or 0), 2)
    else:
        current = pos["current_value"]
    return {
        "product_id": product_id,
        "name": product["name"],
        "category": product["category"],
        "risk": product["risk"],
        "invested": round(pos["invested"], 2),
        "current_value": current,
        "profit": round(current - pos["invested"], 2),
        "profit_pct": round((current / pos["invested"] - 1) * 100, 2) if pos["invested"] else 0.0,
        **({"quantity": round(pos["quantity"], 8)} if "quantity" in pos else {}),
    }


def get_portfolio(account_id: str) -> dict:
    acc = _account(account_id)
    positions = [_position_view(pid, pos) for pid, pos in acc["positions"].items()]
    invested_total = round(sum(p["current_value"] for p in positions), 2)
    allocation: dict[str, float] = {}
    for p in positions:
        allocation[p["category"]] = allocation.get(p["category"], 0) + p["current_value"]
    return {
        "account_id": account_id,
        "account_name": catalog.ACCOUNTS.get(account_id, account_id),
        "investor_profile": INVESTOR_PROFILE.get(account_id, "moderado"),
        "cash_available": round(acc["cash"], 2),
        "invested_total": invested_total,
        "net_worth": round(invested_total + acc["cash"], 2),
        "profit_total": round(sum(p["profit"] for p in positions), 2),
        "allocation_pct": {
            k: round(v / invested_total * 100, 1) for k, v in allocation.items()
        } if invested_total else {},
        "positions": positions,
    }


def exceeds_profile(account_id: str, product: dict) -> bool:
    """Perfil moderado aceita até risco alto; cripto ("muito alto") exige ciência de risco."""
    profile = INVESTOR_PROFILE.get(account_id, "moderado")
    return RISK_LEVELS.index(product["risk"]) > RISK_LEVELS.index(profile) + 1


def invest(account_id: str, product: dict, amount: float) -> dict:
    acc = _account(account_id)
    acc["cash"] -= amount
    pos = acc["positions"].setdefault(product["id"], {"invested": 0.0})
    pos["invested"] += amount
    price = catalog.quote(product["id"])
    quantity = None
    if price:
        quantity = round(amount / price, 8)
        pos["quantity"] = pos.get("quantity", 0.0) + quantity
    else:
        pos["current_value"] = pos.get("current_value", 0.0) + amount
    return _record(acc, "aplicação", product, amount, price, quantity)


def redeem(account_id: str, product_id: str, amount: float) -> dict:
    acc = _account(account_id)
    pos = acc["positions"][product_id]
    product = catalog.get_product(product_id)
    view = _position_view(product_id, pos)
    fraction = amount / view["current_value"]
    price = catalog.quote(product_id)
    quantity = None
    if "quantity" in pos:
        quantity = round(pos["quantity"] * fraction, 8)
        pos["quantity"] -= quantity
    else:
        pos["current_value"] -= amount
    pos["invested"] -= pos["invested"] * fraction
    if fraction >= 0.9999:
        acc["positions"].pop(product_id)
    acc["cash"] += amount
    return _record(acc, "resgate", product, amount, price, quantity)


def _record(acc: dict, kind: str, product: dict, amount: float, price, quantity) -> dict:
    settle_days = {"D+0": 0, "imediata (24/7)": 0, "D+1": 1}.get(product["liquidity"].split(" (")[0], 2)
    order = {
        "order_id": f"ord-{random.randint(100000, 999999)}",
        "type": kind,
        "product_id": product["id"],
        "product_name": product["name"],
        "amount": round(amount, 2),
        **({"unit_price": price, "quantity": quantity} if price else {}),
        "status": "executada",
        "settlement_date": (datetime.now() + timedelta(days=settle_days)).strftime("%d/%m/%Y"),
        "cash_available_after": round(acc["cash"], 2),
    }
    acc["orders"].append(order)
    return order
