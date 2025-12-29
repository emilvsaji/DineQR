# DineQR (Static QR Menu MVP)

A lightweight, mobile-first QR menu web app.

## Firebase (Migration)

This repo now includes an **Owner Page** that uses:

- Firebase Authentication (email/password)
- Firestore (real-time)

### 1) Add Firebase config

Fill in your Firebase Web App config here:

- `js/firebase-config.js`

Then the shared initializer exports `auth` and `db` from:

- `js/firebase.js`

### 2) Owner pages

- `owner/login.html`
- `owner/dashboard.html`
- `owner/owner.js`
- `owner/owner.css`

Owner-to-restaurant mapping used by the dashboard:

- `owners/{uid}` → `{ restaurantId: "ajwa" }`

Create an owner login + link it to a restaurant (recommended):

- `tools/create-owner-user.mjs`

Example (PowerShell):

- `$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccount.json"`
- `node tools/create-owner-user.mjs --email owner@ajwa.com --password "DineQR123!" --restaurantId ajwa`

Menu structure in Firestore:

- `restaurants/{restaurantId}`
  - `categories/{categoryId}`
    - `items/{itemId}`

> Firestore Security Rules should ensure owners can only read/write their own restaurant.

### 3) Migrate existing JSON menus to Firestore

There is a Node script to import `restaurants/<id>/menu.json` into Firestore:

- `tools/migrate-json-to-firestore.mjs`

High-level steps:

- Install Node 18+
- `npm init -y`
- `npm i firebase-admin`
- Set `$env:GOOGLE_APPLICATION_CREDENTIALS` to your service account JSON path
- Run: `node tools/migrate-json-to-firestore.mjs`

## Folder layout

- `index.html` – app shell
- `css/styles.css` – styling
- `js/app.js` – app logic
- `restaurants/<restaurant-id>/` – per-restaurant data + branding
  - `menu.json` – menu data + restaurant metadata
  - `logo.png` – optional logo file (if you want to host an image in the repo)

## URL format

Use either:

- `index.html?r=ajwa`
- `index.html#ajwa`

If the restaurant id is missing, the app falls back to the default restaurant.

When deployed, your QR codes should include the restaurant id.

## Restaurant data

Each restaurant has a `restaurants/<restaurant-id>/menu.json`.

Minimal structure:

```json
{
  "currency": "INR",
  "restaurant": {
    "id": "ajwa",
    "name": "Ajwa Kitchen",
    "tagline": "Authentic Arabian • Fresh • Delicious",
    "address": "Erattupetta, Kerala, India",
    "phone": "+91 9876 543210",
    "openHours": "Daily 11:00 - 23:00",
    "logoUrl": "https://example.com/logo.png"
  },
  "categories": []
}
```

Logo options:

- Remote: set `restaurant.logoUrl` to an `https://...` image URL.
- Local file: add `restaurants/<restaurant-id>/logo.png` and set `restaurant.logoUrl` to `"restaurants/<restaurant-id>/logo.png"`.

## Local preview

From the repo root:

- PowerShell: `python -m http.server 5500`
- Then open: `http://localhost:5500/index.html?r=ajwa`

### VS Code Live Server

Live Server often serves using the folder of the opened HTML file as the web root.

- If you open `index.html` with Live Server, use a URL like:
  - `http://127.0.0.1:5500/index.html?r=ajwa`

## GitHub Pages

GitHub Pages typically serves the site under a sub-path like:

- `https://<username>.github.io/<repo-name>/`

The app builds menu/logo URLs relative to the current page, so it works both locally and on GitHub Pages.

> Any edits to a restaurant's `menu.json` are reflected on refresh.
