/*
  DineQR: static QR Menu renderer
  - Reads restaurant from URL: ?r=<id> or #<id>
  - Loads /restaurants/<id>/menu.json
  - Renders categories + items
*/

(function () {
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  const menuEl = document.getElementById('menu');
  const categoriesEl = document.getElementById('categories');

  const restaurantNameEl = document.getElementById('restaurantName');
  const restaurantMetaEl = document.getElementById('restaurantMeta');
  const restaurantLogoEl = document.getElementById('restaurantLogo');

  // Default restaurant to show when no ID is specified
  const DEFAULT_RESTAURANT = 'spice-garden';

  /** @returns {string} */
  function getRestaurantIdFromUrl() {
    const url = new URL(window.location.href);
    const fromQuery = (url.searchParams.get('r') || url.searchParams.get('restaurant') || '').trim();
    if (fromQuery) return fromQuery;

    const fromHash = (url.hash || '').replace(/^#/, '').trim();
    if (fromHash) return fromHash;

    // Optional: /<id>/ style (when hosting per-restaurant subpaths)
    // Example: https://site.com/spice-garden/
    // Skip path parsing for GitHub Pages URLs (which include repository name in path)
    const hostname = url.hostname.toLowerCase();
    if (!hostname.includes('github.io')) {
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 1 && pathParts[pathParts.length - 1] !== 'index.html') {
        const lastPart = pathParts[pathParts.length - 1];
        // Only treat as restaurant ID if it looks like one (contains hyphens or is not just the repo name)
        if (lastPart.includes('-') || lastPart.length < 20) {
          return lastPart;
        }
      }
    }

    // Default to spice-garden if no restaurant specified
    return DEFAULT_RESTAURANT;
  }

  function clearElement(el) {
    if (!el) return;
    el.replaceChildren();
  }

  function setErrorContent(nodes) {
    statusEl.hidden = true;
    menuEl.hidden = true;
    errorEl.hidden = false;
    clearElement(errorEl);

    if (typeof nodes === 'string') {
      errorEl.textContent = nodes;
      return;
    }

    if (Array.isArray(nodes)) {
      for (const node of nodes) errorEl.appendChild(node);
      return;
    }

    if (nodes instanceof Node) {
      errorEl.appendChild(nodes);
      return;
    }

    errorEl.textContent = String(nodes);
  }

  function setError(message) {
    setErrorContent(message);
  }

  function setLoading(message) {
    errorEl.hidden = true;
    menuEl.hidden = true;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.classList.add('status--loading');
  }

  function setReady() {
    statusEl.hidden = true;
    errorEl.hidden = true;
    menuEl.hidden = false;
  }

  function formatPrice(value, currency) {
    if (value === null || value === undefined || value === '') return '';

    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric)) {
      const curr = (currency || '').trim();
      if (curr) {
        try {
          return new Intl.NumberFormat(undefined, { style: 'currency', currency: curr }).format(numeric);
        } catch {
          // Fall back if currency code is invalid
        }
      }
      return numeric % 1 === 0 ? String(numeric) : numeric.toFixed(2);
    }

    // If price is stored as a formatted string
    return String(value);
  }

  function safeText(value) {
    return value === null || value === undefined ? '' : String(value);
  }

  function createBadge(text, className) {
    const span = document.createElement('span');
    span.className = className ? `badge ${className}` : 'badge';
    span.textContent = text;
    return span;
  }

  function renderMenu(menuJson) {
    const restaurant = menuJson?.restaurant || {};
    const categories = Array.isArray(menuJson?.categories) ? menuJson.categories : [];

    restaurantNameEl.textContent = restaurant.name ? safeText(restaurant.name) : 'Menu';

    const metaParts = [];
    if (restaurant.address) metaParts.push(safeText(restaurant.address));
    if (restaurant.phone) metaParts.push(safeText(restaurant.phone));
    if (restaurant.openHours) metaParts.push(safeText(restaurant.openHours));

    if (metaParts.length) {
      restaurantMetaEl.hidden = false;
      restaurantMetaEl.textContent = metaParts.join(' • ');
    } else {
      restaurantMetaEl.hidden = true;
      restaurantMetaEl.textContent = '';
    }

    // Optional logo in JSON, else try default path
    if (restaurant.logoUrl) {
      restaurantLogoEl.hidden = false;
      restaurantLogoEl.alt = restaurant.name ? `${restaurant.name} logo` : 'Restaurant logo';
      restaurantLogoEl.src = restaurant.logoUrl;
    }

    categoriesEl.replaceChildren();

    if (!categories.length) {
      const empty = document.createElement('div');
      empty.className = 'status';
      empty.textContent = 'No menu categories found.';
      categoriesEl.appendChild(empty);
      return;
    }

    for (const category of categories) {
      const section = document.createElement('section');
      section.className = 'category';

      const h2 = document.createElement('h2');
      h2.className = 'category__title';
      h2.textContent = safeText(category.name || 'Category');

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'items';

      const items = Array.isArray(category.items) ? category.items : [];
      for (const item of items) {
        const available = item.available !== false;

        const card = document.createElement('article');
        card.className = available ? 'item' : 'item item--unavailable';

        const main = document.createElement('div');
        main.className = 'item__main';

        const header = document.createElement('div');
        header.className = 'item__header';

        const name = document.createElement('p');
        name.className = 'item__name';
        name.textContent = safeText(item.name || 'Item');

        const badges = document.createElement('div');
        badges.className = 'item__badges';

        const type = (item.type || '').toLowerCase();
        if (type === 'veg') badges.appendChild(createBadge('Veg', ''));
        if (type === 'non-veg' || type === 'nonveg') badges.appendChild(createBadge('Non‑Veg', ''));

        if (!available) badges.appendChild(createBadge('Unavailable', 'badge--unavailable'));

        header.appendChild(name);
        header.appendChild(badges);

        main.appendChild(header);

        if (item.description) {
          const desc = document.createElement('p');
          desc.className = 'item__desc';
          desc.textContent = safeText(item.description);
          main.appendChild(desc);
        }

        const price = document.createElement('div');
        price.className = 'item__price';
        price.textContent = formatPrice(item.price, menuJson?.currency);

        card.appendChild(main);
        card.appendChild(price);

        itemsWrap.appendChild(card);
      }

      section.appendChild(h2);
      section.appendChild(itemsWrap);
      categoriesEl.appendChild(section);
    }
  }

  async function loadJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
    }
    return res.json();
  }

  function buildRestaurantPaths(restaurantId, filename) {
    const encoded = encodeURIComponent(restaurantId);
    const file = filename.replace(/^\/+/, '');

    // Use only relative paths to work on GitHub Pages subpaths like /DineQR/
    return [
      `restaurants/${encoded}/${file}`,
    ];
  }

  async function loadFirstAvailableJson(paths) {
    let lastError;
    for (const path of paths) {
      try {
        return await loadJson(path);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Menu not found.');
  }

  function setLogoWithFallback(paths, altText) {
    const queue = [...paths];

    restaurantLogoEl.hidden = false;
    restaurantLogoEl.alt = altText || 'Restaurant logo';

    const tryNext = () => {
      const next = queue.shift();
      if (!next) {
        restaurantLogoEl.hidden = true;
        restaurantLogoEl.onerror = null;
        return;
      }
      restaurantLogoEl.src = next;
    };

    restaurantLogoEl.onerror = tryNext;
    tryNext();
  }

  async function main() {
    setLoading('Loading menu…');

    const restaurantId = getRestaurantIdFromUrl();

    setLogoWithFallback(buildRestaurantPaths(restaurantId, 'logo.png'), 'Restaurant logo');

    try {
      const menuJson = await loadFirstAvailableJson(buildRestaurantPaths(restaurantId, 'menu.json'));
      renderMenu(menuJson);
      setReady();
    } catch (e) {
      setError(`${e?.message || e}`);
    }
  }

  main();
})();
