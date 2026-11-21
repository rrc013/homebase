// Kids: chores, routines, stars (points), rewards — data helpers + the parents' Kids tab
import {
  S, esc, byId, me, household, sortedMembers, toast, run, avatar, openSheet, pickerRow, resizeImage,
  actions, hooks, relTime,
} from './core.js';
import { petHtml, levelInfo, petOf, PETS } from './pets.js';
import { celebrate } from './fun.js';

const PHOTO_BUCKET = 'chore-photos';
export const CHORE_EMOJIS = ['🧸', '🍽️', '🐾', '🧺', '🪴', '🛏️', '🧦', '📚', '🗑️', '🧹', '🧽', '🚗', '🥕', '🎒', '👟', '🪥', '🐶', '🐱', '🧼', '🌳', '📬', '🎹', '✏️', '⭐'];
export const REWARD_EMOJIS = ['🍦', '🎬', '🛝', '🌙', '🎨', '🧸', '🍕', '🎮', '📱', '🎁', '🍪', '🏊', '🎳', '🛍️', '💵', '🦄'];
const STEP_PRESETS = [['🚽', 'Go potty'], ['🪥', 'Brush your teeth'], ['👗', 'Get dressed'], ['🥣', 'Eat breakfast'], ['🎒', 'Get your backpack'],
  ['👟', 'Put on shoes'], ['💇', 'Brush your hair'], ['🧴', 'Sunscreen'], ['🛏️', 'Make your bed'], ['🧸', 'Clean up toys'], ['🛁', 'Bath time'],
  ['👕', 'Put on pajamas'], ['📖', 'Story time'], ['🙏', 'Prayers'], ['💧', 'Drink of water'], ['🤗', 'Hugs and kisses'], ['💤', 'Lights out']];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ------------------------------------------------------------------ helpers
export const kids = () => sortedMembers().filter((m) => m.kind === 'kid');
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayStr = () => ymd(new Date());
const weekStartStr = (d = new Date()) => ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));

const DEFAULT_PROFILE = { pet_kind: null, pet_name: 'Buddy', morning_start: '06:45', wake_time: '07:00', bedtime_start: '19:15', sleep_time: '20:00', voice: true };
export const profileOf = (kid) => ({ ...DEFAULT_PROFILE, ...(S.data.kid_profiles.find((p) => p.member_id === kid.id) || {}) });

export function choresFor(kid, date = new Date()) {
  const d = ymd(date), dow = date.getDay();
  return S.data.chores.filter((c) => c.active && (!c.member_id || c.member_id === kid.id) && (
    c.schedule === 'weekly' || (c.schedule === 'once' ? c.due_date === d : (c.days || []).includes(dow))
  )).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}
// the completion record for a chore today (or this week for weekly chores), if any
export function choreDone(chore, kid, date = new Date()) {
  const d = ymd(date), ws = weekStartStr(date);
  return S.data.completions.find((x) => x.kind === 'chore' && x.ref_id === chore.id && x.member_id === kid.id && x.status !== 'rejected'
    && (chore.schedule === 'weekly' ? x.day >= ws && x.day <= d : x.day === d));
}
export const routineOf = (kid, kind) => S.data.routines.find((r) => r.member_id === kid.id && r.kind === kind);
export const routineDone = (kid, kind, date = new Date()) => {
  const r = routineOf(kid, kind);
  return r && S.data.completions.find((x) => x.kind === 'routine' && x.ref_id === r.id && x.day === ymd(date) && x.status !== 'rejected');
};
const ledger = (kid) => S.data.completions.filter((x) => x.member_id === kid.id);
export const balance = (kid) => ledger(kid).filter((x) => x.status === 'approved').reduce((s, x) => s + x.points, 0);
export const earned = (kid) => ledger(kid).filter((x) => x.status === 'approved' && x.points > 0).reduce((s, x) => s + x.points, 0);
export function todayProgress(kid) {
  const chores = choresFor(kid);
  const routines = ['morning', 'bedtime'].map((k) => routineOf(kid, k)).filter((r) => r?.steps?.length);
  const total = chores.length + routines.length;
  const done = chores.filter((c) => choreDone(c, kid)).length + routines.filter((r) => routineDone(kid, r.kind)).length;
  return { done, total, ratio: total ? done / total : 1 };
}
export const pendingApprovals = () => S.data.completions.filter((x) => x.status === 'pending')
  .sort((a, b) => a.created_at.localeCompare(b.created_at));

// ------------------------------------------------------------------ actions that award stars
const baseRow = (kid) => ({ household_id: household().id, member_id: kid.id, day: todayStr(), created_by: me()?.id ?? null });

