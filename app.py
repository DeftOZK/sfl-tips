from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from pathlib import Path

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


def load_nft_manifest() -> dict:
    manifest_path = Path(app.static_folder or "static") / "assets" / "nft_manifest.json"
    if not manifest_path.exists():
        return {"nfts": [], "wearables": [], "blacksmith": [], "shrines": []}
    return json.loads(manifest_path.read_text(encoding="utf-8"))




def load_boost_rules() -> dict:
    rules_path = Path(app.static_folder or "static") / "assets" / "boost_rules.json"
    if not rules_path.exists():
        return {"rules": []}
    return json.loads(rules_path.read_text(encoding="utf-8"))

def load_crop_manifest() -> dict:
    manifest_path = Path(app.static_folder or "static") / "assets" / "crop_manifest.json"
    if not manifest_path.exists():
        return {"crops": [], "fruits": [], "greenhouse": []}
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    return data.get("groups", {"crops": [], "fruits": [], "greenhouse": []})


def load_mineral_manifest() -> dict:
    manifest_path = Path(app.static_folder or "static") / "assets" / "mineral_manifest.json"
    if not manifest_path.exists():
        return {"minerals": []}
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    return data.get("groups", {"minerals": []})


def normalize_name(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def load_current_price_map() -> dict:
    try:
        data = fetch_prices()
    except Exception:
        return {}

    price_map = {}
    for item in data.get("items", []):
        name = str(item.get("item", ""))
        if not name:
            continue
        value = item.get("plaza_price")
        if value is None:
            value = item.get("sequence_price")
        if value is not None:
            price_map[normalize_name(name)] = value
    return price_map


def load_price_image_index() -> dict:
    base = Path(app.static_folder or "static") / "assets"
    index = {}

    # Prefer crop/fruta/GH images because prices usually contain those exact product names.
    crop_manifest = base / "crop_manifest.json"
    if crop_manifest.exists():
        try:
            data = json.loads(crop_manifest.read_text(encoding="utf-8"))
            for items in data.get("groups", {}).values():
                for item in items:
                    if item.get("name") and item.get("image"):
                        index[normalize_name(item["name"])] = f"assets/{item['image']}"
        except Exception:
            pass

    # Add mineral images so the price page can show ores/resources too.
    mineral_manifest = base / "mineral_manifest.json"
    if mineral_manifest.exists():
        try:
            data = json.loads(mineral_manifest.read_text(encoding="utf-8"))
            for items in data.get("groups", {}).values():
                for item in items:
                    if item.get("name") and item.get("image"):
                        index.setdefault(normalize_name(item["name"]), f"assets/{item['image']}")
        except Exception:
            pass

    # Add any explicitly extracted price images if present.
    price_manifest = base / "price_image_manifest.json"
    if price_manifest.exists():
        try:
            for item in json.loads(price_manifest.read_text(encoding="utf-8")):
                if item.get("name") and item.get("image"):
                    index.setdefault(normalize_name(item["name"]), f"assets/{item['image']}")
        except Exception:
            pass

    # Fallback: scan current asset folders and map file names to product names.
    for path in base.rglob("*.png"):
        if "icons" in path.parts:
            continue
        name = path.stem.replace("_", " ").replace("-", " ")
        key = normalize_name(name)
        rel = path.relative_to(base.parent).as_posix()
        index.setdefault(key, rel)

    return index


def attach_price_images(items: list[dict]) -> list[dict]:
    image_index = load_price_image_index()
    for item in items:
        key = normalize_name(str(item.get("item", "")))
        item["image"] = image_index.get(key, "assets/price_placeholder.svg")
    return items


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
        filtered_items = attach_price_images(data["items"])
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
        title="Precios · SFL Tips",
        data=data,
        items=filtered_items,
        search=search,
        error=error,
        local_refresh=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )


@app.route("/skills")
def skills():
    return render_template("skills.html", title="Skills · SFL Tips")


@app.route("/nfts")
def nfts():
    return render_template(
        "nfts.html",
        title="NFTs · SFL Tips",
        asset_groups=load_nft_manifest(),
    )


@app.route("/crops")
def crops():
    return render_template(
        "crops.html",
        title="Crops · SFL Tips",
        crop_groups=load_crop_manifest(),
        boost_rules=load_boost_rules(),
        crop_price_map=load_current_price_map(),
    )


@app.route("/minerals")
def minerals():
    return render_template(
        "minerals.html",
        title="Minerales · SFL Tips",
        mineral_groups=load_mineral_manifest(),
        boost_rules=load_boost_rules(),
        mineral_price_map=load_current_price_map(),
    )


@app.route("/assets")
def assets():
    return render_template("assets.html", title="Assets · SFL Tips")


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
