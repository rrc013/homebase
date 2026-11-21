// Shared state, helpers and UI building blocks used by every screen.
import { TABLES } from './db.js';

// Other modules register click actions here: actions['my-action'] = (el, event) => {...}
export const actions = {};
// app.js fills these in so modules can trigger a redraw / data reload
export const hooks = { render: () => {}, reload: () => {} };

// ------------------------------------------------------------------ state
export const S = {
  api: null,
  user: null,
  data: Object.fromEntries(TABLES.map((t) => [t, []])),
  tab: localStorage.getItem('hb.tab') || 'lists',
  listId: localStorage.getItem('hb.list') || null,
  showDone: false,
  storeId: localStorage.getItem('hb.store') || null,
  listView: 'list', // 'list' | 'library'
  libQuery: '',
  photoUrls: {},
  authMode: 'signin',
  onboardMode: 'create',
};

export const $app = document.getElementById('app');
export const $sheet = document.getElementById('sheet-root');
export const $toast = document.getElementById('toast');

export const NOTE_COLORS = ['#FFE58F', '#FFC8DD', '#B5E3F7', '#C7F0BD', '#E2D4FF', '#FFD6A5'];
export const MEMBER_COLORS = ['#5B8DEF', '#E57373', '#F28CB1', '#7BC67E', '#FFB74D', '#9C8CF2', '#4DB6AC', '#A1887F'];
export const KID_EMOJIS = ['🦄', '🐻', '🦊', '🐢', '🐰', '🦁', '🐸', '🐼', '🐯', '🐶', '🐱', '🦋', '🌟', '🚀', '🦖', '🐬'];
export const PARENT_EMOJIS = ['🧔', '👩', '👨', '👱‍♀️', '🧑', '👩‍🦰', '👨‍🦱', '😎'];
export const LIST_EMOJIS = ['🛒', '✅', '🔔', '📝', '🏠', '🎁', '🧹', '💊', '🐶', '✈️', '🎄', '📚', '🔧', '💼', '🧺', '🍕'];
export const STORE_EMOJIS = ['🏪', '🛒', '🟢', '🔴', '🔵', '🟠', '🟣', '🎯', '🥕', '💊', '🐾', '🏬'];
export const GROCERY_EMOJIS = ['🛒', '🥛', '🥚', '🍞', '🧀', '🍎', '🍌', '🍓', '🥕', '🥦', '🥬', '🍅', '🥑', '🍋', '🍇', '🥔', '🧅', '🧄',
  '🍗', '🥩', '🥓', '🐟', '🍝', '🍚', '🥣', '🥜', '🍪', '🍫', '🍿', '🧃', '☕', '🍵', '🥤', '🍷', '🍺', '🧈', '🍯', '🧂',
  '🫒', '🍦', '🧊', '🍕', '🧻', '🧼', '🧽', '🧴', '🪥', '💊', '🩹', '👶', '🐶', '🐱', '🔋', '💡', '🌸', '🎂'];
// Auto icon: first keyword found in the item name wins
export const FOOD_ICONS = [
  ['peanut', '🥜'], ['milk', '🥛'], ['egg', '🥚'], ['bread', '🍞'], ['bagel', '🥯'], ['tortilla', '🫓'], ['cheese', '🧀'], ['butter', '🧈'],
  ['yogurt', '🥄'], ['cream', '🍦'], ['ice cream', '🍦'], ['apple juice', '🧃'], ['juice', '🧃'], ['apple', '🍎'],
  ['banana', '🍌'], ['strawberr', '🍓'], ['blueberr', '🫐'], ['grape', '🍇'], ['lemon', '🍋'], ['lime', '🍋'],
  ['orange', '🍊'], ['peach', '🍑'], ['pear', '🍐'], ['cherr', '🍒'], ['watermelon', '🍉'], ['melon', '🍈'],
  ['pineapple', '🍍'], ['mango', '🥭'], ['avocado', '🥑'], ['tomato', '🍅'], ['carrot', '🥕'], ['broccoli', '🥦'],
  ['lettuce', '🥬'], ['spinach', '🥬'], ['salad', '🥗'], ['cucumber', '🥒'], ['pepper', '🫑'], ['corn', '🌽'],
  ['potato', '🥔'], ['onion', '🧅'], ['garlic', '🧄'], ['mushroom', '🍄'], ['pea', '🫛'], ['bean', '🫘'],
  ['chicken', '🍗'], ['turkey', '🦃'], ['beef', '🥩'], ['steak', '🥩'], ['pork', '🥩'], ['bacon', '🥓'],
  ['sausage', '🌭'], ['hot dog', '🌭'], ['ham', '🍖'], ['fish', '🐟'], ['salmon', '🐟'], ['tuna', '🐟'],
  ['shrimp', '🦐'], ['pasta', '🍝'], ['spaghetti', '🍝'], ['noodle', '🍜'], ['rice', '🍚'], ['cereal', '🥣'],
  ['oat', '🥣'], ['peanut', '🥜'], ['nut', '🥜'], ['cookie', '🍪'], ['chocolate', '🍫'], ['candy', '🍬'],
  ['popcorn', '🍿'], ['chip', '🥔'], ['cracker', '🍘'], ['pretzel', '🥨'], ['pizza', '🍕'], ['coffee', '☕'],
  ['tea', '🍵'], ['soda', '🥤'], ['water', '💧'], ['wine', '🍷'], ['beer', '🍺'], ['honey', '🍯'], ['salt', '🧂'],
  ['oil', '🫒'], ['flour', '🌾'], ['sugar', '🍬'], ['cake', '🎂'], ['muffin', '🧁'], ['ice', '🧊'], ['frozen', '🧊'],
  ['paper towel', '🧻'], ['toilet', '🧻'], ['tissue', '🧻'], ['napkin', '🧻'], ['soap', '🧼'], ['detergent', '🧴'],
  ['shampoo', '🧴'], ['lotion', '🧴'], ['sponge', '🧽'], ['toothpaste', '🪥'], ['toothbrush', '🪥'],
  ['diaper', '👶'], ['wipes', '👶'], ['baby', '👶'], ['dog', '🐶'], ['cat', '🐱'], ['batter', '🔋'],
  ['vitamin', '💊'], ['medicine', '💊'], ['bandage', '🩹'], ['flower', '🌸'], ['trash bag', '🗑️'], ['foil', '🧻'],
];
export const guessEmoji = (name) => {
  const n = ' ' + name.toLowerCase();
  const hit = FOOD_ICONS.find(([k]) => n.includes(' ' + k)); // match at the start of a word
  return hit ? hit[1] : '🛒';
};
export const EVENT_EMOJIS =['🎉', '🎂', '🎄', '🦃', '🏖️', '✈️', '🏰', '🎃', '🐣', '🎓', '⚽', '💍', '👶', '🏡', '🎁', '⛪'];