export async function completeChore(kid, chore, photoBlob = null) {
  let photo_path = null;
  if (photoBlob) photo_path = await S.api.uploadPhoto(household().id, photoBlob, PHOTO_BUCKET);
  const row = { ...baseRow(kid), kind: 'chore', ref_id: chore.id, title: chore.title, emoji: chore.emoji, points: chore.points,
    status: chore.photo_proof ? 'pending' : 'approved', photo_path };
  const saved = await S.api.insert('completions', row);
  S.data.completions.push(saved);
  if (saved.status === 'pending') S.api.fn('notify', { action: 'approval', completion_id: saved.id }).catch(() => {});
  return saved;
}
export async function completeRoutine(kid, routine) {
  if (routineDone(kid, routine.kind)) return null;
  const row = { ...baseRow(kid), kind: 'routine', ref_id: routine.id, title: routine.kind === 'morning' ? 'Morning routine' : 'Bedtime routine',
    emoji: routine.kind === 'morning' ? '☀️' : '🌙', points: routine.points, status: 'approved' };
  const saved = await S.api.insert('completions', row);
  S.data.completions.push(saved);
  return saved;
}
export async function requestReward(kid, reward) {
  const row = { ...baseRow(kid), kind: 'redeem', ref_id: reward.id, title: reward.title, emoji: reward.emoji, points: -reward.cost, status: 'pending' };
  const saved = await S.api.insert('completions', row);
  S.data.completions.push(saved);
  S.api.fn('notify', { action: 'approval', completion_id: saved.id }).catch(() => {});
  return saved;
}
export const pendingRedeem = (kid) => ledger(kid).filter((x) => x.kind === 'redeem' && x.status === 'pending');

// make sure every kid has a profile + starter routines (parents' devices do this once)
const ensured = new Set();
export async function ensureKidSetup() {
  if (me()?.kind !== 'parent') return;
  let changed = false;
  for (const kid of kids()) {
    if (ensured.has(kid.id)) continue;
    ensured.add(kid.id);
    if (!S.data.kid_profiles.some((p) => p.member_id === kid.id)) {
      await run(() => S.api.insert('kid_profiles', { member_id: kid.id, household_id: household().id })); changed = true;
    }
    for (const [kind, steps] of [
      ['morning', [['🚽', 'Go potty'], ['🪥', 'Brush your teeth'], ['👗', 'Get dressed'], ['🥣', 'Eat breakfast'], ['🎒', 'Get your backpack']]],
      ['bedtime', [['🧸', 'Clean up toys'], ['🛁', 'Bath time'], ['👕', 'Put on pajamas'], ['🪥', 'Brush your teeth'], ['🚽', 'Go potty'], ['📖', 'Story time'], ['💤', 'Lights out']]],
    ]) {
      if (!routineOf(kid, kind)) {
        await run(() => S.api.insert('routines', { household_id: household().id, member_id: kid.id, kind, points: 5,
          steps: steps.map(([emoji, title]) => ({ emoji, title })) }));
        changed = true;
      }
    }
  }
  if (changed) { await hooks.loadAll(); hooks.render(); }
}

async function addStarters() {
  const hid = household().id;
  const chores = [['🧸', 'Pick up toys', 2, 'evening'], ['🍽️', 'Clear your plate', 1, 'anytime'], ['🐾', 'Feed the pets', 2, 'morning'],
    ['🧺', 'Clothes in hamper', 1, 'evening'], ['🛏️', 'Make your bed', 2, 'morning'], ['📚', 'Read a book with Mom or Dad', 2, 'evening']];
  for (const [i, [emoji, title, points, time_of_day]] of chores.entries()) {
    await S.api.insert('chores', { household_id: hid, member_id: null, title, emoji, points, time_of_day, sort: i });
  }
  await S.api.insert('chores', { household_id: hid, member_id: null, title: 'Water the plants', emoji: '🪴', points: 3, days: [6], photo_proof: true, sort: 7 });
  await S.api.insert('chores', { household_id: hid, member_id: null, title: 'Match the socks', emoji: '🧦', points: 3, schedule: 'weekly', sort: 8 });
  const rewards = [['🍦', 'Ice cream treat', 15], ['🎬', 'Pick the family movie', 20], ['🛝', 'Park trip with Dad', 25],
    ['🌙', 'Stay up 15 min late', 25], ['🎨', 'New coloring book', 30], ['🧸', 'Small toy', 50]];
  for (const [i, [emoji, title, cost]] of rewards.entries()) await S.api.insert('rewards', { household_id: hid, title, emoji, cost, sort: i });
}

