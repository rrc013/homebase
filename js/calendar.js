// Calendar: schedule / week / month views, event editing, Google account settings
import {
  S, esc, byId, me, household, sortedMembers, toast, run, avatar, openSheet, pickerRow,
  actions, hooks, MEMBER_COLORS,
} from './core.js';

export const isHub = () => S.mode === 'hub';
const wide = () => window.matchMedia('(min-width: 900px)').matches;
S.cal = {
  view: localStorage.getItem('hb.calView') || (wide() ? 'week' : 'agenda'),
  anchor: new Date(),
  hidden: new Set(JSON.parse(localStorage.getItem('hb.calHidden') || '[]')),
  agendaDays: 30,
};

// ------------------------------------------------------------------ date helpers
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const sameDay = (a, b) => ymd(a) === ymd(b);
const weekStart = (d) => addDays(dayStart(d), -d.getDay()); // Sunday
const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase();
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ------------------------------------------------------------------ event helpers
const calOf = (ev) => byId('calendars', ev.calendar_id);
const accountOf = (cal) => cal && byId('google_accounts', cal.account_id);
export const ownerOf = (ev) => byId('members', calOf(ev)?.member_id);
export const evColor = (ev) => calOf(ev)?.color || ownerOf(ev)?.color || '#2F6F6A';
const privateOf = (ev) => S.data.event_private.find((p) => p.event_id === ev.id);
// Work events: owner sees real details on their phone; everyone else (and every hub) sees "Name – Work Meeting"
export function evTitle(ev) {
  if (!ev.private) return ev.title;
  const p = !isHub() && privateOf(ev);
  if (p) return p.title;
  const owner = byId('members', accountOf(calOf(ev))?.member_id) || ownerOf(ev);
  return `${owner?.name || 'Work'} – Work Meeting`;
}
const memberKey = (ev) => calOf(ev)?.member_id || 'family';

function eventRange(ev) {
  if (ev.all_day) return [parseYmd(ev.start_date), addDays(parseYmd(ev.end_date), -1)];
  const s = new Date(ev.start_at), e = new Date(new Date(ev.end_at).getTime() - 1);
  return [dayStart(s), dayStart(e < s ? s : e)];
}
export function visibleEvents() {
  return S.data.events.filter((ev) => {
    const cal = calOf(ev);
    return cal && cal.show && !S.cal.hidden.has(memberKey(ev));
  });
}
export function eventsOnDay(date, list = visibleEvents()) {
  const d = dayStart(date);
  return list.filter((ev) => { const [a, b] = eventRange(ev); return a <= d && d <= b; })
    .sort((x, y) => (y.all_day - x.all_day) || x.start_at.localeCompare(y.start_at));
}
export function timeLabel(ev, day) {
  if (ev.all_day) return 'All day';
  const s = new Date(ev.start_at), e = new Date(ev.end_at);
  if (day && !sameDay(s, day)) return sameDay(e, day) ? `until ${fmtTime(e)}` : 'All day';
  return `${fmtTime(s)}–${fmtTime(e)}`;
}

const shortTime = (ev, day) => {
  const s = new Date(ev.start_at);
  return day && !sameDay(s, day) ? timeLabel(ev, day) : fmtTime(s);
};
export const evChip = (ev, day, opts = {}) => {
  const owner = ownerOf(ev);
  return `<button class="ev ${ev.all_day ? 'allday' : ''} ${opts.compact ? 'compact' : ''}" style="--c:${esc(evColor(ev))}" data-act="ev-open" data-id="${ev.id}">
    ${ev.all_day ? '' : `<span class="ev-time">${esc(opts.compact || opts.short ? shortTime(ev, day) : timeLabel(ev, day))}</span>`}
    <span class="ev-title">${esc(evTitle(ev))}</span>
    ${opts.compact || !owner ? '' : `<span class="ev-who">${esc(owner.emoji)}</span>`}
  </button>`;
};

