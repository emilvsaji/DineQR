/**
 * DineQR - Menu Showcase App
 * Simplified mobile-first menu interface with item selection for waiter
 */

import {
  getFirestore,
  collection,
  query,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "./firebase.js";

(function() {
  'use strict';

  // ===== CONFIG =====
  const DEFAULT_RESTAURANT = 'ajwa';
  const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f3f4f6" width="100" height="100"/%3E%3Ctext x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="30"%3E🍽️%3C/text%3E%3C/svg%3E';

  // Futuristic theme restaurants
  const FUTURISTIC_RESTAURANTS = [];

  // ===== STATE =====
  let menuData = null;
  let selectedItems = []; // { item, size, price, quantity }
  let activeCategory = 'all';
  let searchQuery = '';
  let currentItem = null;
  let currentRestaurantId = '';

  // ===== DOM ELEMENTS =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let elements = {};

  function initElements() {
    elements = {
      // Header
      restaurantLogo: $('#restaurantLogo'),
      restaurantName: $('#restaurantName'),
      restaurantTagline: $('#restaurantTagline'),
      restaurantAddress: $('#restaurantAddress'),
      restaurantHours: $('#restaurantHours'),
      restaurantInfo: $('#restaurantInfo'),
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
  }

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

  function formatPrice(value, currency = 'INR') {
    if (value === null || value === undefined) return '';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return String(value);
    
    try {
      return new Intl.NumberFormat('en-IN', { 
        style: 'currency', 
        currency: currency 
      }).format(num);
    } catch {
      return `₹${num.toFixed(2)}`;
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
    try {
      console.log('🚀 Loading menu for restaurant:', restaurantId);
      
      // First, try to load from Firestore
      const firestoreMenu = await loadMenuFromFirestore(restaurantId);
      if (firestoreMenu) {
        console.log('✅ Successfully loaded menu from Firestore with', firestoreMenu.categories.length, 'categories');
        return firestoreMenu;
      }
    } catch (error) {
      console.log('⚠️ Firestore loading failed, falling back to JSON:', error.message);
    }

    // Fallback to JSON files
    console.log('📄 Attempting to load from JSON files...');
    const pathname = window.location.pathname;
    let basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1);
    if (!basePath.endsWith('/')) basePath += '/';
    
    const paths = [
      `${basePath}restaurants/${encodeURIComponent(restaurantId)}/menu.json`,
      `./restaurants/${encodeURIComponent(restaurantId)}/menu.json`,
      `restaurants/${encodeURIComponent(restaurantId)}/menu.json`,
      `${window.location.origin}${basePath}restaurants/${encodeURIComponent(restaurantId)}/menu.json`,
    ];

    console.log('Base path:', basePath);
    console.log('Trying to load menu from paths:', paths);

    for (const path of paths) {
      try {
        console.log('Fetching:', path);
        const res = await fetch(path, { cache: 'no-store' });
        console.log('Response status:', res.status, 'for path:', path);
        
        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            console.log('Successfully loaded menu from:', path);
            return data;
          } else {
            const text = await res.text();
            try {
              const data = JSON.parse(text);
              console.log('Successfully loaded menu from:', path);
              return data;
            } catch (parseErr) {
              console.log('Response was not valid JSON from:', path);
            }
          }
        }
      } catch (e) {
        console.log('Failed to fetch from:', path, e.message);
      }
    }

    console.log('All paths failed, using fallback menu');
    return getFallbackMenu(restaurantId);
  }

  async function loadMenuFromFirestore(restaurantId) {
    try {
      console.log('🔍 Loading from Firestore: restaurants/' + restaurantId + '/menuItems');
      
      // Get restaurant info
      const restaurantDoc = await getDoc(doc(db, 'restaurants', restaurantId));
      if (!restaurantDoc.exists()) {
        console.log('⚠️ Restaurant document not found in Firestore');
        return null;
      }

      const restaurantData = restaurantDoc.data();
      console.log('✅ Restaurant found:', restaurantData.name || restaurantId);

      // Get menu items
      const menuItemsRef = collection(db, 'restaurants', restaurantId, 'menuItems');
      const menuItemsSnapshot = await getDocs(menuItemsRef);

      console.log('📊 Found', menuItemsSnapshot.size, 'items in Firestore');

      if (menuItemsSnapshot.empty) {
        console.log('⚠️ No menu items found in Firestore, will try JSON fallback');
        return null;
      }

      // Group items by category
      const categoriesMap = {};
      const menuItems = [];

      menuItemsSnapshot.forEach((docSnap) => {
        const item = { id: docSnap.id, ...docSnap.data() };
        menuItems.push(item);
        console.log('  📝 Item:', item.name, '- Category:', item.category, '- Price: ₹' + item.price);

        const categoryKey = item.category || 'other';
        if (!categoriesMap[categoryKey]) {
          categoriesMap[categoryKey] = {
            id: categoryKey,
            name: categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1).replace(/-/g, ' '),
            items: []
          };
        }

        // Convert Firestore item to menu format
        const menuItem = {
          id: item.id,
          name: item.name,
          description: item.description || '',
          price: item.price,
          image: item.image || '',
          available: item.available !== false,
          type: item.type || 'veg',
          tags: [],
          rating: item.rating || 4.5,
          prepTime: item.prepTime || '',
          deliveryCount: item.deliveryCount || 0,
        };
        
        // Add tags based on type
        if (item.type === 'bestseller' || item.type === 'Best Seller') {
          menuItem.tags.push('Bestseller');
        }
        if (item.type === 'new' || item.type === 'New Item') {
          menuItem.tags.push('New');
        }

        categoriesMap[categoryKey].items.push(menuItem);
      });

      // Convert categories map to array
      const categories = Object.values(categoriesMap);
      console.log('📂 Organized into', categories.length, 'categories:', categories.map(c => c.name).join(', '));

      return {
        currency: restaurantData.currency || 'INR',
        restaurant: {
          id: restaurantId,
          name: restaurantData.name || 'Restaurant',
          tagline: restaurantData.tagline || '',
          logoUrl: restaurantData.logoUrl || '',
          address: restaurantData.address || '',
          phone: restaurantData.phone || '',
          openHours: restaurantData.openHours || ''
        },
        categories: categories
      };
    } catch (error) {
      console.error('❌ Error loading from Firestore:', error);
      return null;
    }
  }

      return {
        currency: 'INR',
        restaurant: {
          id: restaurantId,
          name: restaurantData.name || 'Restaurant',
          tagline: restaurantData.tagline || 'Delicious • Fresh • Quality',
          address: restaurantData.address || '',
          hours: restaurantData.hours || '',
          logo: restaurantData.logo || '',
        },
        categories: categories
      };

    } catch (error) {
      console.error('Error loading from Firestore:', error);
      return null;
    }
  }

  function getFallbackMenu(restaurantId) {
    const fallbackMenus = {
      'ajwa': {
        "currency": "INR",
        "restaurant": {
          "id": "ajwa",
          "name": "Ajwa Kitchen",
          "tagline": "Authentic Arabian • Fresh • Delicious",
          "address": "123 Main St, City",
          "hours": "10:00 - 23:00",
          "info": "+91 98765 43210"
        },
        "categories": [
          {
            "name": "Mandi",
            "items": [
              {
                "name": "Chicken Mandi",
                "description": "Tender smoked chicken with aromatic rice",
                "available": true,
                "type": "non-veg",
                "sizes": [
                  { "name": "Quarter", "price": 199 },
                  { "name": "Half", "price": 349 },
                  { "name": "Full", "price": 599 }
                ]
              }
            ]
          }
        ]
      },
      'gogrill': {
        "currency": "INR",
        "restaurant": {
          "id": "gogrill",
          "name": "GoGrill",
          "tagline": "Grilled to Perfection"
        },
        "categories": [
          {
            "name": "Burgers",
            "items": [
              {
                "name": "Classic Burger",
                "description": "Juicy beef patty with fresh vegetables",
                "available": true,
                "type": "non-veg",
                "price": 299
              }
            ]
          }
        ]
      }
    };

    return fallbackMenus[restaurantId] || fallbackMenus['ajwa'];
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
    
    if (elements.restaurantName) elements.restaurantName.textContent = name;
    if (elements.restaurantTagline) elements.restaurantTagline.textContent = tagline;
    document.title = `${name} - Menu`;

    // Logo
    if (restaurant?.logoUrl && elements.restaurantLogo) {
      elements.restaurantLogo.src = restaurant.logoUrl;
    }

    // Address
    if (elements.restaurantAddress) {
      if (restaurant?.address) {
        elements.restaurantAddress.textContent = '📍 ' + restaurant.address;
        elements.restaurantAddress.classList.remove('hidden');
      } else {
        elements.restaurantAddress.classList.add('hidden');
      }
    }

    // Hours
    if (elements.restaurantHours) {
      const hours = restaurant?.hours || restaurant?.openHours;
      if (hours) {
        elements.restaurantHours.textContent = '🕒 ' + hours;
        elements.restaurantHours.classList.remove('hidden');
      } else {
        elements.restaurantHours.classList.add('hidden');
      }
    }

    // Info / Phone
    if (elements.restaurantInfo) {
      const info = restaurant?.info || restaurant?.phone;
      if (info) {
        elements.restaurantInfo.textContent = info;
        elements.restaurantInfo.classList.remove('hidden');
      } else {
        elements.restaurantInfo.classList.add('hidden');
      }
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
        
        html += `
          <article class="menu-card ${available ? '' : 'menu-card--unavailable'} ${selected ? 'menu-card--selected' : ''}" 
                   data-item-id="${escapeHtml(item.name)}">
            <div class="menu-card__image-wrap">
              <img class="menu-card__image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" 
                   onerror="this.src='${PLACEHOLDER_IMAGE}'">
            </div>
            <div class="menu-card__content">
              ${item.tags ? `<div class="tags">${item.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
              <h3 class="menu-card__name">${escapeHtml(item.name)}</h3>
              <p class="menu-card__desc">${escapeHtml(item.description || '')}</p>
              <div style="font-size:15px;font-weight:700;color:var(--primary-dark);margin-top:8px;">${formatPrice(displayPrice, currency)}</div>
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
        <div class="size-option ${i === 0 ? 'size-option--active' : ''}" 
             data-size-index="${i}">
          <div class="modal__size-name">${escapeHtml(size.name)}</div>
          <div class="modal__size-price">${formatPrice(size.price, currency)}</div>
        </div>
      `).join('');
      
      // Size click handlers
      elements.modalSizes.querySelectorAll('.size-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const idx = parseInt(opt.dataset.sizeIndex);
          selectedSize = item.sizes[idx];
          elements.modalSizes.querySelectorAll('.size-option').forEach(o => 
            o.classList.remove('size-option--active'));
          opt.classList.add('size-option--active');
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

    const sizeKey = selectedSize ? selectedSize.name : null;
    const existingIdx = selectedItems.findIndex(s =>
      s.item.name === currentItem.name && s.size === sizeKey
    );

    if (existingIdx >= 0) {
      // Remove from selection
      selectedItems.splice(existingIdx, 1);
    } else {
      // Add to selection
      const price = selectedSize ? selectedSize.price : currentItem.price;
      selectedItems.push({
        item: currentItem,
        size: sizeKey,
        price: price,
        quantity: 1
      });
    }

    updateSelectionUI();
    renderMenuItems(); // Re-render to update selected states
    closeProductModal();
  }

  function updateItemQuantity(itemName, size, delta) {
    const existingIdx = selectedItems.findIndex(s =>
      s.item.name === itemName && s.size === size
    );

    if (existingIdx >= 0) {
      selectedItems[existingIdx].quantity += delta;
      if (selectedItems[existingIdx].quantity <= 0) {
        selectedItems.splice(existingIdx, 1);
      }
    }

    updateSelectionUI();
    renderMenuItems();
  }

  function removeFromSelection(itemName, size) {
    const existingIdx = selectedItems.findIndex(s =>
      s.item.name === itemName && s.size === size
    );

    if (existingIdx >= 0) {
      selectedItems.splice(existingIdx, 1);
    }

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
        <div class="selection-item__info">
          <div class="selection-item__name">${escapeHtml(sel.item.name)}</div>
          ${sel.size ? `<div class="selection-item__size">${escapeHtml(sel.size)}</div>` : ''}
          <div class="selection-item__price">${formatPrice(sel.price, currency)}</div>
        </div>
        <div class="selection-item__controls">
          <button class="selection-item__qty-btn" data-action="decrease"
                  data-item="${escapeHtml(sel.item.name)}" data-size="${escapeHtml(sel.size || '')}">−</button>
          <span class="selection-item__qty">${sel.quantity}</span>
          <button class="selection-item__qty-btn" data-action="increase"
                  data-item="${escapeHtml(sel.item.name)}" data-size="${escapeHtml(sel.size || '')}">+</button>
        </div>
        <button class="selection-item__remove" data-item="${escapeHtml(sel.item.name)}"
                data-size="${escapeHtml(sel.size || '')}">×</button>
      </div>
    `).join('');

    // Add event handlers
    elements.selectionItems.querySelectorAll('.selection-item__qty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const itemName = btn.dataset.item;
        const size = btn.dataset.size || null;
        const delta = action === 'increase' ? 1 : -1;
        updateItemQuantity(itemName, size, delta);
      });
    });

    elements.selectionItems.querySelectorAll('.selection-item__remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemName = btn.dataset.item;
        const size = btn.dataset.size || null;
        removeFromSelection(itemName, size);
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
    
    const currency = menuData?.currency || 'USD';
    const restaurantName = menuData?.name || 'Restaurant';
    const tableNumber = getTableNumber();
    
    let summary = `🏪 ${restaurantName}\n`;
    if (tableNumber) summary += `📋 Table: ${tableNumber}\n`;
    summary += `⏰ ${new Date().toLocaleString()}\n\n`;
    
    summary += '📝 Order Summary:\n';
    summary += '─'.repeat(30) + '\n';
    
    selectedItems.forEach(sel => {
      summary += `${sel.quantity}x ${sel.item.name}`;
      if (sel.size) summary += ` (${sel.size})`;
      summary += ` - ${formatPrice(sel.price * sel.quantity, currency)}\n`;
    });
    
    summary += '─'.repeat(30) + '\n';
    const total = selectedItems.reduce((sum, sel) => sum + (sel.price * sel.quantity), 0);
    summary += `💰 Total: ${formatPrice(total, currency)}\n\n`;
    
    summary += '👨‍🍳 Please confirm your order with the waiter.';
    
    // Copy to clipboard and show alert
    if (navigator.clipboard) {
      navigator.clipboard.writeText(summary).then(() => {
        alert('Order summary copied to clipboard!\n\n' + summary);
      }).catch(() => {
        alert('Order summary:\n\n' + summary);
      });
    } else {
      alert('Order summary:\n\n' + summary);
    }
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
    // Initialize DOM elements first
    initElements();

    showLoading();
    setupEventListeners();

    currentRestaurantId = getRestaurantIdFromUrl();
    applyTheme(currentRestaurantId);

    // Build base path for GitHub Pages compatibility
    const pathname = window.location.pathname;
    let basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1);
    if (!basePath.endsWith('/')) basePath += '/';

    // Try to load logo
    const logoPath = `${basePath}restaurants/${encodeURIComponent(currentRestaurantId)}/logo.png`;
    elements.restaurantLogo.onerror = () => {
      elements.restaurantLogo.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%2322c55e" width="100" height="100"/%3E%3Ctext x="50" y="60" text-anchor="middle" fill="white" font-size="40"%3E🍽️%3C/text%3E%3C/svg%3E';
    };
    elements.restaurantLogo.src = logoPath;

    try {
      console.log('Loading menu for restaurant:', currentRestaurantId);
      menuData = await loadMenu(currentRestaurantId);
      console.log('Menu data loaded:', menuData);
      
      if (!menuData || !menuData.categories) {
        console.log('Invalid menu data, using fallback');
        menuData = getFallbackMenu(currentRestaurantId);
      }
      
      updateHeader(menuData.restaurant);
      renderCategories(menuData.categories || []);
      renderMenuItems();
      showMenu();
      updateSelectionUI();
    } catch (error) {
      console.error('Failed to load menu:', error);
      // Use fallback menu on error
      menuData = getFallbackMenu(currentRestaurantId);
      updateHeader(menuData.restaurant);
      renderCategories(menuData.categories || []);
      renderMenuItems();
      showMenu();
      updateSelectionUI();
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
