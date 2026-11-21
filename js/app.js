import { createBackend, TABLES } from './db.js';

// ------------------------------------------------------------------ state
const S = {
  api: null,
  user: null,
  data: Object.fromEntries(TABLES.map((t) => [t, []])),
  tab: localStorage.getItem('hb.tab') || 'lists',
  listId: localStorage.getItem('hb.list') || null,
  showDone: false,
  authMode: 'signin',
  onboardMode: 'create',
};

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');

const NOTE_COLORS = ['#FFE58F', '#FFC8DD', '#B5E3F7', '#C7F0BD', '#E2D4FF', '#FFD6A5'];
const MEMBER_COLORS = ['#5B8DEF', '#E57373', '#F28CB1', '#7BC67E', '#FFB74D', '#9C8CF2', '#4DB6AC', '#A1887F'];
const KID_EMOJIS = ['🦄', '🐻', '🦊', '🐢', '🐰', '🦁', '🐸', '🐼', '🐯', '🐶', '🐱', '🦋', '🌟', '🚀', '🦖', '🐬'];
const PARENT_EMOJIS = ['🧔', '👩', '👨', '👱‍♀️', '🧑', '👩‍🦰', '👨‍🦱', '😎'];
const LIST_EMOJIS = ['🛒', '✅', '🔔', '📝', '🏠', '🎁', '🧹', '💊', '🐶', '✈️', '🎄', '📚', '🔧', '💼', '🧺', '🍕'];
const EVENT_EMOJIS = ['🎉', '🎂', '🎄', '🦃', '🏖️', '✈️', '🏰', '🎃', '🐣', '🎓', '⚽', '💍', '👶', '🏡', '🎁', '⛪'];

// ------------------------------------------------------------------ helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = (t, id) => S.data[t].find((r) => r.id === id);
const me = () => S.data.members.find((m) => m.user_id === S.user?.id);
const household = () => S.data.households[0];
const sortedMembers = () => [...S.data.members].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
const sortedLists = () => [...S.data.lists].sort((a, b) => a.sort - b.sort || a.created_at?.localeCompare(b.created_at));

function toast(msg, ms = 2600) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), ms);
}

async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(e.message || 'Something went wrong'); }
}

function relTime(isoStr) {
  const s = (Date.now() - new Date(isoStr)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dueLabel(isoStr) {
  const d = new Date(isoStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const days = Math.round((that - today) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// <input type="datetime-local"> wants local time without zone
const toLocalInput = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const avatar = (m, size = '') => m
  ? `<span class="avatar ${size}" style="--c:${esc(m.color)}" title="${esc(m.name)}">${esc(m.emoji)}</span>`
  : '';

// ------------------------------------------------------------------ data
async function loadAll() {
  const results = await Promise.all(TABLES.map((t) => S.api.select(t)));
  TABLES.forEach((t, i) => { S.data[t] = results[i] || []; });
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => { await run(loadAll); render(); }, 150);
}

// ------------------------------------------------------------------ boot
async function boot() {
  S.api = await createBackend();
  S.api.onAuthChange(async (u) => {
    const changed = (u?.id || null) !== (S.user?.id || null);
    S.user = u;
    if (changed) await afterAuth();
  });
  S.user = await S.api.getUser();
  await afterAuth();
  if ('serviceWorker' in navigator && !S.api.demo) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) scheduleReload(); });
}

async function afterAuth() {
  if (S.user) {
    await run(loadAll);
    S.api.subscribe(() => scheduleReload());
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
    ['lists', '📝', 'Lists'],
    ['board', '📌', 'Board'],
    ['countdowns', '⏳', 'Countdowns'],
    ['family', '🏡', 'Family'],
  ];
  const body = { lists: viewLists, board: viewBoard, countdowns: viewCountdowns, family: viewFamily }[S.tab] || viewLists;
  $app.innerHTML = `
    <header class="topbar">
      <div class="brand"><img src="icons/icon-192.png" alt=""><div><h1>Homebase</h1><small>${esc(household()?.name || '')}</small></div></div>
      ${avatar(me(), 'lg')}
    </header>
    ${S.api.demo ? '<div class="demo-banner">Demo mode — sample data only. Add your Supabase keys in <code>js/config.js</code>.</div>' : ''}
    <main class="content">${body()}</main>
    <nav class="tabbar">
      ${tabs.map(([k, i, l]) => `<button data-act="tab" data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}
    </nav>`;
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

// ---------------- lists
function currentList() {
  const lists = sortedLists();
  return lists.find((l) => l.id === S.listId) || lists[0];
}

function viewLists() {
  const lists = sortedLists();
  const list = currentList();
  if (!list) return `<div class="empty">No lists yet.<br><button class="btn primary" data-act="list-new">Create a list</button></div>`;
  S.listId = list.id;
  const items = S.data.list_items.filter((i) => i.list_id === list.id);
  const open = items.filter((i) => !i.done).sort((a, b) => {
    if (list.kind === 'reminders' || a.due_at || b.due_at) {
      if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
      if (a.due_at) return -1; if (b.due_at) return 1;
    }
    return a.created_at.localeCompare(b.created_at);
  });
  const done = items.filter((i) => i.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const placeholder = list.kind === 'shopping' ? 'Add an item…' : list.kind === 'reminders' ? 'Add a reminder…' : 'Add a to-do…';

  return `
    <div class="chips">
      ${lists.map((l) => {
        const n = S.data.list_items.filter((i) => i.list_id === l.id && !i.done).length;
        return `<button class="chip ${l.id === list.id ? 'on' : ''}" data-act="list-pick" data-id="${l.id}">${esc(l.emoji)} ${esc(l.name)}${n ? `<b>${n}</b>` : ''}</button>`;
      }).join('')}
      <button class="chip add" data-act="list-new" aria-label="New list">＋</button>
    </div>
    <div class="list-head">
      <h2>${esc(list.emoji)} ${esc(list.name)}</h2>
      <button class="icon-btn" data-act="list-edit" data-id="${list.id}" aria-label="List settings">⋯</button>
    </div>
    <form id="add-item" class="add-bar">
      <input name="text" placeholder="${placeholder}" autocomplete="off" enterkeyhint="done" data-autofocus>
      <button class="btn primary round" type="submit" aria-label="Add">＋</button>
    </form>
    <ul class="items">
      ${open.map(itemRow).join('') || `<li class="empty small">All clear! 🎉</li>`}
    </ul>
    ${done.length ? `
      <div class="done-head">
        <button class="link" data-act="toggle-done">${S.showDone ? '▾' : '▸'} Done (${done.length})</button>
        <button class="link danger" data-act="clear-done">Clear</button>
      </div>
      ${S.showDone ? `<ul class="items done">${done.map(itemRow).join('')}</ul>` : ''}` : ''}`;
}

function itemRow(i) {
  const who = byId('members', i.assigned_to);
  const overdue = !i.done && i.due_at && new Date(i.due_at) < new Date();
  const doneBy = i.done ? byId('members', i.done_by) : null;
  const meta = [
    i.due_at ? `<span class="due ${overdue ? 'overdue' : ''}">⏰ ${esc(dueLabel(i.due_at))}</span>` : '',
    i.note ? `<span class="note-ico">📄 ${esc(i.note.length > 40 ? i.note.slice(0, 40) + '…' : i.note)}</span>` : '',
    doneBy ? `<span>✓ ${esc(doneBy.name)}</span>` : '',
  ].filter(Boolean).join('');
  return `
    <li class="item ${i.done ? 'is-done' : ''}">
      <button class="check" data-act="item-toggle" data-id="${i.id}" aria-label="${i.done ? 'Mark not done' : 'Mark done'}">${i.done ? '✓' : ''}</button>
      <button class="item-body" data-act="item-edit" data-id="${i.id}">
        <span class="item-text">${esc(i.text)}</span>
        ${meta ? `<span class="meta">${meta}</span>` : ''}
      </button>
      ${avatar(who)}
    </li>`;
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
    <section class="card stack">
      <small class="muted">Signed in as ${esc(S.user.email)}</small>
      <button class="btn ghost" data-act="signout">Sign out</button>
    </section>
    <p class="muted center small">Homebase · Phase 1 — Lists, Board, Countdowns</p>`;
}

