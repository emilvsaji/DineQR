/*
  DineQR Owner Page

  Tech:
  - Vanilla JS
  - Firebase Authentication (email/password)
  - Firestore as source of truth (real-time)

  Shared Firebase init:
  - ../js/firebase-config.js (fill in)
  - ../js/firebase.js (exports auth/db)

  Data model used by this owner UI:
  - owners/{uid} -> { restaurantId: "ajwa" }
  - restaurants/{restaurantId} -> { name: "..." }
  - restaurants/{restaurantId}/categories/{categoryId} -> { name: "...", enabled: true }
  - restaurants/{restaurantId}/categories/{categoryId}/items/{itemId} -> { name, price, type: "veg"|"non-veg", available }

  Security expectation:
  - Firestore rules enforce that an owner can only read/write their own docs.
*/

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { auth, db } from "../js/firebase.js";

const $ = (sel) => document.querySelector(sel);

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function setBusy(buttonEl, isBusy, busyText) {
  if (!buttonEl) return;
  buttonEl.disabled = isBusy;
  if (busyText) buttonEl.textContent = isBusy ? busyText : buttonEl.dataset.idleText;
}

function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), waitMs);
  };
}

function moneyToNumber(value) {
  const num = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(num) ? num : null;
}

function getPage() {
  return document.body?.dataset?.page || "";
}

function redirectTo(path) {
  window.location.href = path;
}

