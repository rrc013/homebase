import { createBackend, TABLES } from './db.js';
import {
  S, $app, $sheet, $toast, NOTE_COLORS, MEMBER_COLORS,
  KID_EMOJIS, PARENT_EMOJIS, LIST_EMOJIS, STORE_EMOJIS, GROCERY_EMOJIS, FOOD_ICONS,
  guessEmoji, EVENT_EMOJIS, esc, byId, me, household,
  sortedMembers, sortedLists, toast, run, relTime, dueLabel,
  daysUntil, toLocalInput, avatar, openSheet, closeSheet, pickerRow,
  memberPicker, resizeImage,
  actions, hooks,
} from './core.js';
import { viewCalendar, calendarSettingsHtml, handleOAuthReturn, syncNow, isHub } from './calendar.js';
import { loadWeather, weatherPill } from './weather.js';
import { signFamilyPhotos, photosSettingsHtml } from './photos.js';
import { renderHub, startHubTimers } from './hub.js';
import { viewKids, signChorePhotos, pendingApprovals } from './kids.js';
import { renderBuddy, sheetBuddySetup } from './buddy.js';
import { keepAwake } from './fun.js';
import { parseQuick, quickLabel } from './quickadd.js';
import { notificationsHtml } from './notify.js';

// ------------------------------------------------------------------ data
async function loadAll() {
  // A table that isn't set up yet (e.g. update SQL not run) just comes back empty
  const results = await Promise.all(TABLES.map((t) => S.api.select(t).catch((e) => { console.warn(t, e.message); return []; })));
  TABLES.forEach((t, i) => { S.data[t] = results[i] || []; });
  const missing = S.data.catalog.map((c) => c.photo_path).filter((p) => p && !S.photoUrls[p]);
  if (missing.length) Object.assign(S.photoUrls, await S.api.photoUrls(missing).catch(() => ({})));
  await signFamilyPhotos();
  await signChorePhotos();
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => { await run(loadAll); render(); }, 150);
}

// ------------------------------------------------------------------ boot
async function boot() {
  hooks.render = render;
  hooks.reload = scheduleReload;
  hooks.loadAll = loadAll;
  const params = new URLSearchParams(location.search);
  if (params.has('hub')) localStorage.setItem('hb.mode', 'hub');
  if (params.get('tab')) { S.tab = params.get('tab'); history.replaceState(null, '', location.pathname + (params.has('demo') ? '?demo' : '')); }
  S.mode = localStorage.getItem('hb.mode') || 'phone';
  S.api = await createBackend();
  S.api.onAuthChange(async (u) => {
    const changed = (u?.id || null) !== (S.user?.id || null);
    S.user = u;
    if (changed) await afterAuth();
  });
  S.user = await S.api.getUser();
  await afterAuth();
  if ('serviceWorker' in navigator && !S.api.demo) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) { scheduleReload(); syncNow(); } });
}

async function afterAuth() {
  if (S.user) {
    await run(loadAll);
    S.api.subscribe(() => scheduleReload());
    render();
    await handleOAuthReturn();
    loadWeather();
    syncNow();
    startHubTimers();
  } else {
    TABLES.forEach((t) => { S.data[t] = []; });
  }
  render();
}

// ------------------------------------------------------------------ render
function render() {
  if (!S.user) return renderAuth();
  if (!me()) return renderOnboarding();
  const tabs = [
    ['calendar', '📅', 'Calendar'],
    ['lists', '📝', 'Lists'],
    ['kids', '🌟', 'Kids'],
    ['board', '📌', 'Board'],
    ['family', '🏡', 'Family'],
  ];
  // keep anything being typed if a live update re-draws the screen
  const keep = ['#add-item input', '#post-form textarea', '#lib-search'].map((sel) => {
    const el = document.querySelector(sel);
    return el && { sel, value: el.value, focused: document.activeElement === el };
  }).filter(Boolean);
  const views = { calendar: viewCalendar, lists: viewLists, kids: viewKids, board: viewBoard, countdowns: viewCountdowns, family: viewFamily };
  if (S.mode === 'buddy') { document.body.classList.remove('hub-mode'); renderBuddy(); return; }
  document.body.classList.remove('buddy-mode', 'buddy-night');
  if (isHub()) { keepAwake(true); renderHub(views); }
  else {
  document.body.classList.remove('hub-mode');
  if (S.tab === 'countdowns') { S.tab = 'board'; S.boardView = 'countdowns'; }
  // on phones, Countdowns live inside the Board tab
  views.board = () => `<div class="seg board-seg">
      <button data-act="board-view" data-v="notes" class="${S.boardView !== 'countdowns' ? 'on' : ''}">📌 Notes</button>
      <button data-act="board-view" data-v="countdowns" class="${S.boardView === 'countdowns' ? 'on' : ''}">⏳ Countdowns</button>
    </div>${S.boardView === 'countdowns' ? viewCountdowns() : viewBoard()}`;
  const pend = pendingApprovals().length;
  const body = views[S.tab] || viewLists;
  $app.innerHTML = `
    <header class="topbar">
      <div class="brand"><img src="icons/icon-192.png" alt=""><div><h1>Homebase</h1><small>${esc(household()?.name || '')}</small></div></div>
      <div class="row">${weatherPill()}${avatar(me(), 'lg')}</div>
    </header>
    ${S.api.demo ? '<div class="demo-banner">Demo mode — sample data only. Add your Supabase keys in <code>js/config.js</code>.</div>' : ''}
    <main class="content">${body()}</main>
    <nav class="tabbar">
      ${tabs.map(([k, i, l]) => `<button data-act="tab" data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><span>${i}</span>${l}${k === 'kids' && pend && me()?.kind === 'parent' ? `<em class="tab-badge">${pend}</em>` : ''}</button>`).join('')}
    </nav>`;
  }
  for (const k of keep) {
    const el = document.querySelector(k.sel);
    if (!el) continue;
    if (k.value && !el.value) el.value = k.value;
    if (k.focused) { el.focus(); if (k.sel === '#add-item input') renderSuggestions(); }
  }
  const focusAdd = $app.querySelector('[data-autofocus]');
  if (focusAdd && S.refocus) { focusAdd.focus(); S.refocus = false; }
}

// ---------------- auth
function renderAuth() {
  const up = S.authMode === 'signup';
  $app.innerHTML = `
    <div class="auth">
      <img class="logo" src="icons/icon-192.png" alt="">
      <h1>Homebase</h1>
      <p class="muted">Our family's lists, notes and countdowns — on every screen.</p>
      <form id="auth-form" class="card stack">
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Password<input name="password" type="password" minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}" required></label>
        <button class="btn primary" type="submit">${up ? 'Create account' : 'Sign in'}</button>
        <div class="row between">
          <button type="button" class="link" data-act="auth-toggle">${up ? 'I have an account' : 'Create an account'}</button>
          ${up ? '' : '<button type="button" class="link" data-act="auth-forgot">Forgot password?</button>'}
        </div>
      </form>
    </div>`;
}

