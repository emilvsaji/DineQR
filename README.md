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

The restaurant id is required (otherwise the page will show the “Missing restaurant id” prompt).

When deployed, your QR codes should include the restaurant id.

## Local preview

From the repo root:

- PowerShell: `python -m http.server 5500`
- Then open: `http://localhost:5500/public/index.html?r=spice-garden`

### VS Code Live Server

Live Server often serves using the folder of the opened HTML file as the web root.

- If you open `public/index.html` with Live Server, use a URL like:
  - `http://127.0.0.1:5500/index.html?r=spice-garden`
- If you serve the repo root, use:
  - `http://127.0.0.1:5500/public/index.html?r=spice-garden`

This repo includes a mirrored `public/restaurants/` folder so menus load correctly in either mode.

> Any edits to a restaurant's `menu.json` are reflected on refresh.