function getPublicMenuUrl(restaurantId) {
  // Customer app supports: index.html?r=<id>
  return new URL(`../index.html?r=${encodeURIComponent(restaurantId)}`, window.location.href).toString();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

// -----------------------------
// Login
// -----------------------------
function initLoginPage() {
  const form = $("#loginForm");
  const emailEl = $("#email");
  const passwordEl = $("#password");
  const loginBtn = $("#loginBtn");
  const msgEl = $("#loginMessage");

  if (loginBtn) loginBtn.dataset.idleText = loginBtn.textContent;

  // If already signed in, go straight to dashboard.
  onAuthStateChanged(auth, (user) => {
    if (user) redirectTo("./dashboard.html");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    setText(msgEl, "");
    const email = String(emailEl?.value || "").trim();
    const password = String(passwordEl?.value || "");

    if (!email || !password) {
      setText(msgEl, "Please enter email and password.");
      return;
    }

    try {
      setBusy(loginBtn, true, "Logging in…");
      await signInWithEmailAndPassword(auth, email, password);
      redirectTo("./dashboard.html");
    } catch (err) {
      const msg = err?.message ? String(err.message) : "Login failed";
      setText(msgEl, msg);
    } finally {
      setBusy(loginBtn, false, "Logging in…");
    }
  });
}

// -----------------------------
// Dashboard
// -----------------------------
function initDashboardPage() {
  const restaurantNameEl = $("#restaurantName");
  const logoutBtn = $("#logoutBtn");
  const publicUrlEl = $("#publicUrl");
  const copyUrlBtn = $("#copyUrlBtn");
  const qrBtn = $("#qrBtn");
  const qrWrap = $("#qrWrap");
  const qrCanvas = $("#qrCanvas");
  const topStatus = $("#topStatus");

  const setupWrap = $("#setupWrap");
  const setupRestaurantNameEl = $("#setupRestaurantName");
  const setupRestaurantIdEl = $("#setupRestaurantId");
  const setupSaveBtn = $("#setupSaveBtn");
  const setupStatus = $("#setupStatus");

  const addCategoryBtn = $("#addCategoryBtn");

  const menuWrap = $("#menuWrap");
  const menuStatus = $("#menuStatus");
  const categoriesEl = $("#categories");

  let restaurantId = null;
  let currentUser = null;
  let restaurantUnsub = null;
  let categoriesUnsub = null;
  const itemsUnsubs = new Map(); // categoryId -> unsubscribe

  // In-memory state for rendering
  const state = {
    categories: new Map(), // id -> { id, name, enabled }
    itemsByCategory: new Map(), // catId -> Map(itemId -> item)
  };

  function setStatus(text) {
    setText(topStatus, text || "");
  }

  function setMenuStatus(text) {
    if (!menuStatus) return;
    menuStatus.textContent = text || "";
    menuStatus.style.display = text ? "block" : "none";
  }

  function showSetup(message) {
    if (setupWrap) setupWrap.hidden = false;
    if (menuWrap) menuWrap.hidden = true;
    setText(restaurantNameEl, "Owner");
    setText(setupStatus, message || "");
    setupRestaurantIdEl?.focus();
  }

  function hideSetup() {
    if (setupWrap) setupWrap.hidden = true;
    if (menuWrap) menuWrap.hidden = false;
    setText(setupStatus, "");
  }

  function render() {
    if (!categoriesEl) return;

    const categories = Array.from(state.categories.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

    categoriesEl.innerHTML = "";

    if (!categories.length) {
      setMenuStatus("No categories yet.");
      return;
    }

    setMenuStatus("");

    for (const cat of categories) {
      const catWrap = document.createElement("div");
      catWrap.className = "category";

      const head = document.createElement("div");
      head.className = "category__head";

      const nameInput = document.createElement("input");
      nameInput.className = "field__input category__name-input";
      nameInput.value = cat.name || "";
      nameInput.placeholder = "Category name";

      const saveCategoryName = debounce(async () => {
        if (!restaurantId) return;
        const next = String(nameInput.value || "").trim();
        if (!next) return;
        try {
          setStatus("Saving…");
          await updateDoc(doc(db, "restaurants", restaurantId, "categories", cat.id), {
            name: next,
            updatedAt: serverTimestamp(),
          });
          setStatus("");
        } catch {
          setStatus("Failed to update category name.");
        }
      }, 450);

      nameInput.addEventListener("input", saveCategoryName);

      const actions = document.createElement("div");
      actions.className = "category__actions";

      // Category enabled toggle
      const switchWrap = document.createElement("label");
      switchWrap.className = "switch";

      const switchLabel = document.createElement("span");
      switchLabel.className = "switch__label";
      switchLabel.textContent = "Enabled";

      const switchInput = document.createElement("input");
      switchInput.className = "switch__input";
      switchInput.type = "checkbox";
      switchInput.checked = cat.enabled !== false;
      switchInput.addEventListener("change", async () => {
        if (!restaurantId) return;
        try {
          setStatus("Saving…");
          await updateDoc(doc(db, "restaurants", restaurantId, "categories", cat.id), {
            enabled: !!switchInput.checked,
            updatedAt: serverTimestamp(),
          });
          setStatus("");
        } catch {
          setStatus("Failed to update category.");
        }
      });

      switchWrap.appendChild(switchLabel);
      switchWrap.appendChild(switchInput);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn--secondary";
      addBtn.textContent = "Add item";

      actions.appendChild(switchWrap);
      actions.appendChild(addBtn);

      head.appendChild(nameInput);
      head.appendChild(actions);
      catWrap.appendChild(head);

      const itemsWrap = document.createElement("div");
      itemsWrap.className = "items";

      const itemsMap = state.itemsByCategory.get(cat.id) || new Map();
      const items = Array.from(itemsMap.values()).sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "status";
        empty.textContent = "No items in this category.";
        catWrap.appendChild(empty);
      } else {
        for (const item of items) {
          itemsWrap.appendChild(renderItem(cat.id, item, categories));
        }
        catWrap.appendChild(itemsWrap);
      }

      // Inline add form
      const addWrap = document.createElement("div");
      addWrap.className = "add-item";
      addWrap.hidden = true;

      const addForm = document.createElement("form");
      addForm.className = "form";

      const addName = document.createElement("input");
      addName.className = "field__input";
      addName.placeholder = "Item name";
      addName.required = true;

      const addPrice = document.createElement("input");
      addPrice.className = "field__input";
      addPrice.placeholder = "Price";
      addPrice.inputMode = "decimal";
      addPrice.required = true;

      const addType = document.createElement("select");
      addType.className = "field__select";
      addType.innerHTML = `
        <option value="veg">Veg</option>
        <option value="non-veg">Non-veg</option>
      `;

      const addAvailWrap = document.createElement("label");
      addAvailWrap.className = "switch";
      const addAvailLabel = document.createElement("span");
      addAvailLabel.className = "switch__label";
      addAvailLabel.textContent = "Available";
      const addAvail = document.createElement("input");
      addAvail.className = "switch__input";
      addAvail.type = "checkbox";
      addAvail.checked = true;
      addAvailWrap.appendChild(addAvailLabel);
      addAvailWrap.appendChild(addAvail);

      const addSubmit = document.createElement("button");
      addSubmit.type = "submit";
      addSubmit.className = "btn btn--primary";
      addSubmit.textContent = "Add";

      const addCancel = document.createElement("button");
      addCancel.type = "button";
      addCancel.className = "btn btn--ghost";
      addCancel.textContent = "Cancel";

      addForm.appendChild(addName);
      addForm.appendChild(addPrice);
      addForm.appendChild(addType);
      addForm.appendChild(addAvailWrap);

      const addButtons = document.createElement("div");
      addButtons.className = "row";
      addButtons.appendChild(addSubmit);
      addButtons.appendChild(addCancel);
      addForm.appendChild(addButtons);

      addWrap.appendChild(addForm);
      catWrap.appendChild(addWrap);

      addBtn.addEventListener("click", () => {
        addWrap.hidden = !addWrap.hidden;
        if (!addWrap.hidden) addName.focus();
      });

      addCancel.addEventListener("click", () => {
        addWrap.hidden = true;
      });

      addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!restaurantId) return;

        const nameVal = String(addName.value || "").trim();
        const priceVal = moneyToNumber(addPrice.value);
        const typeVal = String(addType.value || "veg");

        if (!nameVal) return;
        if (priceVal === null) {
          setStatus("Enter a valid price.");
          return;
        }

        try {
          setStatus("Saving…");
          addSubmit.disabled = true;
          await addDoc(collection(db, "restaurants", restaurantId, "categories", cat.id, "items"), {
            name: nameVal,
            price: priceVal,
            type: typeVal,
            available: !!addAvail.checked,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          addName.value = "";
          addPrice.value = "";
          addType.value = "veg";
          addAvail.checked = true;
          addWrap.hidden = true;
          setStatus("");
        } catch {
          setStatus("Failed to add item.");
        } finally {
          addSubmit.disabled = false;
        }
      });

      categoriesEl.appendChild(catWrap);
    }
  }

  async function moveItem(oldCategoryId, itemId, newCategoryId) {
    if (!restaurantId) return false;
    if (!oldCategoryId || !newCategoryId) return false;
    if (oldCategoryId === newCategoryId) return true;

    const oldRef = doc(db, "restaurants", restaurantId, "categories", oldCategoryId, "items", itemId);
    const newRef = doc(db, "restaurants", restaurantId, "categories", newCategoryId, "items", itemId);

    const ok = window.confirm("Move this item to the selected category?");
    if (!ok) return false;

    try {
      setStatus("Moving…");
      const oldSnap = await getDoc(oldRef);
      if (!oldSnap.exists()) {
        setStatus("Item not found.");
        return false;
      }

      const newSnap = await getDoc(newRef);
      if (newSnap.exists()) {
        setStatus("An item with the same id already exists in that category.");
        return false;
      }

      const data = oldSnap.data() || {};
      await setDoc(newRef, { ...data, updatedAt: serverTimestamp() });
      await deleteDoc(oldRef);
      setStatus("");
      return true;
    } catch (e) {
      console.error(e);
      setStatus("Failed to move item.");
      return false;
    }
  }

  function renderItem(categoryId, item, allCategories) {
    const wrap = document.createElement("div");
    wrap.className = "item";

    const top = document.createElement("div");
    top.className = "item__top";

    const typeSelect = document.createElement("select");
    typeSelect.className = "field__select item__type";
    typeSelect.innerHTML = `
      <option value="">Type</option>
      <option value="veg">Veg</option>
      <option value="non-veg">Non-veg</option>
    `;
    {
      const t = String(item.type || "").toLowerCase();
      if (t === "veg") typeSelect.value = "veg";
      else if (t === "non-veg" || t === "nonveg") typeSelect.value = "non-veg";
      else typeSelect.value = "";
    }

    const availWrap = document.createElement("label");
    availWrap.className = "switch";
    const availLabel = document.createElement("span");
    availLabel.className = "switch__label";
    const avail = document.createElement("input");
    avail.className = "switch__input";
    avail.type = "checkbox";
    avail.checked = item.available !== false;

    const syncAvailLabel = () => {
      availLabel.textContent = avail.checked ? "Available" : "Sold out";
    };
    syncAvailLabel();

    availWrap.appendChild(availLabel);
    availWrap.appendChild(avail);

    top.appendChild(typeSelect);
    top.appendChild(availWrap);
    wrap.appendChild(top);

    const grid = document.createElement("div");
    grid.className = "item__grid";

    const nameInput = document.createElement("input");
    nameInput.className = "field__input";
    nameInput.value = item.name || "";
    nameInput.placeholder = "Item name";

    const priceInput = document.createElement("input");
    priceInput.className = "field__input";
    priceInput.value = item.price ?? "";
    priceInput.placeholder = "Price";
    priceInput.inputMode = "decimal";

    grid.appendChild(nameInput);
    grid.appendChild(priceInput);
    wrap.appendChild(grid);

    const meta = document.createElement("div");
    meta.className = "item__meta";

    const categorySelect = document.createElement("select");
    categorySelect.className = "field__select";

    const cats = Array.isArray(allCategories) ? allCategories : [];
    categorySelect.innerHTML = cats
      .map((c) => {
        const selected = c.id === categoryId ? " selected" : "";
        const label = String(c.name || "(Unnamed)");
        return `<option value="${String(c.id).replace(/"/g, "&quot;")}"${selected}>${label}</option>`;
      })
      .join("");

    meta.appendChild(categorySelect);
    wrap.appendChild(meta);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn item__danger";
    delBtn.textContent = "Delete item";
    delBtn.style.marginTop = "10px";
    wrap.appendChild(delBtn);

    const itemRef = () => doc(db, "restaurants", restaurantId, "categories", categoryId, "items", item.id);

    avail.addEventListener("change", async () => {
      if (!restaurantId) return;
      try {
        setStatus("Saving…");
        syncAvailLabel();
        await updateDoc(itemRef(), { available: !!avail.checked, updatedAt: serverTimestamp() });
        setStatus("");
      } catch {
        setStatus("Failed to update availability.");
      }
    });

    typeSelect.addEventListener("change", async () => {
      if (!restaurantId) return;
      try {
        setStatus("Saving…");
        const nextType = String(typeSelect.value || "").trim();
        await updateDoc(itemRef(), { type: nextType, updatedAt: serverTimestamp() });
        setStatus("");
      } catch {
        setStatus("Failed to update type.");
      }
    });

    categorySelect.addEventListener("change", async () => {
      const nextCatId = String(categorySelect.value || "").trim();
      if (!nextCatId || nextCatId === categoryId) return;
      const moved = await moveItem(categoryId, item.id, nextCatId);
      if (!moved) {
        categorySelect.value = categoryId;
      }
    });

    const saveName = debounce(async () => {
      if (!restaurantId) return;
      const val = String(nameInput.value || "").trim();
      if (!val) return;
      try {
        setStatus("Saving…");
        await updateDoc(itemRef(), { name: val, updatedAt: serverTimestamp() });
        setStatus("");
      } catch {
        setStatus("Failed to update name.");
      }
    }, 450);

    const savePrice = debounce(async () => {
      if (!restaurantId) return;
      const val = moneyToNumber(priceInput.value);
      if (val === null) return;
      try {
        setStatus("Saving…");
        await updateDoc(itemRef(), { price: val, updatedAt: serverTimestamp() });
        setStatus("");
      } catch {
        setStatus("Failed to update price.");
      }
    }, 450);

    nameInput.addEventListener("input", saveName);
    priceInput.addEventListener("input", savePrice);

    delBtn.addEventListener("click", async () => {
      if (!restaurantId) return;
      const ok = window.confirm(`Delete “${item.name || "this item"}”?`);
      if (!ok) return;

      try {
        setStatus("Deleting…");
        await deleteDoc(itemRef());
        setStatus("");
      } catch {
        setStatus("Failed to delete item.");
      }
    });

    return wrap;
  }

  function clearRealtimeListeners() {
    if (restaurantUnsub) restaurantUnsub();
    restaurantUnsub = null;

    if (categoriesUnsub) categoriesUnsub();
    categoriesUnsub = null;

    for (const unsub of itemsUnsubs.values()) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    itemsUnsubs.clear();
  }

  async function resolveRestaurantIdForOwner(user) {
    const ownerRef = doc(db, "owners", user.uid);
    const ownerSnap = await getDoc(ownerRef);
    if (!ownerSnap.exists()) return null;
    const data = ownerSnap.data() || {};
    return typeof data.restaurantId === "string" ? data.restaurantId.trim() : null;
  }

  async function linkOwnerToRestaurant(user, nextRestaurantId) {
    const ownerRef = doc(db, "owners", user.uid);
    await setDoc(
      ownerRef,
      {
        restaurantId: nextRestaurantId,
        email: user.email || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function ensureRestaurantDoc(nextRestaurantId, maybeName) {
    const name = String(maybeName || "").trim();
    if (!name) return;
    await setDoc(
      doc(db, "restaurants", nextRestaurantId),
      {
        id: nextRestaurantId,
        name,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  function startRealtime() {
    if (!restaurantId) return;

    hideSetup();

    // Restaurant doc (name)
    restaurantUnsub = onSnapshot(doc(db, "restaurants", restaurantId), (snap) => {
      const data = snap.data() || {};
      setText(restaurantNameEl, data.name || restaurantId);
    });

    // Public menu URL + QR
    const menuUrl = getPublicMenuUrl(restaurantId);
    if (publicUrlEl) publicUrlEl.value = menuUrl;

    copyUrlBtn?.addEventListener("click", async () => {
      const ok = await copyToClipboard(menuUrl);
      setStatus(ok ? "Copied." : "Copy failed.");
      window.setTimeout(() => setStatus(""), 1200);
    });

    qrBtn?.addEventListener("click", async () => {
      if (!qrWrap || !qrCanvas) return;
      const show = !!qrWrap.hidden;
      qrWrap.hidden = !show;
      if (!show) return;

      // Uses the included qrcode library (global QRCode)
      try {
        if (typeof window.QRCode?.toCanvas !== "function") {
          setStatus("QR library not loaded.");
          return;
        }
        await window.QRCode.toCanvas(qrCanvas, menuUrl, {
          width: 220,
          margin: 1,
        });
      } catch {
        setStatus("Failed to generate QR.");
      }
    });

    // Categories + Items (real-time)
    const catsRef = collection(db, "restaurants", restaurantId, "categories");
    const catsQuery = query(catsRef, orderBy("name"));

    categoriesUnsub = onSnapshot(
      catsQuery,
      (snap) => {
        const nextCategories = new Map();

        snap.forEach((d) => {
          const data = d.data() || {};
          nextCategories.set(d.id, {
            id: d.id,
            name: data.name || "",
            enabled: data.enabled !== false,
          });
        });

        // Remove listeners for deleted categories
        for (const existingId of state.categories.keys()) {
          if (!nextCategories.has(existingId)) {
            const unsub = itemsUnsubs.get(existingId);
            if (unsub) unsub();
            itemsUnsubs.delete(existingId);
            state.itemsByCategory.delete(existingId);
          }
        }

        state.categories = nextCategories;

        // Ensure items listeners exist
        for (const catId of state.categories.keys()) {
          if (itemsUnsubs.has(catId)) continue;
          const itemsRef = collection(db, "restaurants", restaurantId, "categories", catId, "items");
          const itemsQuery = query(itemsRef, orderBy("name"));

          const unsub = onSnapshot(itemsQuery, (itemsSnap) => {
            const map = new Map();
            itemsSnap.forEach((it) => {
              const data = it.data() || {};
              map.set(it.id, {
                id: it.id,
                name: data.name || "",
                price: data.price,
                type: data.type || "",
                available: data.available !== false,
              });
            });
            state.itemsByCategory.set(catId, map);
            render();
          });

          itemsUnsubs.set(catId, unsub);
        }

        render();
      },
      (err) => {
        setMenuStatus("Failed to load menu.");
        console.error(err);
      }
    );
  }

  logoutBtn?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      redirectTo("./login.html");
    } catch {
      setStatus("Logout failed.");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    clearRealtimeListeners();
    currentUser = user;

    if (!user) {
      redirectTo("./login.html");
      return;
    }

    try {
      setMenuStatus("Loading menu…");
      restaurantId = await resolveRestaurantIdForOwner(user);
      if (!restaurantId) {
        setMenuStatus("");
        showSetup("No restaurant linked yet.");
        return;
      }
      startRealtime();
    } catch (e) {
      console.error(e);
      setMenuStatus("");
      showSetup("Failed to load owner profile.");
    }
  });

  setupSaveBtn?.addEventListener("click", async () => {
    if (!currentUser) return;
    const nextId = String(setupRestaurantIdEl?.value || "").trim();
    const nextName = String(setupRestaurantNameEl?.value || "").trim();
    if (!nextId) {
      setText(setupStatus, "Enter your restaurant id.");
      return;
    }
    try {
      setupSaveBtn.disabled = true;
      setText(setupStatus, "Linking…");
      await ensureRestaurantDoc(nextId, nextName);
      await linkOwnerToRestaurant(currentUser, nextId);
      restaurantId = nextId;
      setText(setupStatus, "Linked.");
      startRealtime();
    } catch (e) {
      console.error(e);
      setText(setupStatus, "Failed to link. Check Firestore rules.");
    } finally {
      setupSaveBtn.disabled = false;
    }
  });

  addCategoryBtn?.addEventListener("click", async () => {
    if (!restaurantId) {
      setStatus("Link a restaurant first.");
      return;
    }

    const name = window.prompt("Category name:");
    const trimmed = String(name || "").trim();
    if (!trimmed) return;

    try {
      setStatus("Saving…");
      await addDoc(collection(db, "restaurants", restaurantId, "categories"), {
        name: trimmed,
        enabled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Failed to add category.");
    }
  });
}

// -----------------------------
// Boot
// -----------------------------
const page = getPage();
if (page === "login") initLoginPage();
if (page === "dashboard") initDashboardPage();
