(() => {
"use strict";

const DATA = window.HELENA_DATA;
if (!DATA) {
  document.body.innerHTML = "<p style='padding:2rem;font-family:sans-serif'>data.js belum kebaca.</p>";
  return;
}

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const FAVORITES_KEY = "helenaDiaryFavoritesV1";
const ADMIN_SESSION_KEY = "helenaAdminPasswordSessionV1";

let remoteNotes = null;
let apiAvailable = true;
let activeFilter = "all";
let searchTerm = "";
let currentDialogNoteId = null;
let todayNoteId = null;
let toastTimer;
let adminPassword = sessionStorage.getItem(ADMIN_SESSION_KEY) || "";

const categoryMap = Object.fromEntries(DATA.categories.map(c => [c.id, c]));

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function favorites() {
  return new Set(readJSON(FAVORITES_KEY, []));
}

function allNotes() {
  const source = Array.isArray(remoteNotes) ? remoteNotes : (Array.isArray(DATA.notes) ? DATA.notes : []);
  return [...source].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function safeDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatDate(dateStr) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  }).format(safeDate(dateStr));
}

function daysSinceFirstNote() {
  const notes = allNotes();
  if (!notes.length) return 0;
  const first = [...notes].sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  return Math.max(1, Math.floor((new Date() - safeDate(first.date)) / 86400000) + 1);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1900);
}