// ---------------- onboarding
function renderOnboarding() {
  const create = S.onboardMode === 'create';
  $app.innerHTML = `
    <div class="auth">
      <img class="logo" src="icons/icon-192.png" alt="">
      <h1>Welcome!</h1>
      <p class="muted">Set up your family, or join one your spouse already created.</p>
      <div class="seg">
        <button data-act="onboard-mode" data-mode="create" class="${create ? 'on' : ''}">Start our family</button>
        <button data-act="onboard-mode" data-mode="join" class="${create ? '' : 'on'}">Join with a code</button>
      </div>
      ${create ? `
      <form id="create-form" class="card stack">
        <label>Family name<input name="hh" value="The Colon Family" required></label>
        <label>Your name<input name="me" placeholder="Robert" required></label>
        <fieldset class="stack-sm"><legend>Kids</legend>
          <input name="kid" value="Harper"><input name="kid" value="Kid 2">
          <input name="kid" placeholder="(optional)">
          <small class="muted">You can rename or add kids later.</small>
        </fieldset>
        <button class="btn primary" type="submit">Create our Homebase</button>
      </form>` : `
      <form id="join-form" class="card stack">
        <label>Join code<input name="code" placeholder="e.g. HB7K2Q" autocapitalize="characters" maxlength="6" required></label>
        <label>Your name<input name="me" placeholder="Nicole" required></label>
        <small class="muted">Find the code on the first parent's Family tab.</small>
        <button class="btn primary" type="submit">Join</button>
      </form>`}
      <button class="link" data-act="signout">Sign out</button>
    </div>`;
}

// ---- grocery library helpers
const sortedStores = () => [...S.data.stores].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const currentStore = () => {
  const stores = sortedStores();
  if (S.storeId === 'any') return null;
  return stores.find((s) => s.id === S.storeId) || stores[0] || null;
};
const locationOf = (catalogId, storeId) =>
  S.data.catalog_locations.find((l) => l.catalog_id === catalogId && l.store_id === storeId)?.section || '';
const sectionsForStore = (store) => {
  const used = S.data.catalog_locations.filter((l) => l.store_id === store.id).map((l) => l.section);
  const seen = new Set();
  return [...(store.section_order || []), ...used.sort(natural)].filter((x) => {
    const k = x.trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true;
  });
};
const sectionRank = (store, section) => {
  const i = (store.section_order || []).findIndex((x) => x.trim().toLowerCase() === section.trim().toLowerCase());
  return i === -1 ? 9999 : i;
};
const thumb = (c, size = '') => {
  const url = c?.photo_path && S.photoUrls[c.photo_path];
  return url
    ? `<span class="thumb ${size}"><img src="${esc(url)}" alt="" loading="lazy"></span>`
    : `<span class="thumb ${size}">${esc(c?.emoji || '🛒')}</span>`;
};

function suggestionsFor(query, list) {
  const q = query.trim().toLowerCase();
  const onList = new Set(S.data.list_items.filter((i) => i.list_id === list.id && !i.done).map((i) => i.catalog_id));
  let pool = S.data.catalog;
  if (q) {
    pool = pool.filter((c) => c.name.toLowerCase().includes(q));
    pool.sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || b.use_count - a.use_count);
  } else {
    pool = pool.filter((c) => !onList.has(c.id)).sort((a, b) => b.use_count - a.use_count);
  }
  return pool.slice(0, 7).map((c) => ({ c, onList: onList.has(c.id) }));
}

function renderSuggestions() {
  const box = document.getElementById('suggest');
  const input = document.querySelector('#add-item input');
  const list = currentList();
  if (!box || !input || list?.kind !== 'shopping') return;
  const q = input.value;
  const store = currentStore();
  const sugg = suggestionsFor(q, list);
  const exact = S.data.catalog.some((c) => c.name.trim().toLowerCase() === q.trim().toLowerCase());
  if (!sugg.length && !q.trim()) { box.hidden = true; return; }
  box.innerHTML = `
    ${!q.trim() ? '<div class="suggest-title">Frequently bought</div>' : ''}
    ${sugg.map(({ c, onList }) => `
      <button type="button" class="sugg ${onList ? 'on-list' : ''}" data-act="sugg-add" data-id="${c.id}">
        ${thumb(c, 'sm')}<span class="sugg-name">${esc(c.name)}</span>
        <small>${onList ? '✓ on list' : esc(store ? locationOf(c.id, store.id) : '')}</small>
      </button>`).join('')}
    ${q.trim() && !exact ? `<button type="button" class="sugg new" data-act="sugg-new"><span class="thumb sm">${esc(guessEmoji(q))}</span><span class="sugg-name">Add “${esc(q.trim())}”</span><small>new</small></button>` : ''}`;
  box.hidden = false;
}

// ---------------- lists
function currentList() {
  const lists = sortedLists();
  return lists.find((l) => l.id === S.listId) || lists[0];
}

const myOpenItems = () => S.data.list_items.filter((i) => !i.done && i.assigned_to && i.assigned_to === me()?.id);
const parentsAndKids = () => sortedMembers();

function listChips(activeId) {
  const lists = sortedLists();
  const mine = myOpenItems().length;
  return `<div class="chips">
      <button class="chip mine ${activeId === '__mine' ? 'on' : ''}" data-act="list-pick" data-id="__mine">⭐ For me${mine ? `<b>${mine}</b>` : ''}</button>
      ${lists.map((l) => {
        const n = S.data.list_items.filter((i) => i.list_id === l.id && !i.done).length;
        return `<button class="chip ${l.id === activeId ? 'on' : ''}" data-act="list-pick" data-id="${l.id}">${esc(l.emoji)} ${esc(l.name)}${n ? `<b>${n}</b>` : ''}</button>`;
      }).join('')}
      <button class="chip add" data-act="list-new" aria-label="New list">＋</button>
    </div>`;
}

