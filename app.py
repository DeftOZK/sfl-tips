from __future__ import annotations

import csv
import io
from datetime import datetime

from flask import Flask, Response, render_template, request

from services.sfl_world_api import fetch_prices


app = Flask(__name__)


def filter_items(items: list[dict], search: str) -> list[dict]:
    if not search:
        return items

    search_lower = search.lower().strip()

    return [
        item for item in items
        if search_lower in item["item"].lower()
    ]


@app.template_filter("price")
def format_price(value):
    if value is None:
        return "—"

    text = f"{value:,.8f}"
    return text.rstrip("0").rstrip(".")


@app.template_filter("signed_price")
def format_signed_price(value):
    if value is None:
        return "—"

    sign = "+" if value > 0 else ""
    text = f"{value:,.8f}".rstrip("0").rstrip(".")
    return f"{sign}{text}"


@app.route("/")
def index():
    search = request.args.get("search", "").strip()

    try:
        data = fetch_prices()
        filtered_items = filter_items(data["items"], search)
        error = None
    except Exception as exc:
        data = {
            "source": "",
            "updated_at": "",
            "updated_text": "",
            "items": [],
        }
        filtered_items = []
        error = str(exc)

    return render_template(
        "index.html",
        data=data,
        items=filtered_items,
        search=search,
        error=error,
        local_refresh=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )


@app.route("/download.csv")
def download_csv():
    search = request.args.get("search", "").strip()
    data = fetch_prices()
    items = filter_items(data["items"], search)

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["Producto", "Precio Plaza / P2P", "Precio Sequence", "Diferencia"])

    for item in items:
        writer.writerow([
            item["item"],
            item["plaza_price"] if item["plaza_price"] is not None else "",
            item["sequence_price"] if item["sequence_price"] is not None else "",
            item["difference"] if item["difference"] is not None else "",
        ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=sfl_prices.csv"},
    )


if __name__ == "__main__":
    app.run(debug=True)