// ------------------------------------------------------------------ main view
export function viewCalendar() {
  const c = S.cal;
  if (!S.data.calendars.length) return viewNoCalendars();
  const a = c.anchor;
  let label, body;
  if (c.view === 'month') {
    label = a.toLocaleDateString([], { month: 'long', year: 'numeric' });
    body = monthGrid();
  } else if (c.view === 'week') {
    const ws = weekStart(a), we = addDays(ws, 6);
    label = `${ws.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString([], { month: ws.getMonth() === we.getMonth() ? undefined : 'short', day: 'numeric' })}`;
    body = weekGrid();
  } else {
    label = sameDay(a, new Date()) ? 'Coming up' : `From ${a.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    body = agenda();
  }
  // people who have calendars showing, plus "Family"
  const keys = new Set(S.data.calendars.filter((x) => x.show).map((x) => x.member_id || 'family'));
  const people = [...sortedMembers().filter((m) => keys.has(m.id)), ...(keys.has('family') ? [{ id: 'family', name: 'Family', emoji: '🏡', color: '#2F6F6A' }] : [])];
  return `
    <div class="cal-toolbar">
      <div class="row">
        <button class="icon-btn nav" data-act="cal-move" data-d="-1" aria-label="Previous">‹</button>
        <button class="btn small-btn" data-act="cal-today">Today</button>
        <button class="icon-btn nav" data-act="cal-move" data-d="1" aria-label="Next">›</button>
        <h2 class="cal-label">${esc(label)}</h2>
      </div>
      <div class="row">
        <div class="seg small">${[['agenda', 'Schedule'], ['week', 'Week'], ['month', 'Month']]
          .map(([k, t]) => `<button data-act="cal-view" data-view="${k}" class="${c.view === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <button class="btn primary small-btn" data-act="ev-new">＋ Event</button>
      </div>
    </div>
    ${people.length > 1 ? `<div class="people-filter">${people.map((p) => `
      <button class="pfilter ${c.hidden.has(p.id) ? 'off' : ''}" style="--c:${esc(p.color)}" data-act="cal-filter" data-id="${p.id}">${esc(p.emoji)} ${esc(p.name)}</button>`).join('')}</div>` : ''}
    ${body}`;
}

function viewNoCalendars() {
  return `
    <div class="empty card">
      <div style="font-size:3rem">📅</div>
      <h2>Connect your calendars</h2>
      <p class="muted">Link your Google accounts to see everyone's events here and add new ones from any screen.</p>
      ${me()?.kind === 'parent' ? '<button class="btn primary" data-act="gcal-connect">Connect a Google account</button>' : ''}
      <small class="muted">You can also do this later from the Family tab.</small>
    </div>`;
}

function agenda() {
  const start = dayStart(S.cal.anchor);
  const list = visibleEvents();
  let html = '';
  for (let i = 0; i < S.cal.agendaDays; i++) {
    const d = addDays(start, i);
    const evs = eventsOnDay(d, list);
    const today = sameDay(d, new Date());
    if (!evs.length && !today) continue;
    const name = today ? 'Today' : sameDay(d, addDays(new Date(), 1)) ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'long' });
    html += `
      <section class="agenda-day ${today ? 'today' : ''}">
        <button class="agenda-date" data-act="day-open" data-date="${ymd(d)}"><b>${d.getDate()}</b><span>${name}<small>${d.toLocaleDateString([], { month: 'short' })}</small></span></button>
        <div class="agenda-events">${evs.map((ev) => evChip(ev, d)).join('') || '<p class="muted small">Nothing planned</p>'}</div>
      </section>`;
  }
  return `<div class="agenda">${html}</div>
    <button class="btn ghost" data-act="cal-more">Show more</button>`;
}

function weekGrid() {
  const ws = weekStart(S.cal.anchor);
  const list = visibleEvents();
  return `<div class="week">${[0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = addDays(ws, i);
    const evs = eventsOnDay(d, list);
    return `<div class="week-day ${sameDay(d, new Date()) ? 'today' : ''}">
      <button class="week-head" data-act="day-open" data-date="${ymd(d)}"><span>${DOW[i]}</span><b>${d.getDate()}</b></button>
      <div class="week-events">${evs.map((ev) => evChip(ev, d, { short: wide() })).join('')}</div>
    </div>`;
  }).join('')}</div>`;
}

function monthGrid() {
  const a = S.cal.anchor;
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const start = weekStart(first);
  const list = visibleEvents();
  const max = isHub() ? 4 : 3;
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i === 35 && d.getMonth() !== a.getMonth()) break; // skip a 6th row that is all next month
    const evs = eventsOnDay(d, list);
    cells += `<button class="m-cell ${d.getMonth() !== a.getMonth() ? 'other' : ''} ${sameDay(d, new Date()) ? 'today' : ''}" data-act="day-open" data-date="${ymd(d)}">
      <span class="m-num">${d.getDate()}</span>
      ${evs.slice(0, max).map((ev) => `<span class="m-ev ${ev.all_day ? 'allday' : ''}" style="--c:${esc(evColor(ev))}">${esc(evTitle(ev))}</span>`).join('')}
      ${evs.length > max ? `<span class="m-more">+${evs.length - max} more</span>` : ''}
      <span class="m-dots">${evs.slice(0, 5).map((ev) => `<i style="--c:${esc(evColor(ev))}"></i>`).join('')}</span>
    </button>`;
  }
  return `<div class="month"><div class="m-head">${DOW.map((x) => `<span>${x}</span>`).join('')}</div><div class="m-grid">${cells}</div></div>`;
}

