// Hub mode: the big landscape screen (dashboard + photo-frame screensaver)
import { S, esc, byId, household, daysUntil, dueLabel, actions, hooks, $app, openSheet, run, me } from './core.js';
import { visibleEvents, eventsOnDay, evChip, addDays, evTitle, evColor, timeLabel } from './calendar.js';

// Home screen only shows calendars marked "show on Home" (the Calendar screen shows everything)
const onHome = (ev) => byId('calendars', ev.calendar_id)?.show_on_home !== false;
const homeEvents = () => visibleEvents().filter(onHome);
// one summary line per hidden calendar, e.g. "Robert – 4 work meetings"
function hiddenSummary(day) {
  const hidden = eventsOnDay(day, visibleEvents().filter((e) => !onHome(e)));
  const byCal = new Map();
  hidden.forEach((e) => byCal.set(e.calendar_id, (byCal.get(e.calendar_id) || 0) + 1));
  return [...byCal].map(([cid, n]) => {
    const cal = byId('calendars', cid);
    const owner = byId('members', byId('google_accounts', cal.account_id)?.member_id) || byId('members', cal.member_id);
    const label = cal.is_work ? `${owner?.name || 'Work'} – ${n} work meeting${n === 1 ? '' : 's'}` : `${cal.name} – ${n} event${n === 1 ? '' : 's'}`;
    return `<button class="hidden-sum" style="--c:${esc(cal.color || '#999')}" data-act="hub-cal-day">${cal.is_work ? '🔒' : '📅'} ${esc(label)}<span>›</span></button>`;
  }).join('');
}
import { weatherNowHtml, forecastHtml, wx } from './weather.js';
import { photoUrlList } from './photos.js';

S.hubTab = S.hubTab || 'home';
S.saverMin = +(localStorage.getItem('hb.saverMin') ?? 5);

const clockText = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
const ampm = () => (new Date().getHours() < 12 ? 'AM' : 'PM');
const dateText = () => new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

export function renderHub(views) {
  document.body.classList.add('hub-mode');
  const nav = [
    ['home', '🏠', 'Home'], ['calendar', '📅', 'Calendar'], ['lists', '📝', 'Lists'],
    ['board', '📌', 'Board'], ['countdowns', '⏳', 'Countdowns'], ['family', '⚙️', 'Settings'],
  ];
  const body = S.hubTab === 'home' ? hubHome() : `<div class="hub-page">${(views[S.hubTab] || views.calendar)()}</div>`;
  $app.innerHTML = `
    <div class="hub">
      <nav class="hub-nav">
        <img src="icons/icon-192.png" alt="" class="hub-logo">
        ${nav.map(([k, i, l]) => `<button class="${S.hubTab === k ? 'on' : ''}" data-act="hub-tab" data-tab="${k}"><span>${i}</span>${l}</button>`).join('')}
        <button class="hub-saver-btn" data-act="saver-show" title="Photo frame"><span>🖼️</span>Photos</button>
      </nav>
      <main class="hub-main">${S.api.demo ? '<div class="demo-banner">Demo mode — sample data</div>' : ''}${body}</main>
    </div>`;
}

