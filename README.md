# DineQR (Static QR Menu MVP)

A lightweight, mobile-first QR menu web app.

## Folder layout

- `public/` – shared UI (single template + CSS/JS)
- `restaurants/<restaurant-id>/` – per-restaurant data + branding
  - `menu.json` – menu data
  - `logo.png` – optional logo (displayed automatically if present)

## URL format

Use either:

- `public/index.html?r=spice-garden`
- `public/index.html#spice-garden`

When deployed, your QR codes should include the restaurant id.

## Local preview

From the repo root:

- PowerShell: `python -m http.server 5500`
- Then open: `http://localhost:5500/public/index.html?r=spice-garden`

> Any edits to a restaurant's `menu.json` are reflected on refresh.