// ------------------------------------------------------------------ sheets
function sheetDay(dateStr) {
  const d = parseYmd(dateStr);
  const evs = eventsOnDay(d);
  openSheet(`
    <h2>${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
    <div class="stack-sm">${evs.map((ev) => evChip(ev, d)).join('') || '<p class="muted">Nothing planned.</p>'}</div>
    <div class="row between">
      <button class="btn ghost" type="button" data-act="sheet-close">Close</button>
      <button class="btn primary" type="button" data-act="ev-new" data-date="${dateStr}">＋ Add event</button>
    </div>`);
}

const writableCalendars = () => S.data.calendars.filter((c) => {
  if (!c.show || !c.can_write) return false;
  return !c.is_work || accountOf(c)?.member_id === me()?.id;
});
function defaultCalendarId() {
  const list = writableCalendars();
  const saved = localStorage.getItem('hb.defaultCal');
  if (list.some((c) => c.id === saved)) return saved;
  const mine = list.filter((c) => accountOf(c)?.member_id === me()?.id && !c.is_work);
  return (mine[0] || list.find((c) => !c.is_work) || list[0])?.id;
}
const calLabel = (c) => {
  const who = byId('members', c.member_id);
  const owner = who ? who.name : 'Family';
  return `${owner === c.name ? c.name : `${owner} · ${c.name}`}${c.is_work ? ' (work)' : ''}`;
};