// ------------------------------------------------------------------ parents' Kids tab
S.kidsView = S.kidsView || 'main';

export function viewKids() {
  setTimeout(ensureKidSetup, 0);
  if (S.kidsView === 'chores') return viewManageChores();
  if (S.kidsView === 'rewards') return viewManageRewards();
  if (S.kidsView.startsWith('activity:')) return viewActivity(byId('members', S.kidsView.split(':')[1]));
  const list = kids();
  if (!list.length) return '<div class="empty card">Add your kids on the Family tab first.</div>';
  const pend = pendingApprovals();
  const isParent = me()?.kind === 'parent';
  const empty = !S.data.chores.length && !S.data.rewards.length;
  return `
    ${pend.length && isParent ? `<section class="card approvals">
      <h3>⏳ Waiting for you <span class="badge">${pend.length}</span></h3>
      ${pend.map(approvalRow).join('')}
    </section>` : ''}
    ${empty && isParent ? `<section class="card stack center">
      <div style="font-size:2.6rem">🌟</div><h3>Start with some chores & rewards?</h3>
      <p class="muted small">Adds 8 kid-friendly chores and 6 rewards you can edit or delete.</p>
      <button class="btn primary" data-act="kids-starters">Add starter chores & rewards</button></section>` : ''}
    ${list.map(kidCard).join('')}
    ${isParent ? `<div class="manage-row">
      <button class="btn" data-act="kids-view" data-view="chores">🧹 Chores (${S.data.chores.length})</button>
      <button class="btn" data-act="kids-view" data-view="rewards">🎁 Rewards (${S.data.rewards.length})</button>
    </div>` : ''}`;
}

function approvalRow(x) {
  const kid = byId('members', x.member_id);
  const url = x.photo_path && S.photoUrls[x.photo_path];
  const isRedeem = x.kind === 'redeem';
  return `
    <div class="approval">
      ${url ? `<button class="appr-photo" data-act="appr-photo" data-id="${x.id}"><img src="${esc(url)}" alt=""></button>` : `<span class="appr-emoji">${esc(x.emoji)}</span>`}
      <span class="appr-text"><strong>${esc(kid?.name || '')} ${isRedeem ? 'wants' : 'did'} ${esc(x.title)}</strong>
        <small>${isRedeem ? `Costs ${-x.points} ⭐ · has ${balance(kid)} ⭐` : `${x.points} ⭐ · ${relTime(x.created_at)}${x.photo_path ? ' · 📷 photo' : ''}`}</small></span>
      <button class="btn small-btn danger ghost" data-act="appr-no" data-id="${x.id}">${isRedeem ? 'Not now' : 'Not yet'}</button>
      <button class="btn small-btn primary" data-act="appr-yes" data-id="${x.id}">${isRedeem ? 'Yes!' : 'Approve'}</button>
    </div>`;
}

export function kidCard(kid, { compact = false } = {}) {
  const prof = profileOf(kid);
  const bal = balance(kid), earn = earned(kid);
  const { level, progress, nextUnlock } = levelInfo(earn);
  const prog = todayProgress(kid);
  const pet = petOf(prof.pet_kind);
  const chores = choresFor(kid);
  const routines = ['morning', 'bedtime'].map((k) => routineOf(kid, k)).filter((r) => r?.steps?.length);
  const isParent = me()?.kind === 'parent';
  return `
    <section class="card kid-card" style="--c:${esc(kid.color)}">
      <div class="kid-head">
        ${petHtml(prof, earn, prog.ratio, { size: 'sm' })}
        <div class="kid-info">
          <h2>${esc(kid.emoji)} ${esc(kid.name)}</h2>
          <small class="muted">${pet ? `${esc(prof.pet_name)} the ${esc(pet.label.toLowerCase())} · Level ${level}` : 'Pet not chosen yet'}</small>
          <div class="lvl-bar"><i style="width:${Math.round(progress * 100)}%"></i></div>
          ${nextUnlock ? `<small class="muted">Next: ${nextUnlock.emoji} at level ${nextUnlock.level}</small>` : ''}
        </div>
        <div class="stars-big"><b>${bal}</b><span>⭐</span></div>
      </div>
      <div class="today-bar"><span>Today ${prog.done}/${prog.total}</span><div class="lvl-bar wide"><i style="width:${Math.round(prog.ratio * 100)}%"></i></div></div>
      <div class="routine-chips">${routines.map((r) => {
        const done = routineDone(kid, r.kind);
        return `<span class="rchip ${done ? 'done' : ''}">${r.kind === 'morning' ? '☀️ Morning' : '🌙 Bedtime'} ${done ? '✓' : ''}</span>`;
      }).join('')}</div>
      ${compact ? '' : `<div class="chore-grid">${chores.map((c) => {
        const d = choreDone(c, kid);
        return `<button class="chore-tile ${d ? (d.status === 'pending' ? 'pending' : 'done') : ''}" data-act="kid-chore" data-kid="${kid.id}" data-id="${c.id}">
          <span class="ct-emoji">${esc(c.emoji)}</span><span class="ct-title">${esc(c.title)}</span>
          <span class="ct-pts">${d ? (d.status === 'pending' ? '⏳' : '✓') : `${c.points}⭐`}${c.photo_proof && !d ? ' 📷' : ''}</span></button>`;
      }).join('') || '<p class="muted small">No chores today.</p>'}</div>`}
      ${isParent && !compact ? `<div class="row wrap kid-actions">
        <button class="btn small-btn" data-act="kid-bonus" data-id="${kid.id}">＋ Bonus stars</button>
        <button class="btn small-btn ghost" data-act="kids-view" data-view="activity:${kid.id}">📜 Activity</button>
        <button class="btn small-btn ghost" data-act="kid-settings" data-id="${kid.id}">⚙️ Pet, routines & bedtime</button>
      </div>` : ''}
    </section>`;
}

