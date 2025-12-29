/*
  Migrate existing static JSON menus to Firestore.

  Reads:
    restaurants/<restaurantId>/menu.json

  Writes (structure requested):
    restaurants/{restaurantId}
      categories/{categoryId}
        items/{itemId}

  Notes:
  - Requires Node 18+.
  - Requires firebase-admin.
  - Requires service account credentials.

  Install:
    npm init -y
    npm i firebase-admin

  Run (PowerShell):
    $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccount.json"
    node tools/migrate-json-to-firestore.mjs

  This script is idempotent (uses deterministic ids via slugify).
*/

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import admin from "firebase-admin";

// --- Workspace paths ---
const REPO_ROOT = process.cwd();
const RESTAURANTS_DIR = path.join(REPO_ROOT, "restaurants");

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "untitled";
}

function safeNumber(value) {
  const n = typeof value === "number" ? value : Number(String(value || "").trim());
  return Number.isFinite(n) ? n : null;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function listRestaurantIds() {
  if (!fs.existsSync(RESTAURANTS_DIR)) return [];
  return fs
    .readdirSync(RESTAURANTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function initAdmin() {
  if (admin.apps.length) return;

  // Uses GOOGLE_APPLICATION_CREDENTIALS by default.
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

async function migrateRestaurant(restaurantId) {
  const menuPath = path.join(RESTAURANTS_DIR, restaurantId, "menu.json");
  if (!fs.existsSync(menuPath)) {
    console.log(`[skip] ${restaurantId}: menu.json not found`);
    return;
  }

  const data = readJson(menuPath);
  const restaurant = data.restaurant || {};
  const categories = Array.isArray(data.categories) ? data.categories : [];

  const db = admin.firestore();

  // Restaurant document
  await db.doc(`restaurants/${restaurantId}`).set(
    {
      id: restaurantId,
      name: restaurant.name || restaurantId,
      tagline: restaurant.tagline || "",
      logoUrl: restaurant.logoUrl || "",
      address: restaurant.address || "",
      phone: restaurant.phone || "",
      openHours: restaurant.openHours || restaurant.hours || "",
      currency: data.currency || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Categories + Items
  for (let c = 0; c < categories.length; c++) {
    const cat = categories[c] || {};
    const catName = cat.name || `Category ${c + 1}`;
    const categoryId = slugify(catName);

    await db.doc(`restaurants/${restaurantId}/categories/${categoryId}`).set(
      {
        name: catName,
        enabled: cat.enabled !== false,
        sortOrder: c,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const items = Array.isArray(cat.items) ? cat.items : [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const itemName = item.name || `Item ${i + 1}`;
      const itemIdBase = slugify(itemName);
      const itemId = `${itemIdBase}-${i}`; // stable + avoids collisions

      // Price handling:
      // - If item.price exists: use it
      // - Else if item.sizes exists: store sizes and set price to the minimum size price (so owner UI can still show a price)
      let price = safeNumber(item.price);
      let sizes = Array.isArray(item.sizes) ? item.sizes : null;
      if (price === null && sizes?.length) {
        const sizePrices = sizes.map((s) => safeNumber(s?.price)).filter((n) => n !== null);
        if (sizePrices.length) price = Math.min(...sizePrices);
      }

      await db
        .doc(`restaurants/${restaurantId}/categories/${categoryId}/items/${itemId}`)
        .set(
          {
            name: itemName,
            description: item.description || "",
            price,
            sizes: sizes || null,
            type: item.type || "",
            tags: Array.isArray(item.tags) ? item.tags : [],
            image: item.image || "",
            available: item.available !== false,
            sortOrder: i,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }
  }

  console.log(`[ok] Migrated ${restaurantId}`);
}

async function main() {
  initAdmin();

  const restaurantIds = listRestaurantIds();
  if (!restaurantIds.length) {
    console.log("No restaurants found in ./restaurants");
    return;
  }

  for (const id of restaurantIds) {
    // Sequential to avoid rate limits for small projects
    // eslint-disable-next-line no-await-in-loop
    await migrateRestaurant(id);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