function sheetEvent(ev, dateStr) {
  const isNew = !ev;
  const cal = ev && calOf(ev);
  const priv = ev && privateOf(ev);
  const canEdit = isNew || (cal?.can_write && (!cal.is_work || accountOf(cal)?.member_id === me()?.id) && !isHub()) || (isHub() && cal?.can_write && !cal.is_work);
  const writable = writableCalendars();
  if (isNew && !writable.length) {
    toast(S.data.calendars.length ? 'No calendar you can add to is turned on' : 'Connect a Google calendar first (Family tab)');
    return;
  }

  if (!canEdit) {
    openSheet(`
      <div class="ev-view" style="--c:${esc(evColor(ev))}">
        <h2>${esc(evTitle(ev))}</h2>
        <p>🕒 ${esc(ev.all_day ? eventRange(ev).map((d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })).filter((v, i, arr) => arr.indexOf(v) === i).join(' – ') : `${new Date(ev.start_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeLabel(ev)}`)}</p>
        ${!ev.private && ev.location ? `<p>📍 ${esc(ev.location)}</p>` : ''}
        ${!ev.private && ev.notes ? `<p class="muted">${esc(ev.notes)}</p>` : ''}
        <p class="muted small">${esc(calLabel(cal))}${cal.can_write ? '' : ' · read-only'}</p>
      </div>
      <button class="btn ghost" type="button" data-act="sheet-close">Close</button>`);
    return;
  }

  // defaults for a new event: next whole hour (or 9am on a chosen day)
  let s, e;
  if (ev) { s = new Date(ev.start_at); e = new Date(ev.end_at); } else {
    s = dateStr ? parseYmd(dateStr) : new Date();
    if (dateStr) s.setHours(9, 0, 0, 0); else { s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1); }
    e = new Date(s.getTime() + 3600e3);
  }
  const allDay = ev?.all_day || false;
  const startDate = allDay ? ev.start_date : ymd(s);
  const endDate = allDay ? ymd(addDays(parseYmd(ev.end_date), -1)) : ymd(e);
  const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const title = priv ? priv.title : ev?.title || '';
  const location = priv ? priv.location : ev?.location || '';
  const notes = priv ? priv.notes : ev?.notes || '';
  const selCal = ev ? ev.calendar_id : defaultCalendarId();

  openSheet(`
    <h2>${isNew ? 'New event' : 'Edit event'}</h2>
    <label>Title<input name="title" value="${esc(title)}" placeholder="Soccer practice, Date night…" required ${isNew ? 'data-focus' : ''}></label>
    <label class="check-row"><input type="checkbox" name="all_day" ${allDay ? 'checked' : ''} data-act="ev-allday"> All day</label>
    <div class="dt-grid ${allDay ? 'is-allday' : ''}" id="dt-grid">
      <label>Starts<input type="date" name="start_date" value="${startDate}" required></label>
      <label class="t">Time<input type="time" name="start_time" value="${hm(s)}"></label>
      <label>Ends<input type="date" name="end_date" value="${endDate}" required></label>
      <label class="t">Time<input type="time" name="end_time" value="${hm(e)}"></label>
    </div>
    <label>Calendar
      <select name="calendar_id" ${isNew ? '' : 'disabled'}>${(isNew ? writable : [cal]).map((c) =>
        `<option value="${c.id}" ${c.id === selCal ? 'selected' : ''}>${esc(calLabel(c))}</option>`).join('')}</select></label>
    ${isNew ? `<label>Repeats
      <select name="repeat"><option value="none">Doesn't repeat</option><option value="DAILY">Every day</option>
        <option value="WEEKLY">Every week</option><option value="MONTHLY">Every month</option><option value="YEARLY">Every year</option></select></label>`
      : ev.recurring_id ? '<p class="muted small">🔁 Repeating event — changes apply to this one only.</p>' : ''}
    <label>Location<input name="location" value="${esc(location || '')}" placeholder="Optional"></label>
    <label>Notes<textarea name="notes" rows="2" placeholder="Optional">${esc(notes || '')}</textarea></label>
    <div class="row between wrap">
      ${isNew ? '<span></span>' : ev.recurring_id
        ? '<div class="row"><button class="btn danger ghost" type="submit" value="delete-one" formnovalidate>Delete this one</button><button class="btn danger ghost" type="submit" value="delete-all" formnovalidate>Delete all</button></div>'
        : '<button class="btn danger ghost" type="submit" value="delete-one" formnovalidate>Delete</button>'}
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div>
    </div>`, async (f, action) => {
    if (action?.startsWith('delete')) {
      if (!confirm(action === 'delete-all' ? 'Delete every repeat of this event?' : 'Delete this event?')) return false;
      const ok = await run(() => S.api.fn('google', { action: 'delete_event', event_id: ev.id, all_repeats: action === 'delete-all' }), 'Deleted');
      if (ok) { await hooks.loadAll(); hooks.render(); }
      return;
    }
    const calendarId = f.get('calendar_id') || ev.calendar_id;
    const payload = {
      action: 'save_event', calendar_id: calendarId, event_id: ev?.id,
      title: f.get('title').trim(), location: f.get('location').trim(), notes: f.get('notes').trim(),
      all_day: !!f.get('all_day'), repeat: f.get('repeat') || 'none',
      time_zone: household()?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const sd = f.get('start_date'), ed = f.get('end_date') || sd;
    if (payload.all_day) {
      payload.start_date = sd;
      payload.end_date = ymd(addDays(parseYmd(ed < sd ? sd : ed), 1)); // Google wants the day after
    } else {
      const start = new Date(`${sd}T${f.get('start_time') || '09:00'}`);
      let end = new Date(`${ed}T${f.get('end_time') || '10:00'}`);
      if (end <= start) end = new Date(start.getTime() + 3600e3);
      payload.start = start.toISOString(); payload.end = end.toISOString();
    }
    if (isNew) localStorage.setItem('hb.defaultCal', calendarId);
    const btn = $sheetBtn(); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const ok = await run(() => S.api.fn('google', payload), 'Saved to Google Calendar');
    if (!ok) { if (btn) { btn.disabled = false; btn.textContent = 'Save'; } return false; }
    await hooks.loadAll(); hooks.render();
  });
}
const $sheetBtn = () => document.querySelector('#sheet-form button[value=save]');

// ------------------------------------------------------------------ settings (Family tab)
export function calendarSettingsHtml() {
  const accounts = [...S.data.google_accounts].sort((a, b) => a.google_email.localeCompare(b.google_email));
  const isParent = me()?.kind === 'parent';
  const accHtml = accounts.map((a) => {
    const owner = byId('members', a.member_id);
    const mine = a.member_id === me()?.id;
    const cals = S.data.calendars.filter((c) => c.account_id === a.id).sort((x, y) => (y.show - x.show) || x.name.localeCompare(y.name));
    return `
      <div class="acct">
        <div class="acct-head">
          ${avatar(owner)}<span><strong>${esc(a.google_email)}</strong>
          <small class="${a.status === 'ok' ? 'muted' : 'warn'}">${a.status === 'ok' ? `Synced ${a.last_sync ? new Date(a.last_sync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}` : '⚠️ Needs reconnecting'}</small></span>
          ${mine ? `${a.status !== 'ok' ? '<button class="btn small-btn" data-act="gcal-connect">Reconnect</button>' : ''}<button class="link danger" data-act="gcal-disconnect" data-id="${a.id}">Disconnect</button>` : ''}
        </div>
        ${cals.map((c) => `
          <div class="cal-row">
            ${mine ? `<input type="checkbox" ${c.show ? 'checked' : ''} data-act="cal-show" data-id="${c.id}" aria-label="Show ${esc(c.name)}">` : `<span class="cal-dot-ph">${c.show ? '✓' : ''}</span>`}
            <span class="cal-swatch" style="--c:${esc(c.color || '#ccc')}"></span>
            <span class="cal-name">${esc(c.name)}<small>${esc(byId('members', c.member_id)?.name || 'Family')}${c.is_work ? ' · 🔒 work (details private)' : ''}${c.can_write ? '' : ' · read-only'}${c.show && c.show_on_home === false ? ' · not on hub Home' : ''}</small></span>
            ${mine ? `<button class="icon-btn" data-act="cal-edit" data-id="${c.id}" aria-label="Calendar settings">⚙️</button>` : ''}
          </div>`).join('')}
      </div>`;
  }).join('');
  return `
    <div class="row between"><h3 class="section">Google Calendars</h3>
      ${isParent ? '<button class="link" data-act="gcal-connect">＋ Connect account</button>' : ''}</div>
    <div class="card stack-sm">
      ${accHtml || '<p class="muted small">No calendars connected yet. Each parent connects their own Google account(s) — business and personal.</p>'}
      ${accounts.length ? `<div class="row between wrap"><button class="btn ghost small-btn" data-act="gcal-sync">🔄 Sync now</button>
        <button class="btn ghost small-btn" data-act="home-cals">🏠 Choose calendars for the hub Home screen</button></div>` : ''}
    </div>`;
}

function sheetCalendar(c) {
  const people = sortedMembers();
  openSheet(`
    <h2>${esc(c.name)}</h2>
    <label>Whose calendar is this?
      <select name="member_id"><option value="">Family (shared)</option>${people.map((m) =>
        `<option value="${m.id}" ${m.id === c.member_id ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}</select></label>
    <label>Color<span></span></label>${pickerRow('color', [...new Set([c.color, ...MEMBER_COLORS, '#2F6F6A', '#039BE5', '#F4511E'].filter(Boolean))], c.color || MEMBER_COLORS[0], 'color')}
    <label class="check-row"><input type="checkbox" name="is_work" ${c.is_work ? 'checked' : ''}> 🔒 Work calendar — hub, tablets and others see “Work Meeting” instead of details</label>
    <div class="row between"><span></span>
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Save</button></div></div>`,
  async (f) => {
    const workChanged = !!f.get('is_work') !== c.is_work;
    await run(() => S.api.update('calendars', c.id, { member_id: f.get('member_id') || null, color: f.get('color'), is_work: !!f.get('is_work') }));
    if (workChanged) await syncNow(true);
    else { await hooks.loadAll(); hooks.render(); }
  });
}

// ------------------------------------------------------------------ syncing & connecting
let syncing = false;
export async function syncNow(force = false) {
  if (syncing || !S.data.google_accounts.length) return;
  syncing = true;
  try {
    const r = await S.api.fn('google', { action: 'sync', force });
    if (!r?.skipped) { await hooks.loadAll(); hooks.render(); }
    if (force && r?.errors?.length) toast(r.errors[0]);
    else if (force) toast('Calendars synced');
  } catch (e) { if (force) toast(e.message); } finally { syncing = false; }
}
setInterval(() => { if (!document.hidden && S.user) syncNow(); }, 5 * 60 * 1000);

export async function handleOAuthReturn() {
  const p = new URLSearchParams(location.search);
  if (!p.has('state') || !(p.has('code') || p.has('error'))) return;
  const clean = location.pathname + (p.has('demo') ? '?demo' : '');
  history.replaceState(null, '', clean);
  if (p.get('error')) { toast('Google connection was cancelled'); return; }
  toast('Connecting your Google calendar…', 8000);
  const r = await run(() => S.api.fn('google', {
    action: 'connect', code: p.get('code'), state: p.get('state'), redirect_uri: location.origin + location.pathname,
  }));
  if (r?.ok) { toast(`Connected ${r.email} ✓`); S.tab = 'family'; await hooks.loadAll(); hooks.render(); }
}

// ------------------------------------------------------------------ actions
Object.assign(actions, {
  'cal-view': (el) => { S.cal.view = el.dataset.view; localStorage.setItem('hb.calView', S.cal.view); hooks.render(); },
  'cal-today': () => { S.cal.anchor = new Date(); S.cal.agendaDays = 30; hooks.render(); },
  'cal-move': (el) => {
    const d = +el.dataset.d, a = S.cal.anchor;
    S.cal.anchor = S.cal.view === 'month' ? new Date(a.getFullYear(), a.getMonth() + d, 1)
      : addDays(a, d * (S.cal.view === 'week' ? 7 : 30));
    hooks.render();
  },
  'cal-more': () => { S.cal.agendaDays += 30; hooks.render(); },
  'cal-filter': (el) => {
    const id = el.dataset.id;
    S.cal.hidden.has(id) ? S.cal.hidden.delete(id) : S.cal.hidden.add(id);
    localStorage.setItem('hb.calHidden', JSON.stringify([...S.cal.hidden]));
    hooks.render();
  },
  'day-open': (el) => sheetDay(el.dataset.date),
  'ev-open': (el) => sheetEvent(byId('events', el.dataset.id)),
  'ev-new': (el) => sheetEvent(null, el.dataset.date),
  'ev-allday': (el) => document.getElementById('dt-grid')?.classList.toggle('is-allday', el.checked),
  'gcal-connect': async () => {
    const r = await run(() => S.api.fn('google', { action: 'auth_url', redirect_uri: location.origin + location.pathname }));
    if (r?.url) location.href = r.url;
  },
  'gcal-disconnect': async (el) => {
    const a = byId('google_accounts', el.dataset.id);
    if (!confirm(`Disconnect ${a.google_email}? Its events will disappear from Homebase (nothing is deleted in Google).`)) return;
    if (await run(() => S.api.fn('google', { action: 'disconnect', account_id: a.id }), 'Disconnected')) { await hooks.loadAll(); hooks.render(); }
  },
  'gcal-sync': () => syncNow(true),
  'cal-show': async (el) => {
    await run(() => S.api.update('calendars', el.dataset.id, { show: el.checked }));
    await syncNow(true);
  },
  'cal-edit': (el) => sheetCalendar(byId('calendars', el.dataset.id)),
});