function viewManageChores() {
  const rows = [...S.data.chores].sort((a, b) => (b.active - a.active) || a.sort - b.sort);
  const schedText = (c) => c.schedule === 'weekly' ? 'Once a week' : c.schedule === 'once' ? `One time · ${c.due_date || ''}`
    : c.days.length === 7 ? 'Every day' : c.days.slice().sort().map((d) => DOW[d]).join(' ');
  return `
    <div class="list-head"><button class="link" data-act="kids-view" data-view="main">‹ Kids</button><button class="btn primary small-btn" data-act="chore-new">＋ New chore</button></div>
    <h2>🧹 Chores</h2>
    <ul class="items">${rows.map((c) => `
      <li class="item ${c.active ? '' : 'is-done'}"><button class="item-body with-thumb" data-act="chore-edit" data-id="${c.id}">
        <span class="thumb">${esc(c.emoji)}</span>
        <span class="item-main"><span class="item-text">${esc(c.title)}</span>
          <span class="meta"><span>${c.points} ⭐</span><span>${esc(schedText(c))}</span><span>${esc(byId('members', c.member_id)?.name || 'All kids')}</span>${c.photo_proof ? '<span>📷 photo proof</span>' : ''}${c.active ? '' : '<span>Paused</span>'}</span></span>
      </button></li>`).join('') || '<li class="empty small">No chores yet.</li>'}</ul>`;
}

function viewManageRewards() {
  const rows = [...S.data.rewards].sort((a, b) => a.cost - b.cost);
  return `
    <div class="list-head"><button class="link" data-act="kids-view" data-view="main">‹ Kids</button><button class="btn primary small-btn" data-act="reward-new">＋ New reward</button></div>
    <h2>🎁 Rewards</h2>
    <ul class="items">${rows.map((r) => `
      <li class="item ${r.active ? '' : 'is-done'}"><button class="item-body with-thumb" data-act="reward-edit" data-id="${r.id}">
        <span class="thumb">${esc(r.emoji)}</span>
        <span class="item-main"><span class="item-text">${esc(r.title)}</span>
          <span class="meta"><span>${r.cost} ⭐</span><span>${esc(byId('members', r.member_id)?.name || 'All kids')}</span>${r.active ? '' : '<span>Hidden</span>'}</span></span>
      </button></li>`).join('') || '<li class="empty small">No rewards yet.</li>'}</ul>`;
}

