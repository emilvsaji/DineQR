/**
 * DineQR - Menu Showcase App
 * Simplified mobile-first menu interface with item selection for waiter
 */

(function() {
  'use strict';

  // ===== CONFIG =====
  const DEFAULT_RESTAURANT = 'ajwa';
  const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f3f4f6" width="100" height="100"/%3E%3Ctext x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="30"%3E🍽️%3C/text%3E%3C/svg%3E';

  // Futuristic theme restaurants
  const FUTURISTIC_RESTAURANTS = ['gogrill'];

  // ===== STATE =====
  let menuData = null;
  let selectedItems = []; // { item, size, price }
  let activeCategory = 'all';
  let searchQuery = '';
  let currentItem = null;
  let currentRestaurantId = '';

  // ===== DOM ELEMENTS =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const elements = {
    // Header
    restaurantLogo: $('#restaurantLogo'),
    restaurantName: $('#restaurantName'),
    restaurantTagline: $('#restaurantTagline'),
    selectionBtn: $('#selectionBtn'),
    selectionCount: $('#selectionCount'),
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
    sizesSection: $('#sizesSection'),
    modalSizes: $('#modalSizes'),
    modalSelectBtn: $('#modalSelectBtn'),
    
    // Selection Panel
    selectionPanel: $('#selectionPanel'),
    selectionItems: $('#selectionItems'),
    clearSelectionBtn: $('#clearSelectionBtn'),
    showWaiterBtn: $('#showWaiterBtn'),
    
    // Floating Button
    floatingBtn: $('#floatingBtn'),
    floatingBadge: $('#floatingBadge')
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

  function applyTheme(restaurantId) {
    const isFuturistic = FUTURISTIC_RESTAURANTS.includes(restaurantId.toLowerCase());
    if (isFuturistic) {
      document.documentElement.setAttribute('data-theme', 'futuristic');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0a0f');
    } else {
      document.documentElement.removeAttribute('data-theme');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#22c55e');
    }
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

  function isItemSelected(itemName) {
    return selectedItems.some(s => s.item.name === itemName);
  }

  function getItemPrice(item) {
    // If item has sizes, return the first size price as default
    if (item.sizes && item.sizes.length > 0) {
      return item.sizes[0].price;
    }
    return item.price || 0;
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
        const selected = isItemSelected(item.name);
        const displayPrice = getItemPrice(item);
        
        // Size options preview
        let sizesHtml = '';
        if (item.sizes && item.sizes.length > 0) {
          sizesHtml = `
            <div class="menu-card__sizes">
              ${item.sizes.map(size => `
                <div class="size-option">
                  <span class="size-option__name">${escapeHtml(size.name)}</span>
                  <span class="size-option__price">${formatPrice(size.price, currency)}</span>
                </div>
              `).join('')}
            </div>
          `;
        }
        
        html += `
          <article class="menu-card ${available ? '' : 'menu-card--unavailable'} ${selected ? 'menu-card--selected' : ''}" 
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
              ${sizesHtml}
              ${!item.sizes ? `<div style="font-size:15px;font-weight:700;color:var(--primary-dark);margin-top:8px;">${formatPrice(displayPrice, currency)}</div>` : ''}
              ${!available ? '<span class="tag tag--warning">Unavailable</span>' : ''}
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
        if (item && item.available !== false) {
          openProductModal(item);
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
  let selectedSize = null;

  function openProductModal(item) {
    currentItem = item;
    selectedSize = null;
    const currency = menuData?.currency || 'USD';
    
    elements.modalImage.src = item.image || PLACEHOLDER_IMAGE;
    elements.modalImage.onerror = () => { elements.modalImage.src = PLACEHOLDER_IMAGE; };
    elements.modalName.textContent = item.name || 'Product';
    elements.modalDesc.textContent = item.description || '';
    
    // Tags
    const tags = [];
    if ((item.type || '').toLowerCase() === 'veg') tags.push({ text: 'Vegetarian', class: '' });
    if ((item.type || '').toLowerCase().includes('non')) tags.push({ text: 'Non-Veg', class: 'tag--warning' });
    if (item.tags) tags.push(...item.tags.map(t => ({ text: t, class: '' })));
    
    elements.modalTags.innerHTML = tags.map(t => 
      `<span class="tag ${t.class}">${escapeHtml(t.text)}</span>`
    ).join('');
    
    // Size options
    if (item.sizes && item.sizes.length > 0) {
      elements.sizesSection.classList.remove('hidden');
      selectedSize = item.sizes[0]; // Default to first size
      
      elements.modalSizes.innerHTML = item.sizes.map((size, i) => `
        <div class="modal__size-option ${i === 0 ? 'modal__size-option--selected' : ''}" 
             data-size-index="${i}">
          <div class="modal__size-name">${escapeHtml(size.name)}</div>
          <div class="modal__size-price">${formatPrice(size.price, currency)}</div>
        </div>
      `).join('');
      
      // Size click handlers
      elements.modalSizes.querySelectorAll('.modal__size-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const idx = parseInt(opt.dataset.sizeIndex);
          selectedSize = item.sizes[idx];
          elements.modalSizes.querySelectorAll('.modal__size-option').forEach(o => 
            o.classList.remove('modal__size-option--selected'));
          opt.classList.add('modal__size-option--selected');
        });
      });
    } else {
      elements.sizesSection.classList.add('hidden');
    }
    
    // Update button state
    const isSelected = isItemSelected(item.name);
    updateModalButton(isSelected);
    
    // Show modal
    elements.modalOverlay.classList.add('modal-overlay--active');
    elements.productModal.classList.add('modal--active');
    document.body.style.overflow = 'hidden';
  }

  function updateModalButton(isSelected) {
    if (isSelected) {
      elements.modalSelectBtn.textContent = 'Remove from Selection';
      elements.modalSelectBtn.classList.add('modal__select-btn--selected');
    } else {
      elements.modalSelectBtn.textContent = 'Select Item';
      elements.modalSelectBtn.classList.remove('modal__select-btn--selected');
    }
  }

  function closeProductModal() {
    elements.modalOverlay.classList.remove('modal-overlay--active');
    elements.productModal.classList.remove('modal--active');
    document.body.style.overflow = '';
    currentItem = null;
    selectedSize = null;
  }

  // ===== SELECTION MANAGEMENT =====
  function toggleItemSelection() {
    if (!currentItem) return;
    
    const existingIdx = selectedItems.findIndex(s => s.item.name === currentItem.name);
    
    if (existingIdx >= 0) {
      // Remove from selection
      selectedItems.splice(existingIdx, 1);
    } else {
      // Add to selection
      const price = selectedSize ? selectedSize.price : currentItem.price;
      selectedItems.push({
        item: currentItem,
        size: selectedSize ? selectedSize.name : null,
        price: price
      });
    }
    
    updateSelectionUI();
    renderMenuItems(); // Re-render to update selected states
    closeProductModal();
  }

  function removeFromSelection(itemName) {
    selectedItems = selectedItems.filter(s => s.item.name !== itemName);
    updateSelectionUI();
    renderMenuItems();
  }

  function clearSelection() {
    selectedItems = [];
    updateSelectionUI();
    renderMenuItems();
    closeSelectionPanel();
  }

  function updateSelectionUI() {
    const count = selectedItems.length;
    
    // Update header counter
    elements.selectionCount.textContent = count;
    
    // Update floating button
    elements.floatingBadge.textContent = count;
    if (count > 0) {
      elements.floatingBtn.classList.remove('floating-btn--hidden');
    } else {
      elements.floatingBtn.classList.add('floating-btn--hidden');
    }
    
    // Update selection panel
    updateSelectionPanel();
  }

  function updateSelectionPanel() {
    const currency = menuData?.currency || 'USD';
    
    if (selectedItems.length === 0) {
      elements.selectionItems.innerHTML = '<p style="color:var(--text-muted);font-size:14px;">No items selected</p>';
      return;
    }
    
    elements.selectionItems.innerHTML = selectedItems.map(sel => `
      <div class="selection-item">
        <span class="selection-item__name">${escapeHtml(sel.item.name)}</span>
        ${sel.size ? `<span class="selection-item__size">(${escapeHtml(sel.size)})</span>` : ''}
        <button class="selection-item__remove" data-item="${escapeHtml(sel.item.name)}">×</button>
      </div>
    `).join('');
    
    // Add remove handlers
    elements.selectionItems.querySelectorAll('.selection-item__remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromSelection(btn.dataset.item);
      });
    });
  }

  function openSelectionPanel() {
    elements.selectionPanel.classList.add('selection-panel--active');
    document.body.style.overflow = 'hidden';
  }

  function closeSelectionPanel() {
    elements.selectionPanel.classList.remove('selection-panel--active');
    document.body.style.overflow = '';
  }

  function showToWaiter() {
    if (selectedItems.length === 0) return;
    
    // Build a simple text summary
    const lines = selectedItems.map(sel => {
      let line = sel.item.name;
      if (sel.size) line += ` (${sel.size})`;
      return line;
    });
    
    const message = 'Selected Items:\n\n' + lines.join('\n') + '\n\nPlease show this to your waiter.';
    
    alert(message);
  }

  // ===== EVENT HANDLERS =====
  function setupEventListeners() {
    // Search
    elements.searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderMenuItems();
    });
    
    // Selection button in header
    elements.selectionBtn.addEventListener('click', openSelectionPanel);
    
    // Floating button
    elements.floatingBtn.addEventListener('click', openSelectionPanel);
    
    // Selection panel
    elements.clearSelectionBtn.addEventListener('click', clearSelection);
    elements.showWaiterBtn.addEventListener('click', showToWaiter);
    
    // Product modal
    elements.modalClose.addEventListener('click', closeProductModal);
    elements.modalOverlay.addEventListener('click', closeProductModal);
    elements.modalSelectBtn.addEventListener('click', toggleItemSelection);
    
    // Close selection panel on click outside
    document.addEventListener('click', (e) => {
      if (elements.selectionPanel.classList.contains('selection-panel--active')) {
        if (!elements.selectionPanel.contains(e.target) && 
            !elements.floatingBtn.contains(e.target) &&
            !elements.selectionBtn.contains(e.target)) {
          closeSelectionPanel();
        }
      }
    });
    
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeProductModal();
        closeSelectionPanel();
      }
    });
  }

  // ===== INIT =====
  async function init() {
    showLoading();
    setupEventListeners();
    
    currentRestaurantId = getRestaurantIdFromUrl();
    applyTheme(currentRestaurantId);
    
    // Try to load logo
    const logoPath = `restaurants/${encodeURIComponent(currentRestaurantId)}/logo.png`;
    elements.restaurantLogo.onerror = () => {
      elements.restaurantLogo.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%2322c55e" width="100" height="100"/%3E%3Ctext x="50" y="60" text-anchor="middle" fill="white" font-size="40"%3E🍽️%3C/text%3E%3C/svg%3E';
    };
    elements.restaurantLogo.src = logoPath;
    
    try {
      menuData = await loadMenu(currentRestaurantId);
      updateHeader(menuData.restaurant);
      renderCategories(menuData.categories || []);
      renderMenuItems();
      showMenu();
      updateSelectionUI();
    } catch (error) {
      console.error('Failed to load menu:', error);
      showError(error.message || 'Failed to load menu. Please try again.');
    }
  }

  // Start
  init();
})();
