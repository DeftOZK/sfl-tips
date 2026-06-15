from __future__ import annotations

from typing import Any

import requests


PRICES_URL = "https://sfl.world/api/v1/prices"


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_prices(timeout: int = 15) -> dict[str, Any]:
    response = requests.get(PRICES_URL, timeout=timeout)
    response.raise_for_status()

    raw = response.json()

    price_data = raw.get("data", {})
    p2p = price_data.get("p2p", {})
    seq = price_data.get("seq", {})

    all_items = sorted(set(p2p.keys()) | set(seq.keys()))

    items = []

    for item_name in all_items:
        plaza_price = _to_float(p2p.get(item_name))
        sequence_price = _to_float(seq.get(item_name))

        difference = None
        if plaza_price is not None and sequence_price is not None:
            difference = sequence_price - plaza_price

        items.append(
            {
                "item": item_name,
                "plaza_price": plaza_price,
                "sequence_price": sequence_price,
                "difference": difference,
            }
        )

    return {
        "source": PRICES_URL,
        "updated_at": raw.get("updatedAt") or "",
        "updated_text": raw.get("updated_text") or "",
        "count": len(items),
        "items": items,
    }