async function apiRequest(method = "GET", body = null, password = adminPassword) {
  const headers = { "Accept": "application/json" };
  if (body !== null) headers["Content-Type"] = "application/json";
  if (password) headers["x-admin-password"] = password;

  const response = await fetch("/api/notes", {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    cache: "no-store"
  });

  let payload = {};
  try { payload = await response.json(); } catch {}

  if (!response.ok) {
    const err = new Error(payload.error || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return payload;
}

async function loadRemoteNotes({ quiet = false } = {}) {
  try {
    const payload = await apiRequest("GET");
    if (Array.isArray(payload.notes)) remoteNotes = payload.notes;
    apiAvailable = true;
    return true;
  } catch (error) {
    apiAvailable = false;
    if (!quiet) {
      console.warn("Live notes belum tersedia, pakai starter notes.", error);
    }
    return false;
  }
}

function setStaticCopy() {
  $("#hero-intro").textContent = DATA.site.intro;
  $("#footer-line").textContent = DATA.site.footer;
  $("#diary-cover-date").textContent = new Intl.DateTimeFormat("en", {
    month: "long", year: "numeric"
  }).format(new Date()).toLowerCase();
}

function updateStats() {
  $("#note-count").textContent = allNotes().length;
  $("#days-count").textContent = daysSinceFirstNote();
  $("#saved-count").textContent = favorites().size;
}

function renderFilters() {
  const wrap = $("#category-filters");
  const filters = [
    { id: "all", label: "all", icon: "♡" },
    ...DATA.categories,
    { id: "saved", label: "saved", icon: "♥" }
  ];

  wrap.innerHTML = "";
  filters.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-chip${item.id === activeFilter ? " active" : ""}`;
    btn.textContent = `${item.icon || ""} ${item.label}`.trim();
    btn.addEventListener("click", () => {
      activeFilter = item.id;
      renderFilters();
      renderNotes();
    });
    wrap.appendChild(btn);
  });
}

function filteredNotes() {
  const favs = favorites();
  const q = searchTerm.trim().toLowerCase();

  return allNotes().filter(note => {
    const filterMatch =
      activeFilter === "all" ||
      (activeFilter === "saved" && favs.has(note.id)) ||
      note.category === activeFilter;

    const haystack = `${note.title || ""} ${note.text || ""} ${note.category || ""}`.toLowerCase();
    return filterMatch && (!q || haystack.includes(q));
  });
}

function getNote(id) {
  return allNotes().find(n => n.id === id);
}

function createCard(note) {
  const favs = favorites();
  const cat = categoryMap[note.category] || { label: note.category || "note" };

  const card = document.createElement("article");
  card.className = "note-card reveal visible";
  card.tabIndex = 0;
  card.innerHTML = `
    <div class="note-card-top">
      <span class="note-card-icon">${note.icon || "♡"}</span>
      <span class="note-card-date">${formatDate(note.date)}</span>
    </div>
    <h3></h3>
    <p></p>
    <div class="card-footer">
      <span class="category-chip">${cat.label}</span>
      <button class="card-save${favs.has(note.id) ? " saved" : ""}" type="button"
        aria-label="${favs.has(note.id) ? "Hapus dari saved" : "Save note"}">${favs.has(note.id) ? "♥" : "♡"}</button>
    </div>`;

  $("h3", card).textContent = note.title || "little thing";
  $("p", card).textContent = note.text || "";

  card.addEventListener("click", e => {
    if (!e.target.closest(".card-save")) openNote(note.id);
  });
  card.addEventListener("keydown", e => {
    if (e.key === "Enter") openNote(note.id);
  });
  $(".card-save", card).addEventListener("click", e => {
    e.stopPropagation();
    toggleFavorite(note.id);
  });

  return card;
}

function renderNotes() {
  const grid = $("#notes-grid");
  grid.innerHTML = "";
  const notes = filteredNotes();
  notes.forEach(note => grid.appendChild(createCard(note)));
  $("#empty-state").hidden = notes.length !== 0;
}

function pickTodayNote() {
  const notes = allNotes();
  if (!notes.length) return null;
  const todayISO = new Date().toISOString().slice(0, 10);
  return notes.find(n => n.date <= todayISO) || notes[0];
}

function setTodayNote(note) {
  if (!note) {
    todayNoteId = null;
    $("#today-title").textContent = "belum ada note";
    $("#today-text").textContent = "note pertama nanti muncul di sini ♡";
    return;
  }

  todayNoteId = note.id;
  const cat = categoryMap[note.category] || { label: note.category || "note" };
  const favs = favorites();

  $("#today-icon").textContent = note.icon || "♡";
  $("#today-date").textContent = formatDate(note.date);
  $("#today-category").textContent = cat.label;
  $("#today-title").textContent = note.title || "little thing";
  $("#today-text").textContent = note.text || "";

  const save = $("#today-save");
  save.textContent = favs.has(note.id) ? "♥" : "♡";
  save.classList.toggle("saved", favs.has(note.id));
}

function randomNote(excludeId = null) {
  const pool = allNotes().filter(n => n.id !== excludeId);
  if (!pool.length) return allNotes()[0] || null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderLittleThings() {
  const wall = $("#little-things-wall");
  wall.innerHTML = "";
  DATA.littleThings.forEach(text => {
    const el = document.createElement("span");
    el.className = "thing-sticker";
    el.textContent = text;
    wall.appendChild(el);
  });
}

function renderMusic() {
  const grid = $("#music-grid");
  grid.innerHTML = "";
  DATA.music.forEach(song => {
    const card = document.createElement("article");
    card.className = "music-card reveal visible";
    card.innerHTML = `
      <div class="music-disc" aria-hidden="true"></div>
      <h3></h3><p></p><span class="music-vibe"></span>`;

    $("h3", card).textContent = song.artist || "artist";
    $("p", card).textContent = song.title || "song";
    $(".music-vibe", card).textContent = song.vibe || "";

    if (song.url) {
      const link = document.createElement("a");
      link.className = "music-link";
      link.href = song.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "open ↗";
      card.appendChild(link);
    }
    grid.appendChild(card);
  });
}

function refreshPublicUI({ keepToday = true } = {}) {
  updateStats();
  renderFilters();
  renderNotes();

  if (keepToday && todayNoteId && getNote(todayNoteId)) {
    setTodayNote(getNote(todayNoteId));
  } else {
    setTodayNote(pickTodayNote());
  }
}

function toggleFavorite(noteId) {
  const favs = favorites();

  if (favs.has(noteId)) {
    favs.delete(noteId);
    showToast("udah ga disave");
  } else {
    favs.add(noteId);
    showToast("disimpen ♡");
  }

  writeJSON(FAVORITES_KEY, [...favs]);
  refreshPublicUI();
  if (currentDialogNoteId) fillDialog(getNote(currentDialogNoteId));
}

function fillDialog(note) {
  if (!note) return;
  currentDialogNoteId = note.id;
  const cat = categoryMap[note.category] || { label: note.category || "note" };
  const saved = favorites().has(note.id);

  $("#dialog-icon").textContent = note.icon || "♡";
  $("#dialog-date").textContent = formatDate(note.date);
  $("#dialog-category").textContent = cat.label;
  $("#dialog-title").textContent = note.title || "little thing";
  $("#dialog-text").textContent = note.text || "";
  $("#dialog-save").textContent = saved ? "♥ saved" : "♡ save this one";
}

function openNote(noteId) {
  const note = getNote(noteId);
  if (!note) return;
  fillDialog(note);
  $("#note-dialog").showModal();
}

function setupDialog() {
  $("#dialog-close").addEventListener("click", () => $("#note-dialog").close());
  $("#dialog-save").addEventListener("click", () => {
    if (currentDialogNoteId) toggleFavorite(currentDialogNoteId);
  });
}

function setupRandom() {
  $("#random-note-hero").addEventListener("click", () => {
    const note = randomNote();
    if (note) openNote(note.id);
  });

  $("#shuffle-today").addEventListener("click", () => {
    const note = randomNote(todayNoteId);
    if (note) setTodayNote(note);
  });

  $("#random-fact-button").addEventListener("click", () => {
    const pool = [
      ...DATA.littleThings,
      ...allNotes().map(n => n.text).filter(Boolean)
    ];
    $("#random-fact").textContent =
      pool[Math.floor(Math.random() * pool.length)] || "belum ada little thing.";
  });
}

function setupSearch() {
  $("#search-input").addEventListener("input", e => {
    searchTerm = e.target.value;
    renderNotes();
  });
}

function setupReveal() {
  if (!("IntersectionObserver" in window)) {
    $$(".reveal").forEach(el => el.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .08 });

  $$(".reveal").forEach(el => observer.observe(el));
}

/* ---------------- Live Admin ---------------- */

function adminModeEnabled() {
  return new URLSearchParams(location.search).get("admin") === "1";
}

function setAdminView(unlocked) {
  $("#admin-login-view").hidden = unlocked;
  $("#admin-editor-view").hidden = !unlocked;
}

function adminStatus(text) {
  $("#admin-sync-status").textContent = text;
}

function fillAdminCategories() {
  const select = $("#admin-note-category");
  select.innerHTML = "";
  DATA.categories.forEach(c => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = `${c.icon} ${c.label}`;
    select.appendChild(option);
  });
}

function clearAdminForm() {
  $("#admin-note-id").value = "";
  $("#admin-note-date").value = new Date().toISOString().slice(0, 10);
  $("#admin-note-icon").value = "🎀";
  $("#admin-note-category").value = DATA.categories[0]?.id || "cute";
  $("#admin-note-title").value = "";
  $("#admin-note-text").value = "";
}

function openAdminForm(note = null) {
  $("#admin-note-form").hidden = false;

  if (!note) {
    clearAdminForm();
    $("#admin-note-title").focus();
    return;
  }

  $("#admin-note-id").value = note.id;
  $("#admin-note-date").value = note.date;
  $("#admin-note-icon").value = note.icon || "♡";
  $("#admin-note-category").value = note.category;
  $("#admin-note-title").value = note.title || "";
  $("#admin-note-text").value = note.text || "";
  $("#admin-note-title").focus();
}

function closeAdminForm() {
  $("#admin-note-form").hidden = true;
  clearAdminForm();
}

function renderAdminList() {
  const list = $("#admin-note-list");
  list.innerHTML = "";

  allNotes().forEach(note => {
    const item = document.createElement("div");
    item.className = "admin-list-item";

    const copy = document.createElement("div");
    copy.className = "admin-list-copy";

    const meta = document.createElement("div");
    meta.className = "admin-list-meta";
    meta.textContent = `${note.icon || "♡"} ${formatDate(note.date)} · ${categoryMap[note.category]?.label || note.category}`;

    const title = document.createElement("div");
    title.className = "admin-list-title";
    title.textContent = note.title || "little thing";

    const preview = document.createElement("div");
    preview.className = "admin-list-preview";
    preview.textContent = note.text || "";

    copy.append(meta, title, preview);

    const actions = document.createElement("div");
    actions.className = "admin-list-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "admin-icon-btn";
    edit.textContent = "edit";
    edit.addEventListener("click", () => openAdminForm(note));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "admin-icon-btn danger";
    del.textContent = "hapus";
    del.addEventListener("click", () => deleteAdminNote(note));

    actions.append(edit, del);
    item.append(copy, actions);
    list.appendChild(item);
  });
}

async function verifyAdminPassword(password) {
  await apiRequest("POST", { action: "verify" }, password);
  adminPassword = password;
  sessionStorage.setItem(ADMIN_SESSION_KEY, password);
}

async function refreshAdminAndPublic() {
  adminStatus("syncing...");
  const ok = await loadRemoteNotes({ quiet: true });

  if (!ok) {
    adminStatus("gagal sync");
    showToast("ga bisa sync ke Netlify");
    return false;
  }

  refreshPublicUI({ keepToday: false });
  renderAdminList();
  adminStatus(`${allNotes().length} notes · synced`);
  return true;
}

async function submitAdminNote(event) {
  event.preventDefault();

  const existingId = $("#admin-note-id").value.trim();
  const note = {
    ...(existingId ? { id: existingId } : {}),
    date: $("#admin-note-date").value,
    category: $("#admin-note-category").value,
    icon: $("#admin-note-icon").value.trim() || "♡",
    title: $("#admin-note-title").value.trim(),
    text: $("#admin-note-text").value.trim()
  };

  if (!note.title || !note.text) {
    showToast("judul sama isinya belum lengkap");
    return;
  }

  adminStatus("saving...");

  try {
    await apiRequest(existingId ? "PUT" : "POST", note);
    closeAdminForm();
    await refreshAdminAndPublic();
    showToast(existingId ? "note udah diedit ♡" : "note baru masuk ♡");
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      adminPassword = "";
      setAdminView(false);
      $("#admin-login-error").textContent = "session admin habis. masuk lagi yaa.";
    } else {
      showToast(error.message || "gagal save note");
    }
    adminStatus("save gagal");
  }
}

async function deleteAdminNote(note) {
  const yes = confirm(`hapus note "${note.title}"?`);
  if (!yes) return;

  adminStatus("deleting...");

  try {
    await apiRequest("DELETE", { id: note.id });
    favorites().delete?.(note.id);
    closeAdminForm();
    await refreshAdminAndPublic();
    showToast("note udah dihapus");
  } catch (error) {
    showToast(error.message || "gagal hapus note");
    adminStatus("hapus gagal");
  }
}

function setupAdmin() {
  if (!adminModeEnabled()) return;

  const floating = $("#admin-floating-button");
  floating.hidden = false;
  fillAdminCategories();
  clearAdminForm();

  floating.addEventListener("click", async () => {
    $("#admin-dialog").showModal();

    if (adminPassword) {
      try {
        await verifyAdminPassword(adminPassword);
        setAdminView(true);
        await refreshAdminAndPublic();
      } catch {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        adminPassword = "";
        setAdminView(false);
      }
    } else {
      setAdminView(false);
    }
  });

  $("#admin-close").addEventListener("click", () => $("#admin-dialog").close());
  $("#admin-add-note").addEventListener("click", () => openAdminForm());
  $("#admin-cancel-edit").addEventListener("click", closeAdminForm);
  $("#admin-note-form").addEventListener("submit", submitAdminNote);
  $("#admin-refresh").addEventListener("click", refreshAdminAndPublic);

  $("#admin-login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("#admin-password").value;
    const errorEl = $("#admin-login-error");
    errorEl.textContent = "";

    try {
      await verifyAdminPassword(password);
      $("#admin-password").value = "";
      setAdminView(true);
      await refreshAdminAndPublic();
    } catch (error) {
      errorEl.textContent =
        error.status === 401
          ? "passwordnya salahh. clue-nya: ultah 🎂"
          : "ga bisa nyambung ke server.";
    }
  });
}

async function init() {
  setStaticCopy();
  renderLittleThings();
  renderMusic();
  setupDialog();
  setupRandom();
  setupSearch();
  setupAdmin();

  await loadRemoteNotes();
  renderFilters();
  renderNotes();
  updateStats();
  setTodayNote(pickTodayNote());
  setupReveal();

  $("#today-save").addEventListener("click", () => {
    if (todayNoteId) toggleFavorite(todayNoteId);
  });

  // Kalau Len buka cukup lama, notes otomatis refresh tanpa reload.
  setInterval(async () => {
    const ok = await loadRemoteNotes({ quiet: true });
    if (ok) refreshPublicUI();
  }, 90000);
}

document.addEventListener("DOMContentLoaded", init);
})();