function viewActivity(kid) {
  if (!kid) { S.kidsView = 'main'; return viewKids(); }
  const rows = ledger(kid).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80);
  return `
    <div class="list-head"><button class="link" data-act="kids-view" data-view="main">‹ Kids</button><span class="stars-pill">${balance(kid)} ⭐</span></div>
    <h2>📜 ${esc(kid.name)}'s activity</h2>
    <ul class="items">${rows.map((x) => `
      <li class="item ${x.status === 'rejected' ? 'is-done' : ''}">
        <span class="thumb">${esc(x.emoji)}</span>
        <span class="item-main" style="flex:1"><span class="item-text">${esc(x.title)}</span>
          <span class="meta"><span>${new Date(x.day + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          ${x.status !== 'approved' ? `<span>${x.status === 'pending' ? '⏳ waiting' : '✗ not approved'}</span>` : ''}${x.note ? `<span>${esc(x.note)}</span>` : ''}</span></span>
        <b class="${x.points < 0 ? 'neg' : 'pos'}">${x.points > 0 ? '+' : ''}${x.points}</b>
        ${me()?.kind === 'parent' ? `<button class="icon-btn" data-act="ledger-undo" data-id="${x.id}" aria-label="Undo">↩︎</button>` : ''}
      </li>`).join('') || '<li class="empty small">Nothing yet.</li>'}</ul>`;
}

// ------------------------------------------------------------------ sheets
const kidOptions = (sel) => `<option value="">All kids</option>${kids().map((k) => `<option value="${k.id}" ${k.id === sel ? 'selected' : ''}>${esc(k.emoji)} ${esc(k.name)}</option>`).join('')}`;

function sheetChore(c) {
  const isNew = !c;
  c = c || { title: '', emoji: '🧸', points: 2, schedule: 'days', days: [0, 1, 2, 3, 4, 5, 6], time_of_day: 'anytime', photo_proof: false, active: true, member_id: null };
  const sched = c.schedule === 'days' && c.days.length === 7 ? 'daily' : c.schedule;
  openSheet(`
    <h2>${isNew ? 'New chore' : 'Edit chore'}</h2>
    <label>Chore<input name="title" value="${esc(c.title)}" placeholder="Feed the dog, Set the table…" required ${isNew ? 'data-focus' : ''}></label>
    <label>Picture <small class="muted">(what Harper sees — she can't read yet)</small><span></span></label>${pickerRow('emoji', CHORE_EMOJIS.includes(c.emoji) ? CHORE_EMOJIS : [c.emoji, ...CHORE_EMOJIS], c.emoji)}
    <label>Who<select name="member_id">${kidOptions(c.member_id)}</select></label>
    <label>Stars<span></span></label>
    <div class="picker" data-picker="points"><input type="hidden" name="points" value="${c.points}">
      ${[1, 2, 3, 5, 10].map((n) => `<button type="button" class="person ${n === c.points ? 'on' : ''}" data-pick="${n}">${n} ⭐</button>`).join('')}</div>
    <label>How often
      <select name="schedule" data-act="chore-sched">
        <option value="daily" ${sched === 'daily' ? 'selected' : ''}>Every day</option>
        <option value="days" ${sched === 'days' ? 'selected' : ''}>Certain days</option>
        <option value="weekly" ${sched === 'weekly' ? 'selected' : ''}>Once a week (any day)</option>
        <option value="once" ${sched === 'once' ? 'selected' : ''}>Just once</option>
      </select></label>
    <div class="days-pick" id="days-pick" ${sched === 'days' ? '' : 'hidden'}>${DOW.map((d, i) => `
      <label class="day-chip"><input type="checkbox" name="day" value="${i}" ${c.days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
    <label id="once-date" ${sched === 'once' ? '' : 'hidden'}>Date<input type="date" name="due_date" value="${esc(c.due_date || todayStr())}"></label>
    <label>Time of day<select name="time_of_day">${[['anytime', 'Anytime'], ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']]
      .map(([v, t]) => `<option value="${v}" ${c.time_of_day === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="check-row"><input type="checkbox" name="photo_proof" ${c.photo_proof ? 'checked' : ''}> 📷 Photo proof — she takes a picture, you approve before stars count</label>
    ${isNew ? '' : `<label class="check-row"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> Active (uncheck to pause)</label>`}
    <div class="row between">
      ${isNew ? '<span></span>' : '<button class="btn danger ghost" type="submit" value="delete" formnovalidate>Delete</button>'}
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') {
      if (!confirm(`Delete "${c.title}"? Stars already earned are kept.`)) return false;
      await run(() => S.api.remove('chores', c.id), 'Deleted'); return;
    }
    const s = f.get('schedule');
    const days = s === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : f.getAll('day').map(Number);
    if (s === 'days' && !days.length) { toast('Pick at least one day'); return false; }
    const row = {
      title: f.get('title').trim(), emoji: f.get('emoji'), member_id: f.get('member_id') || null, points: +f.get('points') || 1,
      schedule: s === 'daily' ? 'days' : s, days: s === 'days' || s === 'daily' ? days : [0, 1, 2, 3, 4, 5, 6],
      due_date: s === 'once' ? f.get('due_date') : null, time_of_day: f.get('time_of_day'), photo_proof: !!f.get('photo_proof'),
      active: isNew ? true : !!f.get('active'),
    };
    if (isNew) await run(() => S.api.insert('chores', { ...row, household_id: household().id, sort: S.data.chores.length }), 'Chore added');
    else await run(() => S.api.update('chores', c.id, row), 'Saved');
  });
}

function sheetReward(r) {
  const isNew = !r;
  r = r || { title: '', emoji: '🍦', cost: 20, active: true, member_id: null };
  openSheet(`
    <h2>${isNew ? 'New reward' : 'Edit reward'}</h2>
    <label>Reward<input name="title" value="${esc(r.title)}" placeholder="Ice cream, Movie night…" required ${isNew ? 'data-focus' : ''}></label>
    <label>Picture<span></span></label>${pickerRow('emoji', REWARD_EMOJIS.includes(r.emoji) ? REWARD_EMOJIS : [r.emoji, ...REWARD_EMOJIS], r.emoji)}
    <label>Costs (stars)<input type="number" name="cost" min="1" value="${r.cost}" required></label>
    <label>For<select name="member_id">${kidOptions(r.member_id)}</select></label>
    ${isNew ? '' : `<label class="check-row"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> Show in the prize shop</label>`}
    <div class="row between">
      ${isNew ? '<span></span>' : '<button class="btn danger ghost" type="submit" value="delete" formnovalidate>Delete</button>'}
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action === 'delete') { if (!confirm(`Delete "${r.title}"?`)) return false; await run(() => S.api.remove('rewards', r.id), 'Deleted'); return; }
    const row = { title: f.get('title').trim(), emoji: f.get('emoji'), cost: Math.max(1, +f.get('cost')), member_id: f.get('member_id') || null, active: isNew ? true : !!f.get('active') };
    if (isNew) await run(() => S.api.insert('rewards', { ...row, household_id: household().id, sort: S.data.rewards.length }), 'Reward added');
    else await run(() => S.api.update('rewards', r.id, row), 'Saved');
  });
}

function sheetBonus(kid) {
  openSheet(`
    <h2>Stars for ${esc(kid.name)}</h2>
    <p class="muted small">Catch them being good! Bonus stars count toward rewards and grow the pet.</p>
    <div class="picker" data-picker="points"><input type="hidden" name="points" value="2">
      ${[1, 2, 3, 5, 10].map((n) => `<button type="button" class="person ${n === 2 ? 'on' : ''}" data-pick="${n}">+${n} ⭐</button>`).join('')}
      ${[-1, -5].map((n) => `<button type="button" class="person neg" data-pick="${n}">${n}</button>`).join('')}</div>
    <label>Why?<input name="note" placeholder="Helped with groceries, shared with a friend…" data-focus></label>
    <div class="row between"><span></span>
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Give stars</button></div></div>`,
  async (f) => {
    const pts = +f.get('points');
    const note = f.get('note').trim();
    await run(() => S.api.insert('completions', { ...baseRow(kid), kind: 'bonus', title: note || (pts > 0 ? 'Bonus stars' : 'Stars removed'),
      emoji: pts > 0 ? '🌟' : '➖', points: pts, status: 'approved', note: note || null }), pts > 0 ? `+${pts} ⭐ for ${kid.name}!` : 'Stars removed');
    if (pts > 0) celebrate();
  });
}

function sheetKidSettings(kid) {
  const p = profileOf(kid);
  openSheet(`
    <h2>${esc(kid.name)}'s Buddy settings</h2>
    <label>Pet<span></span></label>
    <div class="picker" data-picker="pet_kind"><input type="hidden" name="pet_kind" value="${esc(p.pet_kind || '')}">
      ${PETS.map((pt) => `<button type="button" class="emo ${pt.kind === p.pet_kind ? 'on' : ''}" data-pick="${pt.kind}" title="${pt.label}">${pt.emoji}</button>`).join('')}</div>
    <small class="muted">Leave it for ${esc(kid.name)} to pick on her Buddy the first time, or choose here.</small>
    <label>Pet's name<input name="pet_name" value="${esc(p.pet_name)}"></label>
    <div class="dt-grid">
      <label>☀️ Morning routine starts<input type="time" name="morning_start" value="${String(p.morning_start).slice(0, 5)}"></label>
      <label>🌞 OK to wake (sun)<input type="time" name="wake_time" value="${String(p.wake_time).slice(0, 5)}"></label>
      <label>🌙 Bedtime routine starts<input type="time" name="bedtime_start" value="${String(p.bedtime_start).slice(0, 5)}"></label>
      <label>💤 Sleep time (moon)<input type="time" name="sleep_time" value="${String(p.sleep_time).slice(0, 5)}"></label>
    </div>
    <label class="check-row"><input type="checkbox" name="voice" ${p.voice ? 'checked' : ''}> 🔊 Read everything out loud</label>
    <div class="row wrap">
      <button type="button" class="btn" data-act="routine-edit" data-kid="${kid.id}" data-kind="morning">☀️ Edit morning steps</button>
      <button type="button" class="btn" data-act="routine-edit" data-kid="${kid.id}" data-kind="bedtime">🌙 Edit bedtime steps</button>
    </div>
    <div class="reset-box">
      <strong>Start fresh</strong>
      <small class="muted">For after a demo: removes ${esc(kid.name)}'s pet (so she picks one herself), all stars, prize requests and activity. Chores, rewards, routines and bedtime times stay.</small>
      <button type="button" class="btn danger" data-act="kid-reset" data-id="${kid.id}">↺ Reset pet & stars</button>
    </div>
    <div class="row between"><span></span>
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div></div>`,
  async (f) => {
    const row = { pet_kind: f.get('pet_kind') || null, pet_name: f.get('pet_name').trim() || 'Buddy', morning_start: f.get('morning_start'),
      wake_time: f.get('wake_time'), bedtime_start: f.get('bedtime_start'), sleep_time: f.get('sleep_time'), voice: !!f.get('voice'), updated_at: new Date().toISOString() };
    if (S.data.kid_profiles.some((x) => x.member_id === kid.id)) await run(() => S.api.updateWhere('kid_profiles', 'member_id', kid.id, row), 'Saved');
    else await run(() => S.api.insert('kid_profiles', { ...row, member_id: kid.id, household_id: household().id }), 'Saved');
  });
}

function sheetRoutine(kid, kind) {
  const r = routineOf(kid, kind);
  if (!r) { toast('Routine is still being set up — try again in a second'); return; }
  S.stepEdit = (r.steps || []).map((s) => ({ ...s }));
  openSheet(`
    <h2>${kind === 'morning' ? '☀️ Morning' : '🌙 Bedtime'} routine — ${esc(kid.name)}</h2>
    <p class="muted small">Each step is shown as a big picture and read out loud. Finishing all steps earns the stars below.</p>
    <ul class="sec-list step-list" id="step-list"></ul>
    <label>Add a step<span></span></label>
    <div class="picker">${STEP_PRESETS.map(([e, t]) => `<button type="button" class="person" data-act="step-add" data-emoji="${e}" data-title="${esc(t)}">${e} ${esc(t)}</button>`).join('')}</div>
    <div class="row"><input id="step-new" placeholder="Or type your own step"><button type="button" class="btn" data-act="step-add-own">Add</button></div>
    <label>Stars for finishing<input type="number" name="points" min="0" value="${r.points}"></label>
    <div class="row between"><span></span>
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div></div>`,
  async (f) => {
    await run(() => S.api.update('routines', r.id, { steps: S.stepEdit, points: Math.max(0, +f.get('points') || 0) }), 'Routine saved');
  });
  renderSteps();
}
function renderSteps() {
  const ul = document.getElementById('step-list'); if (!ul) return;
  ul.innerHTML = S.stepEdit.map((s, i) => `
    <li><span class="sec-num">${esc(s.emoji)}</span><span class="sec-name">${esc(s.title)}</span>
      <button type="button" class="icon-btn" data-act="step-move" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="icon-btn" data-act="step-move" data-i="${i}" data-d="1" ${i === S.stepEdit.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="icon-btn" data-act="step-del" data-i="${i}">✕</button></li>`).join('') || '<li class="muted small">No steps yet — add some below.</li>';
}

function sheetPhoto(x) {
  openSheet(`
    <div class="photo-box tall"><img src="${esc(S.photoUrls[x.photo_path] || '')}" alt=""></div>
    <h3>${esc(byId('members', x.member_id)?.name || '')} — ${esc(x.title)}</h3>
    <div class="row between">
      <button class="btn danger ghost" type="submit" value="no">Not yet</button>
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Close</button><button class="btn primary" type="submit" value="yes">Approve ${x.points} ⭐</button></div>
    </div>`, async (_f, action) => { await review(x, action === 'yes'); });
}

async function review(x, ok) {
  if (x.kind === 'redeem' && ok) {
    const kid = byId('members', x.member_id);
    if (balance(kid) < -x.points && !confirm(`${kid.name} only has ${balance(kid)} ⭐. Approve anyway?`)) return;
  }
  await run(() => S.api.update('completions', x.id, { status: ok ? 'approved' : 'rejected', reviewed_by: me().id }),
    ok ? (x.kind === 'redeem' ? `🎁 ${x.title} approved!` : 'Approved ⭐') : 'Marked not yet');
  if (!ok && x.photo_path) S.api.deletePhoto(x.photo_path, PHOTO_BUCKET).catch(() => {});
  await hooks.loadAll(); hooks.render();
}

export async function signChorePhotos() {
  const missing = S.data.completions.filter((x) => x.status === 'pending' && x.photo_path && !S.photoUrls[x.photo_path]).map((x) => x.photo_path);
  if (missing.length) Object.assign(S.photoUrls, await S.api.photoUrls(missing, PHOTO_BUCKET).catch(() => ({})));
}

// ------------------------------------------------------------------ click actions
Object.assign(actions, {
  'kids-view': (el) => { S.kidsView = el.dataset.view; hooks.render(); window.scrollTo(0, 0); },
  'kids-starters': async () => { await run(addStarters, 'Starter chores & rewards added'); await hooks.loadAll(); hooks.render(); },
  'chore-new': () => sheetChore(null),
  'chore-edit': (el) => sheetChore(byId('chores', el.dataset.id)),
  'chore-sched': (el) => {
    document.getElementById('days-pick').hidden = el.value !== 'days';
    document.getElementById('once-date').hidden = el.value !== 'once';
  },
  'reward-new': () => sheetReward(null),
  'reward-edit': (el) => sheetReward(byId('rewards', el.dataset.id)),
  'kid-bonus': (el) => sheetBonus(byId('members', el.dataset.id)),
  'kid-settings': (el) => sheetKidSettings(byId('members', el.dataset.id)),
  'kid-reset': async (el) => {
    const kid = byId('members', el.dataset.id);
    if (!confirm(`Reset ${kid.name}'s pet and ALL stars and activity? This can't be undone.`)) return;
    const photos = S.data.completions.filter((x) => x.member_id === kid.id && x.photo_path).map((x) => x.photo_path);
    await run(async () => {
      await S.api.removeWhere('completions', 'member_id', kid.id);
      await S.api.updateWhere('kid_profiles', 'member_id', kid.id, { pet_kind: null, pet_name: 'Buddy', updated_at: new Date().toISOString() });
    }, `${kid.name} is starting fresh ✨`);
    photos.forEach((p) => S.api.deletePhoto(p, PHOTO_BUCKET).catch(() => {}));
    document.querySelector('button[data-act=sheet-close]')?.click();
    await hooks.loadAll(); hooks.render();
  },
  'routine-edit': (el) => sheetRoutine(byId('members', el.dataset.kid), el.dataset.kind),
  'step-add': (el) => { S.stepEdit.push({ emoji: el.dataset.emoji, title: el.dataset.title }); renderSteps(); },
  'step-add-own': () => {
    const i = document.getElementById('step-new'); const t = i.value.trim();
    if (t) { S.stepEdit.push({ emoji: '⭐', title: t }); i.value = ''; renderSteps(); }
  },
  'step-move': (el) => { const i = +el.dataset.i, j = i + +el.dataset.d; [S.stepEdit[i], S.stepEdit[j]] = [S.stepEdit[j], S.stepEdit[i]]; renderSteps(); },
  'step-del': (el) => { S.stepEdit.splice(+el.dataset.i, 1); renderSteps(); },
  'appr-yes': (el) => review(byId('completions', el.dataset.id), true),
  'appr-no': (el) => review(byId('completions', el.dataset.id), false),
  'appr-photo': (el) => sheetPhoto(byId('completions', el.dataset.id)),
  'ledger-undo': async (el) => {
    const x = byId('completions', el.dataset.id);
    if (!confirm(`Undo "${x.title}" (${x.points > 0 ? '+' : ''}${x.points} ⭐)?`)) return;
    await run(() => S.api.remove('completions', x.id), 'Undone');
    if (x.photo_path) S.api.deletePhoto(x.photo_path, PHOTO_BUCKET).catch(() => {});
  },
  // tapping a chore tile on a parent's phone or the hub
  'kid-chore': async (el) => {
    const kid = byId('members', el.dataset.kid), chore = byId('chores', el.dataset.id);
    const done = choreDone(chore, kid);
    if (done) {
      if (me()?.kind === 'parent' && confirm(`Undo "${chore.title}" for ${kid.name}?`)) await run(() => S.api.remove('completions', done.id), 'Undone');
      return;
    }
    await run(() => completeChore(kid, { ...chore, photo_proof: false })); // a parent marking it done = approved
    hooks.render();
    celebrate();
  },
});