// ------------------------------------------------------------------ sheets (bottom modals)
function openSheet(html, onSubmit) {
  $sheet.innerHTML = `<div class="backdrop" data-act="sheet-close"></div><form class="sheet" id="sheet-form">${html}</form>`;
  requestAnimationFrame(() => $sheet.classList.add('open'));
  const form = $sheet.querySelector('#sheet-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const ok = await onSubmit?.(new FormData(form), e.submitter?.value);
    if (ok !== false) closeSheet();
  };
  const first = form.querySelector('[data-focus]');
  if (first) setTimeout(() => first.focus(), 250);
}
function closeSheet() { $sheet.classList.remove('open'); setTimeout(() => { $sheet.innerHTML = ''; }, 200); }

const pickerRow = (name, options, current, kind = 'emoji') => `
  <div class="picker" data-picker="${name}">
    <input type="hidden" name="${name}" value="${esc(current)}">
    ${options.map((o) => kind === 'color'
      ? `<button type="button" class="swatch ${o === current ? 'on' : ''}" style="--c:${o}" data-pick="${o}"></button>`
      : `<button type="button" class="emo ${o === current ? 'on' : ''}" data-pick="${esc(o)}">${esc(o)}</button>`).join('')}
  </div>`;

const memberPicker = (current) => `
  <div class="picker people" data-picker="assigned_to">
    <input type="hidden" name="assigned_to" value="${esc(current || '')}">
    <button type="button" class="person ${!current ? 'on' : ''}" data-pick="">Anyone</button>
    ${sortedMembers().map((m) => `<button type="button" class="person ${m.id === current ? 'on' : ''}" data-pick="${m.id}" style="--c:${esc(m.color)}">${esc(m.emoji)} ${esc(m.name)}</button>`).join('')}
  </div>`;

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
  });
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

// ------------------------------------------------------------------ events
document.addEventListener('click', async (e) => {
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
    case 'list-pick': S.listId = id; localStorage.setItem('hb.list', id); S.showDone = false; render(); break;
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
    case 'item-edit': sheetItem(byId('list_items', id)); break;
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
      f.reset();
      const temp = { id: 'tmp-' + Date.now(), list_id: S.listId, text, done: false, created_at: new Date().toISOString() };
      S.data.list_items.push(temp); S.refocus = true; render();
      await run(() => S.api.insert('list_items', {
        household_id: household().id, list_id: S.listId, text, created_by: me().id,
      }));
      S.data.list_items = S.data.list_items.filter((i) => i.id !== temp.id);
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

boot();
