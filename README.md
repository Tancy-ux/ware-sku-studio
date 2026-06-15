# ware SKU Studio

A lightweight local web app for generating and managing SKUs for made-to-order /
bespoke products, with optional push to Zoho Inventory. Built with Flask + SQLite +
vanilla JavaScript. Runs entirely on your own machine.

## What it does

- **Individual / component SKUs** — `MATERIAL + TYPOLOGY + NUMBER` (e.g. `MARBO001`).
  The product number is auto-assigned per typology and always climbs (deleted numbers
  are never reused).
- **Assembly SKUs** — `CATEGORY - DESIGN - SEQ` (e.g. `TBL-ECL-001`). Build a bill of
  materials by picking from your archived component SKUs, or leave it empty and link
  components later in Zoho.
- **Colour / CMF is never part of a SKU.** A SKU encodes only the fixed physical
  identity of a part. Finish, colour and size are captured per order, not baked into
  the code — this avoids SKU explosion for customizable products.
- **Zoho Inventory push** — components push as inventory items; assemblies push as
  composite items.
- **Archive** — browse, rename, export to CSV.

## Design principle

> A SKU is the thing that does **not** change when a customer customizes.
> Material defines identity (a marble top and a wood top are different parts).
> Colour is order data, not identity.

## Requirements

- Python 3.9+
- A modern browser

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run
python app.py
```

Then open <http://localhost:5050> in your browser.

On Windows you can also just double-click `Open_SKU_Studio.bat`, which installs
dependencies, starts the server, and opens the browser for you.

The SQLite database is created automatically on first run at `data/ware.db` and
seeded with example materials, typologies and components.

## Zoho Inventory (optional)

To push SKUs to Zoho, add your OAuth2 credentials via the in-app **Zoho Setup**
page, or copy `data/config.example.json` to `data/config.json` and fill in:

```json
{
  "zoho_client_id": "your_client_id",
  "zoho_client_secret": "your_client_secret",
  "zoho_refresh_token": "your_refresh_token",
  "zoho_org_id": "your_org_id"
}
```

This app uses the Zoho `.in` regional endpoint
(`https://www.zohoapis.in`). If your Zoho account is in a different region, change
the domain in `app.py` accordingly (e.g. `.com`, `.eu`, `.com.au`).

`data/config.json` and `data/ware.db` are git-ignored — your credentials and data
are never committed.

## Project structure

```
ware-sku-studio/
├── app.py                 # Flask backend + SKU logic + Zoho integration
├── requirements.txt
├── Open_SKU_Studio.bat    # Windows launcher
├── static/
│   ├── css/style.css
│   └── js/app.js          # Front-end logic
├── templates/
│   └── index.html         # Single-page UI
└── data/
    ├── config.example.json
    ├── config.json        # (created at runtime — git-ignored)
    └── ware.db            # (created at runtime — git-ignored)
```

## Notes

- This is a single-user local tool. SQLite does not support concurrent writers, so
  do not run multiple instances against the same database file at once.
- The app binds to `0.0.0.0:5050`, so others on your LAN can reach it at
  `http://<your-ip>:5050`. Restrict this on untrusted networks if needed.

## License

Add a license of your choice (e.g. MIT) before making the repository public.
