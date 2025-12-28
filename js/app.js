/**
 * DineQR - Modern QR Restaurant Menu App
 * Premium mobile-first menu interface
 */

(function() {
  'use strict';

  // ===== CONFIG =====
  const DEFAULT_RESTAURANT = 'ajwa';
  const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f3f4f6" width="100" height="100"/%3E%3Ctext x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="30"%3E🍽️%3C/text%3E%3C/svg%3E';

  // ===== STATE =====
  let menuData = null;
  let cart = [];
  let activeCategory = 'all';
  let searchQuery = '';
  let currentItem = null;

  // ===== DOM ELEMENTS =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const elements = {
    // Header
    restaurantLogo: $('#restaurantLogo'),
    restaurantName: $('#restaurantName'),
    restaurantTagline: $('#restaurantTagline'),
    cartBtn: $('#cartBtn'),
    cartBadge: $('#cartBadge'),
    searchInput: $('#searchInput'),
    
    // Categories
    categoriesScroll: $('#categoriesScroll'),
    
    // Main
    loadingState: $('#loadingState'),
    errorState: $('#errorState'),
    errorMessage: $('#errorMessage'),
    menuContent: $('#menuContent'),
    
    // Product Modal
    modalOverlay: $('#modalOverlay'),
    productModal: $('#productModal'),
    modalClose: $('#modalClose'),
    modalImage: $('#modalImage'),
    modalName: $('#modalName'),
    modalTags: $('#modalTags'),
    modalDesc: $('#modalDesc'),
    modalPrice: $('#modalPrice'),
    modalAddBtn: $('#modalAddBtn'),
    nutritionSection: $('#nutritionSection'),
    nutritionCalories: $('#nutritionCalories'),
    nutritionCarbs: $('#nutritionCarbs'),
    nutritionProtein: $('#nutritionProtein'),
    nutritionFat: $('#nutritionFat'),
    ingredientsSection: $('#ingredientsSection'),
    ingredientsList: $('#ingredientsList'),
    
    // Cart
    cartOverlay: $('#cartOverlay'),
    cartPanel: $('#cartPanel'),
    cartClose: $('#cartClose'),
    cartBody: $('#cartBody'),
    cartEmpty: $('#cartEmpty'),
    cartItems: $('#cartItems'),
    cartTotal: $('#cartTotal'),
    cartCheckout: $('#cartCheckout'),
    cartNotes: $('#cartNotes'),
    tableNumber: $('#tableNumber')
  };

  // ===== UTILITIES =====
  function getRestaurantIdFromUrl() {
    const url = new URL(window.location.href);
    const fromQuery = (url.searchParams.get('r') || url.searchParams.get('restaurant') || '').trim();
    if (fromQuery) return fromQuery;

    const fromHash = (url.hash || '').replace(/^#/, '').trim();
    if (fromHash) return fromHash;

    // Path-based restaurant ID (skip repository name for GitHub Pages)
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      const restaurantSegment = pathParts[1];
      if (restaurantSegment && restaurantSegment !== 'index.html') {
        return restaurantSegment;
      }
    }

    return DEFAULT_RESTAURANT;
  }

  function formatPrice(value, currency = 'USD') {
    if (value === null || value === undefined) return '';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return String(value);
    
    try {
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: currency 
      }).format(num);
    } catch {
      return `$${num.toFixed(2)}`;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ===== DATA LOADING =====
  async function loadMenu(restaurantId) {
    const paths = [
      `restaurants/${encodeURIComponent(restaurantId)}/menu.json`,
    ];

    for (const path of paths) {
      try {
        const res = await fetch(path, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn(`Failed to load ${path}`, e);
      }
    }
    throw new Error(`Menu not found for "${restaurantId}"`);
  }

  // ===== UI UPDATES =====
  function showLoading() {
    elements.loadingState.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
    elements.menuContent.classList.add('hidden');
  }

  function showError(message) {
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.remove('hidden');
    elements.errorMessage.textContent = message;
    elements.menuContent.classList.add('hidden');
  }

  function showMenu() {
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.menuContent.classList.remove('hidden');
  }

  function updateHeader(restaurant) {
    const name = restaurant?.name || 'Restaurant';
    const tagline = restaurant?.tagline || restaurant?.openHours || 'Delicious • Fresh • Quality';
    
    elements.restaurantName.textContent = name;
    elements.restaurantTagline.textContent = tagline;
    document.title = `${name} - Menu`;

    // Logo
    if (restaurant?.logoUrl) {
      elements.restaurantLogo.src = restaurant.logoUrl;
    }
  }

  function renderCategories(categories) {
    const allCategories = ['all', ...categories.map(c => c.name)];
    
    elements.categoriesScroll.innerHTML = allCategories.map(cat => `
      <button class="category-tab ${cat === activeCategory ? 'category-tab--active' : ''}" 
              data-category="${escapeHtml(cat)}">
        ${cat === 'all' ? 'All' : escapeHtml(cat)}
      </button>
    `).join('');

    // Add click handlers
    elements.categoriesScroll.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeCategory = tab.dataset.category;
        updateCategoryTabs();
        renderMenuItems();
      });
    });
  }

  function updateCategoryTabs() {
    elements.categoriesScroll.querySelectorAll('.category-tab').forEach(tab => {
      tab.classList.toggle('category-tab--active', tab.dataset.category === activeCategory);
    });
  }

  function getFilteredItems() {
    if (!menuData?.categories) return [];
    
    let items = [];
    
    for (const category of menuData.categories) {
      if (activeCategory !== 'all' && category.name !== activeCategory) continue;
      
      for (const item of (category.items || [])) {
        // Search filter
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const nameMatch = (item.name || '').toLowerCase().includes(q);
          const descMatch = (item.description || '').toLowerCase().includes(q);
          if (!nameMatch && !descMatch) continue;
        }
        
        items.push({ ...item, categoryName: category.name });
      }
    }
    
    return items;
  }

  function renderMenuItems() {
    const items = getFilteredItems();
    const currency = menuData?.currency || 'USD';
    
    if (items.length === 0) {
      elements.menuContent.innerHTML = `
        <div class="status">
          <p>No items found${searchQuery ? ` for "${escapeHtml(searchQuery)}"` : ''}</p>
        </div>
      `;
      return;
    }

    // Group by category for display
    const grouped = {};
    for (const item of items) {
      if (!grouped[item.categoryName]) grouped[item.categoryName] = [];
      grouped[item.categoryName].push(item);
    }

    let html = '';
    
    for (const [categoryName, categoryItems] of Object.entries(grouped)) {
      html += `
        <section class="menu-section">
          <h2 class="menu-section__title">
            ${escapeHtml(categoryName)}
            <span class="menu-section__count">${categoryItems.length}</span>
          </h2>
          <div class="menu-grid">
      `;
      
      for (const item of categoryItems) {
        const available = item.available !== false;
        const type = (item.type || '').toLowerCase();
        const imageUrl = item.image || PLACEHOLDER_IMAGE;
        
        html += `
          <article class="menu-card ${available ? '' : 'menu-card--unavailable'}" 
                   data-item-id="${escapeHtml(item.name)}">
            <div class="menu-card__image-wrap">
              <img class="menu-card__image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" 
                   onerror="this.src='${PLACEHOLDER_IMAGE}'">
              ${type === 'veg' ? '<span class="menu-card__badge menu-card__badge--veg">🌱</span>' : ''}
              ${type === 'non-veg' || type === 'nonveg' ? '<span class="menu-card__badge menu-card__badge--nonveg">🍖</span>' : ''}
            </div>
            <div class="menu-card__content">
              ${item.tags ? `<div class="tags">${item.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
              <h3 class="menu-card__name">${escapeHtml(item.name)}</h3>
              <p class="menu-card__desc">${escapeHtml(item.description || '')}</p>
              <div class="menu-card__footer">
                <span class="menu-card__price">${formatPrice(item.price, currency)}</span>
                ${available ? `
                  <button class="menu-card__add" data-action="add" aria-label="Add to cart">
                    <svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                ` : '<span class="tag tag--warning">Unavailable</span>'}
              </div>
            </div>
          </article>
        `;
      }
      
      html += '</div></section>';
    }
    
    elements.menuContent.innerHTML = html;
    
    // Add event listeners
    elements.menuContent.querySelectorAll('.menu-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const itemName = card.dataset.itemId;
        const item = findItemByName(itemName);
        if (item) {
          if (e.target.closest('[data-action="add"]')) {
            addToCart(item);
          } else {
            openProductModal(item);
          }
        }
      });
    });
  }

  function findItemByName(name) {
    for (const cat of (menuData?.categories || [])) {
      for (const item of (cat.items || [])) {
        if (item.name === name) return item;
      }
    }
    return null;
  }

  // ===== PRODUCT MODAL =====
  function openProductModal(item) {
    currentItem = item;
    const currency = menuData?.currency || 'USD';
    
    elements.modalImage.src = item.image || PLACEHOLDER_IMAGE;
    elements.modalImage.onerror = () => { elements.modalImage.src = PLACEHOLDER_IMAGE; };
    elements.modalName.textContent = item.name || 'Product';
    elements.modalDesc.textContent = item.description || '';
    elements.modalPrice.textContent = formatPrice(item.price, currency);
    
    // Tags
    const tags = [];
    if ((item.type || '').toLowerCase() === 'veg') tags.push({ text: 'Vegan', class: '' });
    if ((item.type || '').toLowerCase().includes('non')) tags.push({ text: 'Non-Veg', class: 'tag--warning' });
    if (item.tags) tags.push(...item.tags.map(t => ({ text: t, class: '' })));
    
    elements.modalTags.innerHTML = tags.map(t => 
      `<span class="tag ${t.class}">${escapeHtml(t.text)}</span>`
    ).join('');
    
    // Nutrition
    if (item.nutrition) {
      elements.nutritionSection.classList.remove('hidden');
      elements.nutritionCalories.textContent = item.nutrition.calories || '--';
      elements.nutritionCarbs.textContent = item.nutrition.carbs ? `${item.nutrition.carbs}g` : '--';
      elements.nutritionProtein.textContent = item.nutrition.protein ? `${item.nutrition.protein}g` : '--';
      elements.nutritionFat.textContent = item.nutrition.fat ? `${item.nutrition.fat}g` : '--';
    } else {
      elements.nutritionSection.classList.add('hidden');
    }
    
    // Ingredients
    if (item.ingredients && item.ingredients.length) {
      elements.ingredientsSection.classList.remove('hidden');
      elements.ingredientsList.innerHTML = item.ingredients.map(ing => 
        `<span class="ingredient">${escapeHtml(ing)}</span>`
      ).join('');
    } else {
      elements.ingredientsSection.classList.add('hidden');
    }
    
    // Show modal
    elements.modalOverlay.classList.add('modal-overlay--active');
    elements.productModal.classList.add('modal--active');
    document.body.style.overflow = 'hidden';
  }

  function closeProductModal() {
    elements.modalOverlay.classList.remove('modal-overlay--active');
    elements.productModal.classList.remove('modal--active');
    document.body.style.overflow = '';
    currentItem = null;
  }

  // ===== CART =====
  function addToCart(item) {
    const existing = cart.find(c => c.name === item.name);
    if (existing) {
      existing.quantity++;
    } else {
      cart.push({ ...item, quantity: 1 });
    }
    updateCartUI();
    
    // Visual feedback
    elements.cartBadge.classList.add('pulse');
    setTimeout(() => elements.cartBadge.classList.remove('pulse'), 300);
  }

  function removeFromCart(itemName) {
    cart = cart.filter(c => c.name !== itemName);
    updateCartUI();
  }

  function updateCartQuantity(itemName, delta) {
    const item = cart.find(c => c.name === itemName);
    if (item) {
      item.quantity += delta;
      if (item.quantity <= 0) {
        removeFromCart(itemName);
      } else {
        updateCartUI();
      }
    }
  }

  function updateCartUI() {
    const currency = menuData?.currency || 'USD';
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Badge
    elements.cartBadge.textContent = totalItems;
    elements.cartBadge.dataset.count = totalItems;
    
    // Cart content
    if (cart.length === 0) {
      elements.cartEmpty.classList.remove('hidden');
      elements.cartItems.classList.add('hidden');
      elements.cartCheckout.disabled = true;
    } else {
      elements.cartEmpty.classList.add('hidden');
      elements.cartItems.classList.remove('hidden');
      elements.cartCheckout.disabled = false;
      
      elements.cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
          <img class="cart-item__image" src="${escapeHtml(item.image || PLACEHOLDER_IMAGE)}" 
               alt="${escapeHtml(item.name)}" onerror="this.src='${PLACEHOLDER_IMAGE}'">
          <div class="cart-item__content">
            <div class="cart-item__name">${escapeHtml(item.name)}</div>
            <div class="cart-item__price">${formatPrice(item.price * item.quantity, currency)}</div>
            <div class="cart-item__controls">
              <button class="cart-item__qty-btn" data-action="decrease" data-item="${escapeHtml(item.name)}">−</button>
              <span class="cart-item__qty">${item.quantity}</span>
              <button class="cart-item__qty-btn" data-action="increase" data-item="${escapeHtml(item.name)}">+</button>
            </div>
          </div>
          <button class="cart-item__remove" data-action="remove" data-item="${escapeHtml(item.name)}">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `).join('');
      
      // Add event listeners
      elements.cartItems.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const itemName = btn.dataset.item;
          if (action === 'increase') updateCartQuantity(itemName, 1);
          if (action === 'decrease') updateCartQuantity(itemName, -1);
          if (action === 'remove') removeFromCart(itemName);
        });
      });
    }
    
    elements.cartTotal.textContent = formatPrice(totalPrice, currency);
  }

  function openCart() {
    elements.cartOverlay.classList.add('cart-overlay--active');
    elements.cartPanel.classList.add('cart-panel--active');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    elements.cartOverlay.classList.remove('cart-overlay--active');
    elements.cartPanel.classList.remove('cart-panel--active');
    document.body.style.overflow = '';
  }

  function placeOrder() {
    if (cart.length === 0) return;
    
    const orderDetails = {
      items: cart,
      notes: elements.cartNotes.value,
      table: elements.tableNumber.textContent,
      total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    };
    
    console.log('Order placed:', orderDetails);
    alert('Order placed successfully! 🎉\n\nThank you for your order.');
    
    // Clear cart
    cart = [];
    updateCartUI();
    closeCart();
  }

  // ===== EVENT HANDLERS =====
  function setupEventListeners() {
    // Search
    elements.searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderMenuItems();
    });
    
    // Cart button
    elements.cartBtn.addEventListener('click', openCart);
    elements.cartClose.addEventListener('click', closeCart);
    elements.cartOverlay.addEventListener('click', closeCart);
    elements.cartCheckout.addEventListener('click', placeOrder);
    
    // Product modal
    elements.modalClose.addEventListener('click', closeProductModal);
    elements.modalOverlay.addEventListener('click', closeProductModal);
    elements.modalAddBtn.addEventListener('click', () => {
      if (currentItem && currentItem.available !== false) {
        addToCart(currentItem);
        closeProductModal();
      }
    });
    
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeProductModal();
        closeCart();
      }
    });
    
    // Set random table number
    elements.tableNumber.textContent = `Table ${Math.floor(Math.random() * 20) + 1}`;
  }

  // ===== INIT =====
  async function init() {
    showLoading();
    setupEventListeners();
    
    const restaurantId = getRestaurantIdFromUrl();
    
    // Try to load logo
    const logoPath = `restaurants/${encodeURIComponent(restaurantId)}/logo.png`;
    elements.restaurantLogo.onerror = () => {
      elements.restaurantLogo.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%2322c55e" width="100" height="100"/%3E%3Ctext x="50" y="60" text-anchor="middle" fill="white" font-size="40"%3E🍽️%3C/text%3E%3C/svg%3E';
    };
    elements.restaurantLogo.src = logoPath;
    
    try {
      menuData = await loadMenu(restaurantId);
      updateHeader(menuData.restaurant);
      renderCategories(menuData.categories || []);
      renderMenuItems();
      showMenu();
      updateCartUI();
    } catch (error) {
      console.error('Failed to load menu:', error);
      showError(error.message || 'Failed to load menu. Please try again.');
    }
  }

  // Start
  init();
})();