// ------------------------------------------------------------------ helpers
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const byId = (t, id) => S.data[t].find((r) => r.id === id);
export const me = () => S.data.members.find((m) => m.user_id === S.user?.id);
export const household = () => S.data.households[0];
export const sortedMembers = () => [...S.data.members].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
export const sortedLists = () => [...S.data.lists].sort((a, b) => a.sort - b.sort || a.created_at?.localeCompare(b.created_at));

export function toast(msg, ms = 2600) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), ms);
}

export async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(e.message || 'Something went wrong'); }
}

export function relTime(isoStr) {
  const s = (Date.now() - new Date(isoStr)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dueLabel(isoStr) {
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

export function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// <input type="datetime-local"> wants local time without zone
export const toLocalInput = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export const avatar = (m, size = '') => m
  ? `<span class="avatar ${size}" style="--c:${esc(m.color)}" title="${esc(m.name)}">${esc(m.emoji)}</span>`
  : '';

// ------------------------------------------------------------------ sheets (bottom modals)
export function openSheet(html, onSubmit, onCancel) {
  S.sheetCancel = onCancel || null;
  $sheet.innerHTML = `<div class="backdrop" data-act="sheet-close"></div><form class="sheet" id="sheet-form">${html}</form>`;
  requestAnimationFrame(() => $sheet.classList.add('open'));
  const form = $sheet.querySelector('#sheet-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const ok = await onSubmit?.(new FormData(form), e.submitter?.value);
    if (ok !== false) { S.sheetCancel = null; closeSheet(); }
  };
  const first = form.querySelector('[data-focus]');
  if (first) setTimeout(() => first.focus(), 250);
}
export function closeSheet() {
  S.sheetCancel?.(); S.sheetCancel = null;
  $sheet.classList.remove('open'); setTimeout(() => { $sheet.innerHTML = ''; }, 200); }

export const pickerRow = (name, options, current, kind = 'emoji') => `
  <div class="picker" data-picker="${name}">
    <input type="hidden" name="${name}" value="${esc(current)}">
    ${options.map((o) => kind === 'color'
      ? `<button type="button" class="swatch ${o === current ? 'on' : ''}" style="--c:${o}" data-pick="${o}"></button>`
      : `<button type="button" class="emo ${o === current ? 'on' : ''}" data-pick="${esc(o)}">${esc(o)}</button>`).join('')}
  </div>`;

export const memberPicker = (current) => `
  <div class="picker people" data-picker="assigned_to">
    <input type="hidden" name="assigned_to" value="${esc(current || '')}">
    <button type="button" class="person ${!current ? 'on' : ''}" data-pick="">Anyone</button>
    ${sortedMembers().map((m) => `<button type="button" class="person ${m.id === current ? 'on' : ''}" data-pick="${m.id}" style="--c:${esc(m.color)}">${esc(m.emoji)} ${esc(m.name)}</button>`).join('')}
  </div>`;

// ---------------- grocery item sheet (library details + this trip)
export async function resizeImage(file, max = 900) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
}