function hubHome() {
  const today = new Date();
  const list = homeEvents();
  const todayEvs = eventsOnDay(today, list);
  const tomorrow = addDays(today, 1);
  const tomEvs = eventsOnDay(tomorrow, list);
  const now = Date.now();
  const upNext = todayEvs.filter((e) => !e.all_day && new Date(e.end_at).getTime() > now);

  // reminders due today or overdue + undated to-dos assigned to someone
  const reminders = S.data.list_items.filter((i) => !i.done && i.due_at && new Date(i.due_at) < addDays(today, 1))
    .sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 6);
  const shopLists = S.data.lists.filter((l) => l.kind === 'shopping');
  const groceries = S.data.list_items.filter((i) => !i.done && shopLists.some((l) => l.id === i.list_id));
  const notes = [...S.data.messages].sort((a, b) => (b.pinned - a.pinned) || b.created_at.localeCompare(a.created_at)).slice(0, 2);
  const countdowns = S.data.countdowns.map((c) => ({ ...c, days: daysUntil(c.target_date) })).filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days).slice(0, 3);

  return `
  <div class="hub-home">
    <section class="hub-col">
      <div class="hub-clock-box">
        <div class="hub-clock"><span data-clock>${clockText()}</span><small data-ampm>${ampm()}</small></div>
        <div class="hub-date" data-date>${dateText()}</div>
      </div>
      <div class="card hub-wx" data-act="wx-location">${weatherNowHtml()}${forecastHtml(5)}</div>
      ${countdowns.length ? `<div class="card hub-cd">${countdowns.map((c) => `
        <div class="hub-cd-row"><span class="cd-emoji sm">${esc(c.emoji)}</span><span>${esc(c.title)}</span>
          <b>${c.days === 0 ? 'Today!' : `${c.days}<small> ${c.days === 1 ? 'day' : 'days'}</small>`}</b></div>`).join('')}</div>` : ''}
    </section>

    <section class="hub-col card hub-today">
      <div class="row between"><h2>Today</h2>
        <div class="row"><button class="link small" data-act="home-cals">Calendars</button><button class="btn primary small-btn" data-act="ev-new">＋ Event</button></div></div>
      ${upNext[0] ? `<div class="up-next" style="--c:${esc(evColor(upNext[0]))}"><small>Up next · ${esc(timeLabel(upNext[0]))}</small><strong>${esc(evTitle(upNext[0]))}</strong></div>` : ''}
      <div class="stack-sm">${todayEvs.map((ev) => evChip(ev, today)).join('') || '<p class="muted">Nothing on the calendar today.</p>'}${hiddenSummary(today)}</div>
      <h3 class="section">Tomorrow</h3>
      <div class="stack-sm">${tomEvs.map((ev) => evChip(ev, tomorrow)).join('') || '<p class="muted small">Nothing planned.</p>'}${hiddenSummary(tomorrow)}</div>
    </section>

    <section class="hub-col">
      <div class="card">
        <div class="row between"><h3>🔔 Due today</h3><button class="link" data-act="hub-tab" data-tab="lists">All lists ›</button></div>
        <ul class="items mini">${reminders.map((i) => {
          const who = byId('members', i.assigned_to);
          const overdue = new Date(i.due_at) < new Date();
          return `<li class="item"><button class="check" data-act="item-toggle" data-id="${i.id}"></button>
            <span class="item-main"><span class="item-text">${esc(i.text)}</span><span class="meta"><span class="due ${overdue ? 'overdue' : ''}">⏰ ${esc(dueLabel(i.due_at))}</span></span></span>
            ${who ? `<span class="avatar" style="--c:${esc(who.color)}">${esc(who.emoji)}</span>` : ''}</li>`;
        }).join('') || '<li class="muted small">All caught up ✨</li>'}</ul>
      </div>
      <div class="card">
        <div class="row between"><h3>🛒 Groceries <small class="muted">(${groceries.length})</small></h3>
          <button class="link" data-act="hub-groceries">Open ›</button></div>
        <div class="hub-groc">${groceries.slice(0, 10).map((i) => `<span class="pill">${esc(i.text)}</span>`).join('') || '<span class="muted small">List is empty</span>'}
          ${groceries.length > 10 ? `<span class="pill more">+${groceries.length - 10}</span>` : ''}</div>
      </div>
      ${notes.map((m) => {
        const a = byId('members', m.author_id);
        return `<article class="note hub-note" style="--note:${esc(m.color)}" data-act="hub-tab" data-tab="board">
          ${m.pinned ? '<span class="pin">📌</span>' : ''}<p>${esc(m.body)}</p>
          <footer><span>${esc(a?.emoji || '')} ${esc(a?.name || '')}</span></footer></article>`;
      }).join('')}
    </section>
  </div>`;
}

// keep the clock ticking without redrawing everything
setInterval(() => {
  document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = clockText(); });
  document.querySelectorAll('[data-ampm]').forEach((el) => { el.textContent = ampm(); });
  document.querySelectorAll('[data-date]').forEach((el) => { el.textContent = dateText(); });
}, 10_000);
// redraw the dashboard every few minutes so "up next" and due items stay current
setInterval(() => { if (S.mode === 'hub' && S.hubTab === 'home' && !document.getElementById('saver') && !document.querySelector('#sheet-root.open')) hooks.render(); }, 3 * 60e3);

// ------------------------------------------------------------------ screensaver / photo frame
let idleTimer, slideTimer, slideIdx = 0;
function resetIdle() {
  clearTimeout(idleTimer);
  if (S.mode !== 'hub' || !S.saverMin) return;
  idleTimer = setTimeout(showSaver, S.saverMin * 60e3);
}
['pointerdown', 'keydown', 'touchstart'].forEach((t) => document.addEventListener(t, () => { if (!document.getElementById('saver')) resetIdle(); }, { passive: true }));