// everything assigned to me, across every list
function viewMine() {
  const items = myOpenItems().sort((a, b) => {
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
    if (a.due_at) return -1; if (b.due_at) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
  const now = new Date(), endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const groups = [
    ['Overdue', items.filter((i) => i.due_at && new Date(i.due_at) < now)],
    ['Today', items.filter((i) => i.due_at && new Date(i.due_at) >= now && new Date(i.due_at) < endToday)],
    ['Coming up', items.filter((i) => i.due_at && new Date(i.due_at) >= endToday)],
    ['Anytime', items.filter((i) => !i.due_at)],
  ].filter(([, g]) => g.length);
  return `
    ${listChips('__mine')}
    <div class="list-head"><h2>⭐ For me</h2></div>
    <form id="add-item" class="add-bar">
      <div class="add-wrap"><input name="text" placeholder="Add a to-do for me… (try “call dentist friday 3pm”)" autocomplete="off" enterkeyhint="done" data-autofocus>
        <div id="quick-preview" class="quick-preview" hidden></div></div>
      <button class="btn primary round" type="submit" aria-label="Add">＋</button>
    </form>
    ${groups.map(([name, g]) => `<h3 class="section ${name === 'Overdue' ? 'warn' : ''}">${name}</h3>
      <ul class="items">${g.map((i) => itemRow(i, null, false, true)).join('')}</ul>`).join('')
      || '<div class="empty">Nothing assigned to you right now. 🎉<br><small>Tip: type “@Nicole” when adding a to-do to give it to her.</small></div>'}`;
}

function viewLists() {
  if (S.listId === '__mine') return viewMine();
  const lists = sortedLists();
  const list = currentList();
  if (!list) return `<div class="empty">No lists yet.<br><button class="btn primary" data-act="list-new">Create a list</button></div>`;
  S.listId = list.id;
  if (list.kind === 'shopping' && S.listView === 'library') return viewLibrary(list);
  const shopping = list.kind === 'shopping';
  const store = shopping ? currentStore() : null;
  const items = S.data.list_items.filter((i) => i.list_id === list.id);
  const mineOnly = !shopping && S.mineOnly;
  const open = items.filter((i) => !i.done && (!mineOnly || i.assigned_to === me()?.id)).sort((a, b) => {
    if (list.kind === 'reminders' || a.due_at || b.due_at) {
      if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
      if (a.due_at) return -1; if (b.due_at) return 1;
    }
    return a.created_at.localeCompare(b.created_at);
  });
  const done = items.filter((i) => i.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const placeholder = shopping ? 'Add an item…' : list.kind === 'reminders' ? 'Add a reminder…' : 'Add a to-do…';

  // Group by section for the chosen store; unsorted items go last
  let openHtml;
  if (store && open.length) {
    const groups = new Map();
    for (const i of open) {
      const sec = i.catalog_id ? locationOf(i.catalog_id, store.id) : '';
      const key = sec.trim() || '';
      if (!groups.has(key.toLowerCase())) groups.set(key.toLowerCase(), { name: key, items: [] });
      groups.get(key.toLowerCase()).items.push(i);
    }
    const ordered = [...groups.values()].sort((a, b) => {
      if (!a.name) return 1; if (!b.name) return -1;
      return sectionRank(store, a.name) - sectionRank(store, b.name) || natural(a.name, b.name);
    });
    openHtml = ordered.map((g) => `
      <li class="group-head">${g.name ? esc(g.name) : 'Not sorted yet'}<span>${g.items.length}</span></li>
      ${g.items.map((i) => itemRow(i, store, true)).join('')}`).join('');
  } else {
    openHtml = open.map((i) => itemRow(i, store, false)).join('');
  }

  const stores = sortedStores();
  return `
    ${listChips(list.id)}
    <div class="list-head">
      <h2>${esc(list.emoji)} ${esc(list.name)}</h2>
      <div class="row">
        ${shopping ? '<button class="btn small-btn" data-act="lib-open">📚 Library</button>'
          : `<button class="btn small-btn ${S.mineOnly ? 'primary' : ''}" data-act="mine-toggle">👤 ${S.mineOnly ? 'Mine only' : 'Everyone'}</button>`}
        <button class="icon-btn" data-act="list-edit" data-id="${list.id}" aria-label="List settings">⋯</button>
      </div>
    </div>
    ${shopping ? `
    <div class="store-bar">
      <span class="muted">Shopping at</span>
      ${stores.map((s) => `<button class="pill ${store?.id === s.id ? 'on' : ''}" data-act="store-pick" data-id="${s.id}">${esc(s.emoji)} ${esc(s.name)}</button>`).join('')}
      ${stores.length ? `<button class="pill ${!store ? 'on' : ''}" data-act="store-pick" data-id="any">Any</button>` : ''}
      <button class="pill add" data-act="store-new">${stores.length ? '＋' : '＋ Add your stores'}</button>
    </div>` : ''}
    <form id="add-item" class="add-bar">
      <div class="add-wrap">
        <input name="text" placeholder="${placeholder}" autocomplete="off" enterkeyhint="done" data-autofocus>
        ${shopping ? '<div id="suggest" class="suggest" hidden></div>' : '<div id="quick-preview" class="quick-preview" hidden></div>'}
      </div>
      <button class="btn primary round" type="submit" aria-label="Add">＋</button>
    </form>
    <ul class="items">
      ${openHtml || `<li class="empty small">${mineOnly ? 'Nothing here for you. 🎉' : 'All clear! 🎉'}</li>`}
    </ul>
    ${done.length ? `
      <div class="done-head">
        <button class="link" data-act="toggle-done">${S.showDone ? '▾' : '▸'} Done (${done.length})</button>
        <button class="link danger" data-act="clear-done">Clear</button>
      </div>
      ${S.showDone ? `<ul class="items done">${done.map((i) => itemRow(i, store, false)).join('')}</ul>` : ''}` : ''}`;
}

function itemRow(i, store = null, grouped = false, showList = false) {
  const who = byId('members', i.assigned_to);
  const overdue = !i.done && i.due_at && new Date(i.due_at) < new Date();
  const doneBy = i.done ? byId('members', i.done_by) : null;
  const c = i.catalog_id ? byId('catalog', i.catalog_id) : null;
  const sec = c && store && !grouped ? locationOf(c.id, store.id) : '';
  const fromList = showList ? byId('lists', i.list_id) : null;
  const meta = [
    fromList ? `<span>${esc(fromList.emoji)} ${esc(fromList.name)}</span>` : '',
    sec ? `<span class="sec-tag">📍 ${esc(sec)}</span>` : '',
    i.due_at ? `<span class="due ${overdue ? 'overdue' : ''}">⏰ ${esc(dueLabel(i.due_at))}</span>` : '',
    i.note ? `<span class="note-ico">📄 ${esc(i.note.length > 40 ? i.note.slice(0, 40) + '…' : i.note)}</span>` : '',
    doneBy ? `<span>✓ ${esc(doneBy.name)}</span>` : '',
  ].filter(Boolean).join('');
  const isShop = !showList && currentList()?.kind === 'shopping';
  return `
    <li class="item ${i.done ? 'is-done' : ''}">
      <button class="check" data-act="item-toggle" data-id="${i.id}" aria-label="${i.done ? 'Mark not done' : 'Mark done'}">${i.done ? '✓' : ''}</button>
      <button class="item-body ${isShop ? 'with-thumb' : ''}" data-act="item-edit" data-id="${i.id}">
        ${isShop ? thumb(c || { emoji: guessEmoji(i.text) }) : ''}
        <span class="item-main">
          <span class="item-text">${esc(i.text)}</span>
          ${meta ? `<span class="meta">${meta}</span>` : ''}
        </span>
      </button>
      ${avatar(who)}
    </li>`;
}

// ---------------- library (all remembered grocery items)
function viewLibrary(list) {
  const q = S.libQuery.trim().toLowerCase();
  const store = currentStore();
  const onList = new Set(S.data.list_items.filter((i) => i.list_id === list.id && !i.done).map((i) => i.catalog_id));
  const items = S.data.catalog.filter((c) => !q || c.name.toLowerCase().includes(q)).sort((a, b) => natural(a.name, b.name));
  return `
    <div class="list-head">
      <button class="link" data-act="lib-close">‹ Back to ${esc(list.name)}</button>
      <button class="btn small-btn" data-act="lib-new">＋ New item</button>
    </div>
    <h2>📚 Grocery library <small class="muted">(${S.data.catalog.length})</small></h2>
    <input id="lib-search" class="search" placeholder="Search the library…" value="${esc(S.libQuery)}" autocomplete="off">
    <ul class="items">
      ${items.map((c) => {
        const locs = S.data.catalog_locations.filter((l) => l.catalog_id === c.id)
          .map((l) => `${byId('stores', l.store_id)?.name || ''}: ${l.section}`).join(' · ');
        return `
        <li class="item">
          <button class="item-body with-thumb" data-act="lib-edit" data-id="${c.id}">
            ${thumb(c)}
            <span class="item-main"><span class="item-text">${esc(c.name)}</span>
              <span class="meta">${locs ? `<span>📍 ${esc(locs)}</span>` : ''}${c.notes ? `<span>📄 ${esc(c.notes.slice(0, 40))}</span>` : ''}</span></span>
          </button>
          ${onList.has(c.id)
            ? '<span class="on-list-tag">✓ On list</span>'
            : `<button class="btn small-btn" data-act="lib-add" data-id="${c.id}">＋ Add</button>`}
        </li>`;
      }).join('') || `<li class="empty small">${q ? 'No matches.' : 'Your library fills up automatically as you add groceries.'}</li>`}
    </ul>`;
}

// ---------------- board
function viewBoard() {
  const msgs = [...S.data.messages].sort((a, b) => (b.pinned - a.pinned) || b.created_at.localeCompare(a.created_at));
  const color = S.noteColor || NOTE_COLORS[0];
  return `
    <form id="post-form" class="compose" style="--note:${color}">
      <textarea name="body" rows="2" placeholder="Leave a note for the family…" maxlength="500"></textarea>
      <div class="row between">
        <div class="swatches">${NOTE_COLORS.map((c) => `<button type="button" class="swatch ${c === color ? 'on' : ''}" style="--c:${c}" data-act="note-color" data-color="${c}" aria-label="Note color"></button>`).join('')}</div>
        <button class="btn primary" type="submit">Post</button>
      </div>
    </form>
    <div class="notes">
      ${msgs.map((m) => {
        const a = byId('members', m.author_id);
        return `
        <article class="note" style="--note:${esc(m.color)}">
          ${m.pinned ? '<span class="pin">📌</span>' : ''}
          <p>${esc(m.body).replace(/\n/g, '<br>')}</p>
          <footer>
            <span>${avatar(a, 'sm')} ${esc(a?.name || 'Someone')} · ${relTime(m.created_at)}</span>
            <button class="icon-btn" data-act="note-menu" data-id="${m.id}" aria-label="Note options">⋯</button>
          </footer>
        </article>`;
      }).join('') || '<div class="empty">No notes yet. Leave the first one!</div>'}
    </div>`;
}

// ---------------- countdowns
function viewCountdowns() {
  const all = S.data.countdowns.map((c) => ({ ...c, days: daysUntil(c.target_date) }));
  const upcoming = all.filter((c) => c.days >= 0).sort((a, b) => a.days - b.days);
  const past = all.filter((c) => c.days < 0).sort((a, b) => b.days - a.days);
  const card = (c) => `
    <button class="countdown ${c.days === 0 ? 'today' : ''} ${c.days < 0 ? 'past' : ''}" data-act="cd-edit" data-id="${c.id}">
      <span class="cd-emoji">${esc(c.emoji)}</span>
      <span class="cd-info"><strong>${esc(c.title)}</strong>
        <small>${new Date(c.target_date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</small></span>
      <span class="cd-num">${c.days === 0 ? '<b>Today!</b>' : c.days > 0
        ? `<b>${c.days}</b><small>${c.days === 1 ? 'day' : 'days'}</small>`
        : `<small>${-c.days}d ago</small>`}</span>
    </button>`;
  return `
    <div class="list-head"><h2>⏳ Countdowns</h2><button class="btn primary" data-act="cd-new">＋ Add</button></div>
    <div class="stack">${upcoming.map(card).join('') || '<div class="empty">Nothing to count down to yet.<br>Add a trip, birthday or holiday!</div>'}</div>
    ${past.length ? `<h3 class="section">Past</h3><div class="stack">${past.map(card).join('')}</div>` : ''}`;
}

// ---------------- family
function viewFamily() {
  const hh = household();
  const parents = sortedMembers().filter((m) => m.kind === 'parent');
  const kids = sortedMembers().filter((m) => m.kind === 'kid');
  const row = (m) => `
    <button class="member" data-act="member-edit" data-id="${m.id}">
      ${avatar(m, 'lg')}<span><strong>${esc(m.name)}</strong><small>${m.kind === 'parent' ? (m.user_id === S.user.id ? 'You' : 'Parent') : 'Kid'}</small></span><span class="chev">›</span>
    </button>`;
  return `
    <section class="card stack">
      <div class="row between"><h2>${esc(hh?.name)}</h2><button class="link" data-act="hh-rename">Rename</button></div>
      <div class="join">
        <div><small class="muted">Join code for another parent</small><div class="code">${esc(hh?.join_code)}</div></div>
        <div class="row"><button class="btn" data-act="code-share">Share</button><button class="btn ghost" data-act="code-reset">New code</button></div>
      </div>
    </section>
    <h3 class="section">Parents</h3>
    <div class="card list-card">${parents.map(row).join('')}</div>
    <div class="row between"><h3 class="section">Kids</h3><button class="link" data-act="kid-new">＋ Add kid</button></div>
    <div class="card list-card">${kids.map(row).join('') || '<div class="empty small">No kids added.</div>'}</div>
    ${calendarSettingsHtml()}
    ${photosSettingsHtml()}
    <div class="row between"><h3 class="section">Stores</h3><button class="link" data-act="store-new">＋ Add store</button></div>
    <div class="card list-card">${sortedStores().map((st) => `
      <button class="member" data-act="store-edit" data-id="${st.id}">
        <span class="avatar lg" style="--c:#ddd">${esc(st.emoji)}</span><span><strong>${esc(st.name)}</strong><small>${sectionsForStore(st).length} sections</small></span><span class="chev">›</span>
      </button>`).join('') || '<div class="empty small">Add the stores you shop at to save where items are.</div>'}</div>
    <h3 class="section">Weather</h3>
    <button class="card member" data-act="wx-location"><span class="avatar lg" style="--c:#ddd">🌤️</span>
      <span><strong>${esc(household()?.weather_place || 'Set location')}</strong><small>Tap to change the weather location</small></span><span class="chev">›</span></button>
    <h3 class="section">This device</h3>
    <section class="card stack">
      <div class="seg three">
        <button data-act="mode-set" data-mode="phone" class="${S.mode !== 'hub' ? 'on' : ''}">📱 Phone</button>
        <button data-act="mode-set" data-mode="hub" class="${S.mode === 'hub' ? 'on' : ''}">🖥️ Hub screen</button>
        <button data-act="buddy-setup" class="${S.mode === 'buddy' ? 'on' : ''}">🧒 Kid's Buddy</button>
      </div>
      ${S.mode === 'phone' || !S.mode ? notificationsHtml() : ''}
      <small class="muted">Hub screen = the big landscape dashboard with clock, weather and photo frame. Work events always show as “Work Meeting” on hubs.</small>
      ${S.mode === 'hub' ? `<label>Photo frame starts after
        <select data-act="saver-set">${[[0, 'Never'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes']]
          .map(([v, t]) => `<option value="${v}" ${S.saverMin === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
    </section>
    <section class="card stack">
      <small class="muted">Signed in as ${esc(S.user.email)}</small>
      <button class="btn ghost" data-act="signout">Sign out</button>
    </section>
    <p class="muted center small">Homebase · Calendar, Lists, Board, Countdowns, Hub</p>`;
}

function sheetItem(i) {
  openSheet(`
    <h2>Edit item</h2>
    <label>Item<input name="text" value="${esc(i.text)}" required data-focus></label>
    <label>Note<textarea name="note" rows="2" placeholder="Details, brand, size…">${esc(i.note || '')}</textarea></label>
    <label>For<span></span></label>${memberPicker(i.assigned_to)}
    <label>Remind / due<input type="datetime-local" name="due_at" value="${toLocalInput(i.due_at)}"></label>
    <div class="row between">
      <button class="btn danger ghost" type="submit" value="delete" formnovalidate>Delete</button>
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') return run(() => S.api.remove('list_items', i.id), 'Deleted');
    const due = f.get('due_at');
    await run(() => S.api.update('list_items', i.id, {
      text: f.get('text').trim(), note: f.get('note').trim() || null,
      assigned_to: f.get('assigned_to') || null, due_at: due ? new Date(due).toISOString() : null,
    }));
    notifyAssigned(i.id, f.get('assigned_to') || null, i.assigned_to);
  });
}

// let the other parent's phone know they were given something
function notifyAssigned(itemId, assignedTo, previous) {
  const who = byId('members', assignedTo);
  if (!who || who.kind !== 'parent' || who.id === me()?.id || assignedTo === previous) return;
  S.api.fn('notify', { action: 'assigned', item_id: itemId }).catch(() => {});
}

function sheetList(l) {
  const isNew = !l;
  l = l || { name: '', emoji: '📝', kind: 'todo' };
  openSheet(`
    <h2>${isNew ? 'New list' : 'List settings'}</h2>
    <label>Name<input name="name" value="${esc(l.name)}" placeholder="e.g. Costco, Packing, Home projects" required data-focus></label>
    <label>Icon<span></span></label>${pickerRow('emoji', LIST_EMOJIS, l.emoji)}
    <label>Type
      <select name="kind">
        ${[['shopping', 'Shopping'], ['todo', 'To-do'], ['reminders', 'Reminders (sorted by time)'], ['other', 'Other']]
          .map(([v, t]) => `<option value="${v}" ${l.kind === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
    <div class="row between">
      ${isNew ? '<span></span>' : '<button class="btn danger ghost" type="submit" value="delete" formnovalidate>Delete list</button>'}
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') {
      if (!confirm(`Delete "${l.name}" and everything on it?`)) return false;
      S.listId = null;
      return run(() => S.api.remove('lists', l.id), 'List deleted');
    }
    const row = { name: f.get('name').trim(), emoji: f.get('emoji'), kind: f.get('kind') };
    if (isNew) {
      const created = await run(() => S.api.insert('lists', {
        ...row, household_id: household().id, sort: Math.max(0, ...S.data.lists.map((x) => x.sort)) + 1,
      }));
      if (created) { S.listId = created.id; localStorage.setItem('hb.list', created.id); }
    } else await run(() => S.api.update('lists', l.id, row));
  });
}

function sheetCountdown(c) {
  const isNew = !c;
  c = c || { title: '', emoji: '🎉', target_date: '' };
  openSheet(`
    <h2>${isNew ? 'New countdown' : 'Edit countdown'}</h2>
    <label>What's happening?<input name="title" value="${esc(c.title)}" placeholder="Disney trip, Grandma visits…" required data-focus></label>
    <label>Date<input type="date" name="target_date" value="${esc(c.target_date)}" required></label>
    <label>Icon<span></span></label>${pickerRow('emoji', EVENT_EMOJIS, c.emoji)}
    <div class="row between">
      ${isNew ? '<span></span>' : '<button class="btn danger ghost" type="submit" value="delete" formnovalidate>Delete</button>'}
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') return run(() => S.api.remove('countdowns', c.id), 'Deleted');
    const row = { title: f.get('title').trim(), emoji: f.get('emoji'), target_date: f.get('target_date') };
    if (isNew) await run(() => S.api.insert('countdowns', { ...row, household_id: household().id }));
    else await run(() => S.api.update('countdowns', c.id, row));
  });
}

function sheetMember(m) {
  const isNew = !m;
  m = m || { name: '', kind: 'kid', color: MEMBER_COLORS[2], emoji: KID_EMOJIS[4] };
  const canDelete = !isNew && m.kind === 'kid';
  openSheet(`
    <h2>${isNew ? 'Add a kid' : `Edit ${esc(m.name)}`}</h2>
    <label>Name<input name="name" value="${esc(m.name)}" required data-focus></label>
    <label>Avatar<span></span></label>${pickerRow('emoji', m.kind === 'parent' ? [...PARENT_EMOJIS, ...KID_EMOJIS.slice(0, 8)] : KID_EMOJIS, m.emoji)}
    <label>Color<span></span></label>${pickerRow('color', MEMBER_COLORS, m.color, 'color')}
    <div class="row between">
      ${canDelete ? '<button class="btn danger ghost" type="submit" value="delete" formnovalidate>Remove</button>' : '<span></span>'}
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') {
      if (!confirm(`Remove ${m.name} from Homebase?`)) return false;
      return run(() => S.api.remove('members', m.id), 'Removed');
    }
    const row = { name: f.get('name').trim(), emoji: f.get('emoji'), color: f.get('color') };
    if (isNew) await run(() => S.api.insert('members', {
      ...row, kind: 'kid', household_id: household().id, sort: 10 + S.data.members.length,
    }));
    else await run(() => S.api.update('members', m.id, row));
  });
}

function sheetNote(n) {
  openSheet(`
    <h2>Note</h2>
    <p class="note-preview" style="--note:${esc(n.color)}">${esc(n.body)}</p>
    <button class="btn" type="submit" value="pin">${n.pinned ? 'Unpin' : '📌 Pin to top'}</button>
    <button class="btn danger ghost" type="submit" value="delete">Delete note</button>
    <button class="btn ghost" type="button" data-act="sheet-close">Cancel</button>`, async (_f, action) => {
    if (action === 'pin') await run(() => S.api.update('messages', n.id, { pinned: !n.pinned }));
    if (action === 'delete') await run(() => S.api.remove('messages', n.id), 'Deleted');
  });
}

function sheetGrocery(item, c) {
  const isNew = !c;
  c = c || { name: S.libQuery || '', emoji: '🛒', notes: '', photo_path: null };
  const stores = sortedStores();
  const originalPhoto = c.photo_path;
  let uploaded = null; // photo uploaded during this edit (deleted again if cancelled)
  const photoHtml = (path, emoji) => {
    const url = path && S.photoUrls[path];
    return url ? `<img src="${esc(url)}" alt="">` : `<span class="big-emoji">${esc(emoji)}</span>`;
  };
  openSheet(`
    <div class="photo-box" id="photo-box">${photoHtml(c.photo_path, c.emoji)}</div>
    <input type="hidden" name="photo_path" value="${esc(c.photo_path || '')}">
    <input type="file" id="photo-file" accept="image/*" hidden>
    <div class="row center-row">
      <button type="button" class="btn" data-act="photo-pick">📷 ${c.photo_path ? 'Change photo' : 'Add photo'}</button>
      <button type="button" class="btn ghost" data-act="photo-remove" ${c.photo_path ? '' : 'hidden'}>Remove</button>
    </div>
    <label>Item<input name="name" value="${esc(c.name)}" required ${isNew ? 'data-focus' : ''}></label>
    <details class="icon-details"><summary>Icon: <span class="cur-emoji">${esc(c.emoji)}</span> <small class="muted">(shown when there's no photo)</small></summary>
      ${pickerRow('emoji', GROCERY_EMOJIS.includes(c.emoji) ? GROCERY_EMOJIS : [c.emoji, ...GROCERY_EMOJIS], c.emoji)}
    </details>
    <fieldset class="stack-sm"><legend>📍 Where to find it</legend>
      ${stores.length ? stores.map((s) => `
        <div class="loc-row"><span>${esc(s.emoji)} ${esc(s.name)}</span>
          <input name="loc_${s.id}" value="${esc(c.id ? locationOf(c.id, s.id) : '')}" placeholder="e.g. Aisle 7, Produce" list="secs_${s.id}" autocomplete="off">
          <datalist id="secs_${s.id}">${sectionsForStore(s).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        </div>`).join('') : '<small class="muted">Add your stores (Family tab, or “Add your stores” on the grocery list) to save aisles.</small>'}
    </fieldset>
    <label>Notes <small class="muted">— brand, size, where it is…</small><textarea name="notes" rows="2" placeholder="e.g. Top shelf next to the oatmeal">${esc(c.notes || '')}</textarea></label>
    ${item ? `
      <hr>
      <label>Note for this trip<input name="trip_note" value="${esc(item.note || '')}" placeholder="e.g. 2 gallons"></label>
      <label>For<span></span></label>${memberPicker(item.assigned_to)}` : ''}
    <div class="row between">
      ${item ? '<button class="btn danger ghost" type="submit" value="delete" formnovalidate>Remove from list</button>'
        : isNew ? '<span></span>' : '<button class="btn danger ghost" type="submit" value="delete" formnovalidate>Delete from library</button>'}
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') {
      if (item) return run(() => S.api.remove('list_items', item.id), 'Removed from list');
      if (!confirm(`Delete "${c.name}" from the library?`)) return false;
      await run(() => S.api.remove('catalog', c.id), 'Deleted');
      if (c.photo_path) S.api.deletePhoto(c.photo_path).catch(() => {});
      return;
    }
    const name = f.get('name').trim();
    const row = { name, emoji: f.get('emoji') || c.emoji, notes: f.get('notes').trim() || null, photo_path: f.get('photo_path') || null };
    let cid = c.id;
    try {
      if (isNew) cid = (await S.api.insert('catalog', { ...row, household_id: household().id })).id;
      else await S.api.update('catalog', cid, row);
    } catch (e) {
      toast(/duplicate|unique/i.test(e.message) ? `“${name}” is already in the library` : e.message);
      return false;
    }
    for (const s of stores) {
      const val = (f.get(`loc_${s.id}`) || '').trim();
      const existing = S.data.catalog_locations.find((l) => l.catalog_id === cid && l.store_id === s.id);
      if (existing && !val) await run(() => S.api.remove('catalog_locations', existing.id));
      else if (existing && val !== existing.section) await run(() => S.api.update('catalog_locations', existing.id, { section: val }));
      else if (!existing && val) await run(() => S.api.insert('catalog_locations', { household_id: household().id, catalog_id: cid, store_id: s.id, section: val }));
    }
    if (originalPhoto && originalPhoto !== row.photo_path) S.api.deletePhoto(originalPhoto).catch(() => {});
    uploaded = null;
    if (item) {
      await run(() => S.api.update('list_items', item.id, {
        text: name, note: f.get('trip_note').trim() || null, assigned_to: f.get('assigned_to') || null,
      }));
    }
    toast('Saved');
  }, () => { if (uploaded) S.api.deletePhoto(uploaded).catch(() => {}); });

  const form = $sheet.querySelector('#sheet-form');
  const fileInput = form.querySelector('#photo-file');
  const pathInput = form.querySelector('[name=photo_path]');
  const box = form.querySelector('#photo-box');
  const removeBtn = form.querySelector('[data-act=photo-remove]');
  form.querySelector('[data-act=photo-pick]').onclick = () => fileInput.click();
  removeBtn.onclick = () => {
    pathInput.value = ''; removeBtn.hidden = true;
    box.innerHTML = photoHtml(null, form.querySelector('[name=emoji]').value);
  };
  form.querySelector('[data-picker=emoji]').addEventListener('click', () => setTimeout(() => {
    const e = form.querySelector('[name=emoji]').value;
    form.querySelector('.cur-emoji').textContent = e;
    if (!pathInput.value) box.innerHTML = photoHtml(null, e);
  }));
  fileInput.onchange = async () => {
    const file = fileInput.files[0]; if (!file) return;
    box.innerHTML = '<span class="muted">Uploading…</span>';
    const path = await run(async () => S.api.uploadPhoto(household().id, await resizeImage(file)));
    if (!path) { box.innerHTML = photoHtml(pathInput.value, c.emoji); return; }
    if (uploaded) S.api.deletePhoto(uploaded).catch(() => {});
    uploaded = path;
    Object.assign(S.photoUrls, await S.api.photoUrls([path]));
    pathInput.value = path; removeBtn.hidden = false;
    form.querySelector('[data-act=photo-pick]').textContent = '📷 Change photo';
    box.innerHTML = photoHtml(path, c.emoji);
  };
}

// ---------------- store sheet (name + walking order of sections)
function sheetStore(st) {
  const isNew = !st;
  st = st || { name: '', emoji: '🏪', section_order: [] };
  S.secEdit = isNew ? [] : sectionsForStore(st);
  openSheet(`
    <h2>${isNew ? 'Add a store' : `${esc(st.name)}`}</h2>
    <label>Store name<input name="name" value="${esc(st.name)}" placeholder="Publix, Costco, Target…" required ${isNew ? 'data-focus' : ''}></label>
    <label>Icon<span></span></label>${pickerRow('emoji', STORE_EMOJIS.includes(st.emoji) ? STORE_EMOJIS : [st.emoji, ...STORE_EMOJIS], st.emoji)}
    <fieldset class="stack-sm"><legend>Sections, in the order you walk the store</legend>
      <ul id="sec-list" class="sec-list"></ul>
      <div class="row"><input id="sec-new" placeholder="Add a section (e.g. Produce, Aisle 5)" autocomplete="off"><button type="button" class="btn" data-act="sec-add">Add</button></div>
      <small class="muted">The grocery list groups items in this order. Sections you type on items show up here automatically.</small>
    </fieldset>
    <div class="row between">
      ${isNew ? '<span></span>' : '<button class="btn danger ghost" type="submit" value="delete" formnovalidate>Delete store</button>'}
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') {
      if (!confirm(`Delete ${st.name}? Aisle info saved for this store will be removed.`)) return false;
      if (S.storeId === st.id) S.storeId = null;
      return run(() => S.api.remove('stores', st.id), 'Store deleted');
    }
    const row = { name: f.get('name').trim(), emoji: f.get('emoji'), section_order: S.secEdit };
    if (isNew) {
      const created = await run(() => S.api.insert('stores', { ...row, household_id: household().id, sort: S.data.stores.length }));
      if (created) { S.storeId = created.id; localStorage.setItem('hb.store', created.id); }
    } else await run(() => S.api.update('stores', st.id, row));
  });
  renderSecList();
  $sheet.querySelector('#sec-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addSection(); }
  });
}
function renderSecList() {
  const ul = $sheet.querySelector('#sec-list'); if (!ul) return;
  ul.innerHTML = S.secEdit.map((s, i) => `
    <li><span class="sec-num">${i + 1}</span><span class="sec-name">${esc(s)}</span>
      <button type="button" class="icon-btn" data-act="sec-move" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
      <button type="button" class="icon-btn" data-act="sec-move" data-i="${i}" data-d="1" ${i === S.secEdit.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
      <button type="button" class="icon-btn" data-act="sec-del" data-i="${i}" aria-label="Remove">✕</button></li>`).join('')
    || '<li class="muted small">No sections yet.</li>';
}
function addSection() {
  const input = $sheet.querySelector('#sec-new');
  const v = input.value.trim();
  if (v && !S.secEdit.some((x) => x.toLowerCase() === v.toLowerCase())) S.secEdit.push(v);
  input.value = ''; input.focus(); renderSecList();
}

// add a remembered item to the current grocery list
async function addFromCatalog(c) {
  const list = currentList();
  if (S.data.list_items.some((i) => i.list_id === list.id && !i.done && i.catalog_id === c.id)) {
    toast(`${c.name} is already on the list`); return;
  }
  S.data.list_items.push({ id: 'tmp-' + Date.now(), list_id: list.id, text: c.name, catalog_id: c.id, done: false, created_at: new Date().toISOString() });
  render();
  await run(() => S.api.rpc('remember_item', { p_name: c.name, p_emoji: c.emoji }));
  await run(() => S.api.insert('list_items', { household_id: household().id, list_id: list.id, text: c.name, catalog_id: c.id, created_by: me().id }));
  scheduleReload();
}

// ------------------------------------------------------------------ events
document.addEventListener('click', async (e) => {
  const box = document.getElementById('suggest');
  if (box && !box.hidden && !e.target.closest('.add-wrap')) box.hidden = true;
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const wrap = pick.closest('[data-picker]');
    wrap.querySelector('input[type=hidden]').value = pick.dataset.pick;
    wrap.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('on', b === pick));
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'tab': S.tab = el.dataset.tab; localStorage.setItem('hb.tab', S.tab); render(); window.scrollTo(0, 0); break;
    case 'auth-toggle': S.authMode = S.authMode === 'signin' ? 'signup' : 'signin'; render(); break;
    case 'auth-forgot': {
      const email = document.querySelector('#auth-form [name=email]').value.trim();
      if (!email) return toast('Type your email first');
      await run(() => S.api.resetPassword(email), 'Password reset email sent');
      break;
    }
    case 'onboard-mode': S.onboardMode = el.dataset.mode; render(); break;
    case 'signout': await run(() => S.api.signOut()); break;
    case 'list-pick': S.listId = id; localStorage.setItem('hb.list', id); S.showDone = false; S.listView = 'list'; render(); break;
    case 'list-new': sheetList(null); break;
    case 'list-edit': sheetList(byId('lists', id)); break;
    case 'item-toggle': {
      const i = byId('list_items', id);
      const done = !i.done;
      Object.assign(i, { done, done_at: done ? new Date().toISOString() : null, done_by: done ? me().id : null });
      render(); // instant feedback
      if (done && navigator.vibrate) navigator.vibrate(15);
      await run(() => S.api.update('list_items', id, { done: i.done, done_at: i.done_at, done_by: i.done_by }));
      break;
    }
    case 'item-edit': {
      const item = byId('list_items', id);
      if (!item || id.startsWith('tmp-')) break;
      if (byId('lists', item.list_id)?.kind !== 'shopping') { sheetItem(item); break; }
      let c = item.catalog_id && byId('catalog', item.catalog_id);
      if (!c) { // older item not in the library yet: remember it first
        const cid = await run(() => S.api.rpc('remember_item', { p_name: item.text, p_emoji: guessEmoji(item.text) }));
        if (!cid) break;
        await run(() => S.api.update('list_items', item.id, { catalog_id: cid }));
        await run(loadAll);
        c = byId('catalog', cid);
      }
      sheetGrocery(byId('list_items', id), c);
      break;
    }
    case 'sugg-add': await addFromCatalog(byId('catalog', id)); S.refocus = true; render(); break;
    case 'sugg-new': document.getElementById('add-item').requestSubmit(); break;
    case 'lib-open': S.listView = 'library'; S.libQuery = ''; render(); window.scrollTo(0, 0); break;
    case 'lib-close': S.listView = 'list'; render(); break;
    case 'lib-new': sheetGrocery(null, null); break;
    case 'lib-edit': sheetGrocery(null, byId('catalog', id)); break;
    case 'lib-add': await addFromCatalog(byId('catalog', id)); toast('Added to list'); break;
    case 'store-pick': S.storeId = id; localStorage.setItem('hb.store', id); render(); break;
    case 'store-new': sheetStore(null); break;
    case 'store-edit': sheetStore(byId('stores', id)); break;
    case 'sec-add': addSection(); break;
    case 'sec-move': {
      const i = +el.dataset.i, j = i + +el.dataset.d;
      [S.secEdit[i], S.secEdit[j]] = [S.secEdit[j], S.secEdit[i]]; renderSecList(); break;
    }
    case 'sec-del': S.secEdit.splice(+el.dataset.i, 1); renderSecList(); break;
    case 'toggle-done': S.showDone = !S.showDone; render(); break;
    case 'clear-done': {
      const ids = S.data.list_items.filter((i) => i.list_id === S.listId && i.done).map((i) => i.id);
      S.data.list_items = S.data.list_items.filter((i) => !ids.includes(i.id)); render();
      await run(() => S.api.removeMany('list_items', ids), `Cleared ${ids.length}`);
      break;
    }
    case 'note-color': S.noteColor = el.dataset.color; {
      const f = document.getElementById('post-form');
      f.style.setProperty('--note', S.noteColor);
      f.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === el));
    } break;
    case 'note-menu': sheetNote(byId('messages', id)); break;
    case 'cd-new': sheetCountdown(null); break;
    case 'cd-edit': sheetCountdown(byId('countdowns', id)); break;
    case 'member-edit': sheetMember(byId('members', id)); break;
    case 'kid-new': sheetMember(null); break;
    case 'hh-rename': {
      const name = prompt('Family name', household().name);
      if (name?.trim()) await run(() => S.api.update('households', household().id, { name: name.trim() }));
      break;
    }
    case 'code-share': {
      const code = household().join_code;
      const text = `Join our family on Homebase: ${location.origin + location.pathname}\nJoin code: ${code}`;
      if (navigator.share) navigator.share({ title: 'Homebase', text }).catch(() => {});
      else { await navigator.clipboard?.writeText(text); toast('Copied invite to clipboard'); }
      break;
    }
    case 'code-reset':
      if (confirm('Make a new join code? The old one will stop working.')) await run(() => S.api.rpc('reset_join_code'), 'New code created');
      scheduleReload();
      break;
    case 'sheet-close': closeSheet(); break;
    default: if (actions[el.dataset.act]) await actions[el.dataset.act](el, e);
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.id === 'sheet-form') return; // handled by openSheet
  e.preventDefault();
  const fd = new FormData(f);
  const btn = f.querySelector('[type=submit]');
  switch (f.id) {
    case 'auth-form': {
      btn.disabled = true;
      const email = fd.get('email').trim(), pw = fd.get('password');
      if (S.authMode === 'signup') {
        const r = await run(() => S.api.signUp(email, pw));
        if (r?.needsConfirm) { toast('Check your email to confirm, then sign in.', 6000); S.authMode = 'signin'; render(); }
      } else await run(() => S.api.signIn(email, pw));
      btn.disabled = false;
      break;
    }
    case 'create-form': {
      btn.disabled = true;
      const kids = fd.getAll('kid').map((k) => k.trim()).filter(Boolean);
      await run(() => S.api.rpc('create_household', { p_household_name: fd.get('hh'), p_display_name: fd.get('me'), p_kids: kids }));
      await run(loadAll); render();
      break;
    }
    case 'join-form': {
      btn.disabled = true;
      await run(() => S.api.rpc('join_household', { p_code: fd.get('code'), p_display_name: fd.get('me') }));
      await run(loadAll); render();
      break;
    }
    case 'add-item': {
      const text = fd.get('text').trim();
      if (!text) return;
      if (S.listId !== '__mine' && currentList()?.kind === 'shopping') {
        f.reset(); S.refocus = true;
        const known = S.data.catalog.find((c) => c.name.trim().toLowerCase() === text.toLowerCase());
        if (known) { await addFromCatalog(known); break; }
        const cid = await run(() => S.api.rpc('remember_item', { p_name: text, p_emoji: guessEmoji(text) }));
        S.data.list_items.push({ id: 'tmp-' + Date.now(), list_id: S.listId, text, catalog_id: cid, done: false, created_at: new Date().toISOString() });
        render();
        await run(() => S.api.insert('list_items', { household_id: household().id, list_id: S.listId, text, catalog_id: cid, created_by: me().id }));
        scheduleReload();
        break;
      }
      f.reset();
      // quick assign: "Call plumber @Nicole tomorrow 5pm"
      const q = parseQuick(text, sortedMembers(), new Date(), me()?.id);
      const mineView = S.listId === '__mine';
      const target = mineView
        ? (sortedLists().find((l) => l.kind === 'todo') || sortedLists().find((l) => l.kind !== 'shopping'))?.id
        : S.listId;
      if (!target) { toast('Create a to-do list first'); break; }
      const assigned = q.member?.id || (mineView ? me().id : null);
      const row = { household_id: household().id, list_id: target, text: q.text, created_by: me().id,
        assigned_to: assigned, due_at: q.due ? q.due.toISOString() : null };
      const temp = { ...row, id: 'tmp-' + Date.now(), done: false, created_at: new Date().toISOString() };
      S.data.list_items.push(temp); S.refocus = true; render();
      const saved = await run(() => S.api.insert('list_items', row));
      S.data.list_items = S.data.list_items.filter((i) => i.id !== temp.id);
      if (saved && assigned) notifyAssigned(saved.id, assigned, null);
      if (q.member || q.due) toast(`Added${q.member ? ` for ${q.member.name}` : ''}${q.due ? ` · ${quickLabel({ due: q.due })}` : ''}`);
      scheduleReload();
      break;
    }
    case 'post-form': {
      const body = fd.get('body').trim();
      if (!body) return;
      btn.disabled = true;
      await run(() => S.api.insert('messages', {
        household_id: household().id, author_id: me().id, body, color: S.noteColor || NOTE_COLORS[0],
      }));
      f.reset(); btn.disabled = false;
      break;
    }
  }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $sheet.innerHTML) closeSheet(); });

Object.assign(actions, {
  'board-view': (el) => { S.boardView = el.dataset.v; render(); },
  'mine-toggle': () => { S.mineOnly = !S.mineOnly; localStorage.setItem('hb.mineOnly', S.mineOnly ? '1' : ''); render(); },
  'buddy-setup': () => sheetBuddySetup(),
  'mode-set': (el) => {
    S.mode = el.dataset.mode; localStorage.setItem('hb.mode', S.mode);
    S.hubTab = 'home'; S.tab = S.mode === 'hub' ? S.tab : 'family';
    render(); startHubTimers(); window.scrollTo(0, 0);
  },
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-act=saver-set]')) {
    S.saverMin = +e.target.value; localStorage.setItem('hb.saverMin', S.saverMin); startHubTimers();
  }
});

// Grocery suggestions as you type
document.addEventListener('input', (e) => {
  if (e.target.matches('#add-item input')) renderSuggestions();
  if (e.target.matches('#add-item input') && document.getElementById('quick-preview')) {
    const box = document.getElementById('quick-preview');
    const q = parseQuick(e.target.value, sortedMembers(), new Date(), me()?.id);
    const label = quickLabel(q);
    box.hidden = !label;
    box.innerHTML = label ? `→ <b>${esc(q.text)}</b> · ${esc(label)}` : '';
  }
  if (e.target.id === 'lib-search') {
    S.libQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = document.getElementById('lib-search'); el.focus(); el.setSelectionRange(pos, pos);
  }
});
// tapping a suggestion shouldn't close the keyboard
document.addEventListener('mousedown', (e) => { if (e.target.closest('#suggest')) e.preventDefault(); });
document.addEventListener('focusin', (e) => { if (e.target.matches('#add-item input')) renderSuggestions(); });
document.addEventListener('focusout', (e) => {
  if (e.target.matches('#add-item input')) setTimeout(() => {
    const box = document.getElementById('suggest');
    if (box && !box.contains(document.activeElement) && document.activeElement !== e.target) box.hidden = true;
  }, 200);
});

boot();