function saverOverlay() {
  const w = S.weather;
  const next = homeEvents().filter((e) => !e.all_day && new Date(e.end_at) > new Date())
    .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  return `
    <div class="saver-info">
      <div class="hub-clock"><span data-clock>${clockText()}</span><small data-ampm>${ampm()}</small></div>
      <div class="hub-date" data-date>${dateText()}</div>
      ${w ? `<div class="saver-wx">${wx(w.current.code, w.current.isDay)[0]} ${w.current.temp}° · ${esc(household()?.weather_place?.split(',')[0] || '')}</div>` : ''}
      ${next ? `<div class="saver-next"><small>Next</small> ${esc(evTitle(next))} · ${new Date(next.start_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>` : ''}
    </div>`;
}

export function showSaver() {
  if (document.getElementById('saver')) return;
  const urls = shuffle(photoUrlList());
  const el = document.createElement('div');
  el.id = 'saver';
  el.innerHTML = `<div class="saver-img a"></div><div class="saver-img b"></div>${saverOverlay()}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const layers = [el.querySelector('.a'), el.querySelector('.b')];
  const next = () => {
    if (!urls.length) { el.classList.add('no-photos'); return; }
    const url = urls[slideIdx++ % urls.length];
    const front = layers[slideIdx % 2], back = layers[(slideIdx + 1) % 2];
    const img = new Image();
    img.onload = () => {
      front.style.backgroundImage = `url("${url}")`;
      front.classList.add('show'); back.classList.remove('show');
    };
    img.src = url;
    const info = el.querySelector('.saver-info');
    if (info && slideIdx % 4 === 0) info.outerHTML = saverOverlay(); // refresh next-event text now and then
  };
  next();
  slideTimer = setInterval(next, 15_000);
  el.addEventListener('pointerdown', hideSaver, { once: true });
}
function hideSaver() {
  const el = document.getElementById('saver');
  if (!el) return;
  clearInterval(slideTimer);
  el.classList.remove('on');
  setTimeout(() => el.remove(), 400);
  resetIdle();
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function startHubTimers() { resetIdle(); }

export function sheetHomeCalendars() {
  const cals = S.data.calendars.filter((c) => c.show).sort((a, b) => a.name.localeCompare(b.name));
  const canEdit = me()?.kind === 'parent';
  openSheet(`
    <h2>Calendars on the Home screen</h2>
    <p class="muted small">Unchecked calendars still show on the Calendar screen. On Home they're shortened to one line, like “Robert – 4 work meetings”.</p>
    <div class="stack-sm">${cals.map((c) => {
      const who = byId('members', c.member_id);
      return `<label class="check-row home-cal"><input type="checkbox" name="home_${c.id}" ${c.show_on_home !== false ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>
        <span class="cal-swatch" style="--c:${esc(c.color || '#ccc')}"></span>
        <span class="cal-name">${esc(c.name)}<small>${esc(who?.name || 'Family')}${c.is_work ? ' · 🔒 work' : ''}</small></span></label>`;
    }).join('') || '<p class="muted">No calendars are turned on yet.</p>'}</div>
    <div class="row between"><span></span>
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button>${canEdit ? '<button class="btn primary" type="submit" value="save">Save</button>' : ''}</div></div>`,
  async (f) => {
    for (const c of cals) {
      const want = !!f.get(`home_${c.id}`);
      if (want !== (c.show_on_home !== false)) await run(() => S.api.rpc('set_calendar_home', { p_calendar_id: c.id, p_show: want }));
    }
    await hooks.loadAll(); hooks.render();
  });
}

Object.assign(actions, {
  'hub-tab': (el) => { S.hubTab = el.dataset.tab; if (S.hubTab === 'lists') S.listView = 'list'; hooks.render(); },
  'hub-groceries': () => {
    const groc = S.data.lists.find((l) => l.kind === 'shopping');
    if (groc) S.listId = groc.id;
    S.hubTab = 'lists'; hooks.render();
  },
  'hub-cal-day': () => { S.hubTab = 'calendar'; S.cal.view = 'agenda'; S.cal.anchor = new Date(); hooks.render(); },
  'home-cals': () => sheetHomeCalendars(),
  'saver-show': (_el, e) => { e?.stopPropagation(); setTimeout(showSaver, 50); },
});
