// Buddy mode: the kid's own screen (pet, picture jobs, prizes, morning/bedtime routines, sleep clock)
import { S, esc, byId, household, actions, hooks, $app, resizeImage, run, openSheet, toast } from './core.js';
import {
  kids, profileOf, choresFor, choreDone, routineOf, routineDone, balance, earned, todayProgress,
  completeChore, completeRoutine, requestReward, pendingRedeem, todayStr,
} from './kids.js';
import { petHtml, petOf, PETS, levelInfo, mood } from './pets.js';
import { say, celebrate, tap, keepAwake } from './fun.js';

S.buddy = { kidId: localStorage.getItem('hb.buddyKid'), screen: null, kind: null, preview: null, confirm: null, pickPet: null };
const kid = () => byId('members', S.buddy.kidId) || kids()[0];
const mins = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const clock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const spokenKey = (what) => `hb.spoken.${what}.${todayStr()}`;
const sayOnce = (what, text, opts) => { if (localStorage.getItem(spokenKey(what))) return; localStorage.setItem(spokenKey(what), '1'); say(text, opts); };

// what time of day is it for this kid?
export function phase(k = kid()) {
  if (S.buddy.preview) return S.buddy.preview;
  const p = profileOf(k), m = nowMins();
  const wake = mins(p.wake_time), sleep = mins(p.sleep_time), bed = mins(p.bedtime_start);
  const asleep = sleep > wake ? (m >= sleep || m < wake) : (m >= sleep && m < wake);
  if (asleep) return 'sleep';
  if (m >= bed && routineDone(k, 'bedtime')) return 'sleep';
  if (m >= wake && m < wake + 30 && !routineDone(k, 'morning') && !localStorage.getItem(spokenKey('sunTapped'))) return 'wake';
  if (m >= bed) return 'bedtime';
  return 'day';
}
const voiceOn = () => profileOf(kid()).voice !== false;
const talk = (text, opts = {}) => say(text, { ...opts, enabled: voiceOn() });

// ------------------------------------------------------------------ render
export function renderBuddy() {
  const k = kid();
  document.body.classList.add('buddy-mode');
  keepAwake(true);
  if (!k) { $app.innerHTML = '<div class="buddy"><p class="center">Add a kid on the Family tab first.</p></div>'; return; }
  const ph = phase(k);
  document.body.classList.toggle('buddy-night', ph === 'bedtime' || ph === 'sleep' || (S.buddy.screen === 'routine' && S.buddy.kind === 'bedtime'));
  let body;
  if (!profileOf(k).pet_kind && S.buddy.hadPet) {
    // a grown-up just reset this kid: forget today's routine progress + greetings
    ['morning', 'bedtime'].forEach((kind) => localStorage.removeItem(routineKey(k, kind)));
    ['pickpet', 'sunTapped', 'wake', 'bedtime'].forEach((w) => localStorage.removeItem(spokenKey(w)));
    S.buddy.screen = null; S.buddy.confirm = null;
  }
  S.buddy.hadPet = !!profileOf(k).pet_kind;
  if (!profileOf(k).pet_kind) body = petPicker(k);
  else if (S.buddy.screen === 'routine') body = routineScreen(k);
  else if (S.buddy.screen === 'prizes') body = prizeScreen(k);
  else if (ph === 'sleep') body = sleepScreen(k);
  else if (ph === 'wake') body = wakeScreen(k);
  else if (ph === 'bedtime') body = bedtimeScreen(k);
  else body = dayScreen(k);
  $app.innerHTML = `<div class="buddy phase-${ph}">
    <button class="buddy-secret" aria-label="Grown-ups" data-hold="parent"></button>
    ${S.api.demo ? '<div class="demo-banner">Demo mode — hold the top-left corner for 2 seconds for the grown-up menu (PIN 1234)</div>' : ''}
    ${body}${S.buddy.confirm ? confirmOverlay(k) : ''}</div>`;
}

function topBar(k, { stars = true } = {}) {
  const avail = balance(k) + pendingRedeem(k).reduce((s, x) => s + x.points, 0);
  return `<div class="b-top">
    <div class="b-clock" data-bclock>${clock()}</div>
    ${stars ? `<button class="b-stars" data-act="b-prizes">⭐ <b>${avail}</b></button>` : ''}
  </div>`;
}

function petPicker(k) {
  setTimeout(() => sayOnce('pickpet', `Hi ${k.name}! Pick your very own pet!`, { enabled: voiceOn() }), 400);
  const sel = S.buddy.pickPet;
  return `
    <div class="b-center">
      <h1 class="b-title">Pick your pet!</h1>
      <div class="pet-pick">${PETS.map((p) => `
        <button class="pp ${sel === p.kind ? 'on' : ''}" data-act="b-pickpet" data-kind="${p.kind}"><span>${p.emoji}</span><small>${p.label}</small></button>`).join('')}</div>
      ${sel ? `<button class="b-big-btn" data-act="b-pet-ok">✓ This one!</button>` : ''}
    </div>`;
}

function dayScreen(k) {
  const prof = profileOf(k);
  const prog = todayProgress(k);
  const earn = earned(k);
  const { level, progress } = levelInfo(earn);
  const m = nowMins();
  const morning = routineOf(k, 'morning');
  const showMorning = morning?.steps?.length && !routineDone(k, 'morning') && m >= mins(prof.morning_start) && m < mins(prof.morning_start) + 180;
  const chores = choresFor(k);
  const md = mood(prog.ratio, false);
  return `
    ${topBar(k)}
    ${showMorning ? `<button class="b-routine-banner" data-act="b-routine" data-kind="morning"><span>☀️</span>Morning routine<b>Let's go!</b></button>` : ''}
    <div class="b-pet-zone">
      <button class="b-pet" data-act="b-pet-tap">${petHtml(prof, earn, prog.ratio)}</button>
      <div class="b-bubble">${esc(md.line)}</div>
      <div class="b-level"><span>${esc(prof.pet_name)} · Level ${level}</span><div class="lvl-bar"><i style="width:${Math.round(progress * 100)}%"></i></div></div>
    </div>
    <h2 class="b-h2">My jobs <small>${prog.done}/${prog.total}</small></h2>
    <div class="b-jobs">${chores.map((c) => {
      const d = choreDone(c, k);
      return `<button class="b-job ${d ? (d.status === 'pending' ? 'pending' : 'done') : ''}" data-act="b-job" data-id="${c.id}">
        <span class="bj-emoji">${esc(c.emoji)}</span><span class="bj-title">${esc(c.title)}</span>
        <span class="bj-stars">${d ? (d.status === 'pending' ? '⏳' : '✅') : '⭐'.repeat(Math.min(c.points, 5))}</span></button>`;
    }).join('') || '<p class="b-none">No jobs today — enjoy playing! 🎈</p>'}</div>`;
}

function prizeScreen(k) {
  const avail = balance(k) + pendingRedeem(k).reduce((s, x) => s + x.points, 0);
  const rewards = S.data.rewards.filter((r) => r.active && (!r.member_id || r.member_id === k.id)).sort((a, b) => a.cost - b.cost);
  const pend = pendingRedeem(k);
  return `
    ${topBar(k)}
    <div class="b-row"><button class="b-back" data-act="b-home">‹</button><h1 class="b-title">My prizes</h1></div>
    ${pend.length ? `<div class="b-waiting">⏳ Asked for: ${pend.map((x) => `${esc(x.emoji)} ${esc(x.title)}`).join(', ')}</div>` : ''}
    <div class="b-prizes">${rewards.map((r) => {
      const can = avail >= r.cost;
      return `<button class="b-prize ${can ? 'can' : ''}" data-act="b-prize" data-id="${r.id}">
        <span class="bp-emoji">${esc(r.emoji)}</span><span class="bj-title">${esc(r.title)}</span>
        <span class="bp-cost">${r.cost} ⭐</span>
        ${can ? '<span class="bp-tag">You can get this!</span>' : `<span class="lvl-bar"><i style="width:${Math.round(Math.max(0, avail) / r.cost * 100)}%"></i></span>`}
      </button>`;
    }).join('') || '<p class="b-none">Ask Mom or Dad to add prizes!</p>'}</div>`;
}

function routineKey(k, kind) { return `hb.rt.${k.id}.${kind}.${todayStr()}`; }
function routineScreen(k) {
  const r = routineOf(k, S.buddy.kind);
  const steps = r?.steps || [];
  const night = S.buddy.kind === 'bedtime';
  let i = +(localStorage.getItem(routineKey(k, S.buddy.kind)) || 0);
  if (i >= steps.length) i = steps.length - 1;
  const step = steps[i];
  if (!step) return `${topBar(k, { stars: false })}<p class="b-none">No steps yet.</p><button class="b-big-btn" data-act="b-home">Back</button>`;
  setTimeout(() => { if (S.buddy.lastSpoken !== `${S.buddy.kind}${i}`) { S.buddy.lastSpoken = `${S.buddy.kind}${i}`; talk(step.title, { quiet: night }); } }, 250);
  return `
    ${topBar(k, { stars: false })}
    <div class="b-row"><button class="b-back" data-act="b-home">‹</button><h1 class="b-title">${night ? '🌙 Bedtime' : '☀️ Morning'}</h1></div>
    <div class="rt-dots">${steps.map((_, j) => `<i class="${j < i ? 'done' : j === i ? 'now' : ''}"></i>`).join('')}</div>
    <button class="rt-card" data-act="b-say" data-text="${esc(step.title)}">
      <span class="rt-emoji">${esc(step.emoji)}</span>
      <span class="rt-title">${esc(step.title)}</span>
      <small>🔊 tap to hear it again</small>
    </button>
    <div class="rt-nav">
      ${i > 0 ? '<button class="b-back big" data-act="b-step" data-d="-1">‹</button>' : '<span></span>'}
      <button class="b-big-btn" data-act="b-step" data-d="1">✓ Done!</button>
    </div>`;
}

function bedtimeScreen(k) {
  const prof = profileOf(k);
  const r = routineOf(k, 'bedtime');
  setTimeout(() => sayOnce('bedtime', `It's almost bedtime, ${k.name}. Let's do your bedtime routine.`, { quiet: true, enabled: voiceOn() }), 500);
  return `
    ${topBar(k)}
    <div class="b-center">
      <div class="b-moon">🌙</div>
      <button class="b-pet small" data-act="b-pet-tap">${petHtml(prof, earned(k), 1, { asleep: false, size: 'md' })}</button>
      ${r?.steps?.length && !routineDone(k, 'bedtime') ? `<button class="b-routine-banner night" data-act="b-routine" data-kind="bedtime"><span>🌙</span>Bedtime routine<b>Start</b></button>` : '<p class="b-soft">Time to get cozy…</p>'}
    </div>`;
}

function sleepScreen(k) {
  const prof = profileOf(k);
  return `
    <button class="b-sleep" data-act="b-sleep-tap">
      <span class="b-moon dim">🌙</span>
      <span class="b-sleep-clock" data-bclock>${clock()}</span>
      <span class="b-sleep-pet">${esc(petOf(prof.pet_kind)?.emoji || '')}💤</span>
      <span class="b-sleep-msg" id="sleep-msg"></span>
    </button>`;
}

function wakeScreen(k) {
  setTimeout(() => sayOnce('wake', `Good morning, ${k.name}! The sun is up. You can get up now!`, { enabled: voiceOn() }), 500);
  return `
    <div class="b-wake">
      <div class="b-sun">☀️</div>
      <h1>Good morning, ${esc(k.name)}!</h1>
      <p>You can get up now!</p>
      <button class="b-big-btn" data-act="b-wake-ok">Start my morning ☀️</button>
    </div>`;
}

function confirmOverlay(k) {
  const c = S.buddy.confirm;
  if (c.type === 'job') {
    const chore = byId('chores', c.id);
    return `<div class="b-confirm"><div class="b-confirm-card">
      <span class="bj-emoji huge">${esc(chore.emoji)}</span>
      <h2>Did you ${esc(chore.title.toLowerCase())}?</h2>
      ${chore.photo_proof
        ? `<input type="file" id="b-photo" accept="image/*" capture="environment" hidden>
           <button class="b-big-btn" data-act="b-photo">📷 Take a picture!</button>`
        : `<button class="b-big-btn" data-act="b-job-yes">✓ I did it!</button>`}
      <button class="b-no" data-act="b-cancel">Not yet</button></div></div>`;
  }
  if (c.type === 'prize') {
    const r = byId('rewards', c.id);
    return `<div class="b-confirm"><div class="b-confirm-card">
      <span class="bj-emoji huge">${esc(r.emoji)}</span><h2>Ask for ${esc(r.title)}?</h2><p>${r.cost} ⭐</p>
      <button class="b-big-btn" data-act="b-prize-yes">🙋 Yes please!</button>
      <button class="b-no" data-act="b-cancel">Not now</button></div></div>`;
  }
  return '';
}

// ------------------------------------------------------------------ timers & secret grown-up button
setInterval(() => {
  if (S.mode !== 'buddy') return;
  document.querySelectorAll('[data-bclock]').forEach((el) => { el.textContent = clock(); });
  const ph = phase();
  if (ph !== S.buddy.lastPhase && !S.buddy.confirm && S.buddy.screen !== 'routine') { S.buddy.lastPhase = ph; hooks.render(); }
}, 20_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.mode === 'buddy') keepAwake(true); });

let holdTimer;
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-hold=parent]')) return;
  holdTimer = setTimeout(parentGate, 2000);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, () => clearTimeout(holdTimer)));

function parentGate() {
  const pin = localStorage.getItem('hb.pin') || (S.api.demo ? '1234' : '');
  const entered = prompt('Grown-ups: enter your PIN');
  if (entered === null) return;
  if (pin && entered !== pin) { toast('Wrong PIN'); return; }
  openSheet(`
    <h2>Grown-up menu</h2>
    <div class="stack-sm">
      <button type="button" class="btn" data-act="bp-preview" data-p="">🕒 Normal (follow the clock)</button>
      <div class="row wrap">${[['wake', '🌞 Wake'], ['day', '🏠 Day'], ['bedtime', '🌙 Bedtime'], ['sleep', '💤 Sleep']]
        .map(([p, t]) => `<button type="button" class="btn ghost" data-act="bp-preview" data-p="${p}">Preview ${t}</button>`).join('')}</div>
      ${kids().length > 1 ? `<label>Whose Buddy is this?<select id="bp-kid">${kids().map((x) => `<option value="${x.id}" ${x.id === kid()?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <button type="button" class="btn" data-act="bp-kid">Switch kid</button>` : ''}
      <button type="button" class="btn ghost" data-act="bp-reset">↺ Restart today's routines</button>
      <button type="button" class="btn danger" data-act="bp-exit">Exit Buddy mode</button>
    </div>
    <button class="btn ghost" type="button" data-act="sheet-close">Close</button>`);
}

// ------------------------------------------------------------------ actions
const go = (patch) => { Object.assign(S.buddy, patch); hooks.render(); };
Object.assign(actions, {
  'b-home': () => { tap(); go({ screen: null, confirm: null }); },
  'b-prizes': () => { tap(); talk('Here are your prizes!'); go({ screen: 'prizes' }); },
  'b-pickpet': (el) => { const p = PETS.find((x) => x.kind === el.dataset.kind); tap(); talk(`${p.label}!`); go({ pickPet: p.kind }); },
  'b-pet-ok': async () => {
    const k = kid(), p = PETS.find((x) => x.kind === S.buddy.pickPet);
    const row = { pet_kind: p.kind, pet_name: p.name, updated_at: new Date().toISOString() };
    if (S.data.kid_profiles.some((x) => x.member_id === k.id)) await run(() => S.api.updateWhere('kid_profiles', 'member_id', k.id, row));
    else await run(() => S.api.insert('kid_profiles', { ...row, member_id: k.id, household_id: household().id }));
    await hooks.loadAll();
    celebrate();
    talk(`Meet ${p.name} the ${p.label.toLowerCase()}! Do your jobs to help ${p.name} grow!`);
    go({ pickPet: null });
  },
  'b-pet-tap': () => {
    const k = kid(), prof = profileOf(k);
    const asleep = phase(k) === 'sleep';
    const line = mood(todayProgress(k).ratio, asleep).line;
    talk(`${prof.pet_name} says: ${line}`, { quiet: phase(k) !== 'day' });
    const el = document.querySelector('.b-pet .pet'); el?.classList.remove('bounce'); void el?.offsetWidth; el?.classList.add('bounce');
  },
  'b-job': (el) => {
    const k = kid(), chore = byId('chores', el.dataset.id), d = choreDone(chore, k);
    tap();
    if (d) { talk(d.status === 'pending' ? 'Mom or Dad will check your picture soon!' : `You already did that! Great job!`); return; }
    talk(`Did you ${chore.title.toLowerCase()}?`);
    go({ confirm: { type: 'job', id: chore.id } });
  },
  'b-job-yes': async () => {
    const k = kid(), chore = byId('chores', S.buddy.confirm.id);
    S.buddy.confirm = null;
    await run(() => completeChore(k, chore));
    afterStars(k, chore.points);
  },
  'b-photo': () => {
    const input = document.getElementById('b-photo');
    input.onchange = async () => {
      if (!input.files[0]) return;
      const k = kid(), chore = byId('chores', S.buddy.confirm.id);
      S.buddy.confirm = null; hooks.render();
      toast('Sending your picture…');
      await run(async () => completeChore(k, chore, await resizeImage(input.files[0], 1280)));
      celebrate({ emojis: ['📷', '⭐', '✨'] });
      talk(`Great picture! Mom or Dad will check it and then you get ${chore.points} stars!`);
      hooks.render();
    };
    input.click();
  },
  'b-cancel': () => { tap(); go({ confirm: null }); },
  'b-prize': (el) => {
    const k = kid(), r = byId('rewards', el.dataset.id);
    const avail = balance(k) + pendingRedeem(k).reduce((s, x) => s + x.points, 0);
    tap();
    if (avail >= r.cost) { talk(`${r.title}! Do you want to ask for it?`); go({ confirm: { type: 'prize', id: r.id } }); }
    else talk(`${r.title} costs ${r.cost} stars. You need ${r.cost - avail} more stars. Keep going!`);
  },
  'b-prize-yes': async () => {
    const k = kid(), r = byId('rewards', S.buddy.confirm.id);
    S.buddy.confirm = null;
    await run(() => requestReward(k, r));
    celebrate({ emojis: ['🎁', '⭐', '💌'] });
    talk(`I asked Mom and Dad for ${r.title}!`);
    hooks.render();
  },
  'b-routine': (el) => { tap(); go({ screen: 'routine', kind: el.dataset.kind, lastSpoken: null }); },
  'b-say': (el) => talk(el.dataset.text, { quiet: S.buddy.kind === 'bedtime' }),
  'b-step': async (el) => {
    const k = kid(), r = routineOf(k, S.buddy.kind), key = routineKey(k, S.buddy.kind);
    const night = S.buddy.kind === 'bedtime';
    let i = +(localStorage.getItem(key) || 0) + +el.dataset.d;
    tap();
    if (i >= r.steps.length) {
      localStorage.setItem(key, String(r.steps.length));
      const saved = await run(() => completeRoutine(k, r));
      celebrate({ quiet: night });
      const pts = saved ? ` You earned ${r.points} stars!` : '';
      if (night) talk(`All done! Goodnight, ${k.name}. Sleep tight.${pts}`, { quiet: true });
      else talk(`Awesome! Your morning routine is done!${pts}`);
      go({ screen: null, kind: null });
      return;
    }
    localStorage.setItem(key, String(Math.max(0, i)));
    hooks.render();
  },
  'b-wake-ok': () => {
    localStorage.setItem(spokenKey('sunTapped'), '1');
    const k = kid();
    if (routineOf(k, 'morning')?.steps?.length) go({ screen: 'routine', kind: 'morning', lastSpoken: null });
    else go({ screen: null });
  },
  'b-sleep-tap': () => {
    const msg = document.getElementById('sleep-msg');
    const k = kid();
    msg.textContent = 'Still sleepy time. Stay in bed until the sun comes up 🌞';
    msg.classList.add('show');
    talk(`It's still sleepy time, ${k.name}. Stay in bed until the sun comes up.`, { quiet: true });
    clearTimeout(S.buddy.msgT); S.buddy.msgT = setTimeout(() => msg.classList.remove('show'), 6000);
  },
  // grown-up menu
  'bp-preview': (el) => { S.buddy.preview = el.dataset.p || null; S.buddy.screen = null; document.querySelector('button[data-act=sheet-close]')?.click(); hooks.render(); },
  'bp-kid': () => { S.buddy.kidId = document.getElementById('bp-kid').value; localStorage.setItem('hb.buddyKid', S.buddy.kidId); document.querySelector('button[data-act=sheet-close]')?.click(); hooks.render(); },
  'bp-reset': () => {
    const k = kid();
    ['morning', 'bedtime'].forEach((kind) => localStorage.removeItem(routineKey(k, kind)));
    ['sunTapped', 'wake', 'bedtime'].forEach((w) => localStorage.removeItem(spokenKey(w)));
    toast('Routine progress restarted (stars already earned are kept)');
  },
  'bp-exit': () => {
    S.mode = 'phone'; localStorage.setItem('hb.mode', 'phone');
    S.buddy.preview = null; S.tab = 'family';
    document.body.classList.remove('buddy-mode', 'buddy-night');
    keepAwake(false);
    document.querySelector('button[data-act=sheet-close]')?.click();
    hooks.render();
  },
});

function afterStars(k, points) {
  const prog = todayProgress(k);
  celebrate();
  const name = profileOf(k).pet_name;
  if (prog.total && prog.done === prog.total) talk(`Wow, ${k.name}! You did all your jobs! ${name} is so happy!`);
  else talk(`Great job, ${k.name}! You earned ${points} star${points === 1 ? '' : 's'}!`);
  hooks.render();
  setTimeout(() => { const el = document.querySelector('.b-pet .pet'); el?.classList.add('eat'); setTimeout(() => el?.classList.remove('eat'), 1400); }, 50);
}

export function sheetBuddySetup() {
  openSheet(`
    <h2>🧒 Make this a kid's Buddy</h2>
    <p class="muted small">This screen becomes the kid's own: pet, picture jobs, prizes and routines. To get back out, hold the top-left corner for 2 seconds and enter your PIN.</p>
    <label>Whose Buddy?<select name="kid">${kids().map((k) => `<option value="${k.id}">${esc(k.emoji)} ${esc(k.name)}</option>`).join('')}</select></label>
    <label>Grown-up PIN (4+ digits)<input name="pin" inputmode="numeric" pattern="[0-9]{4,8}" required placeholder="e.g. 2580" value="${esc(localStorage.getItem('hb.pin') || '')}"></label>
    <div class="row between"><span></span>
      <div class="row"><button class="btn ghost" type="button" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit" value="save">Start Buddy</button></div></div>`,
  async (f) => {
    localStorage.setItem('hb.pin', f.get('pin'));
    S.buddy.kidId = f.get('kid'); localStorage.setItem('hb.buddyKid', S.buddy.kidId);
    S.mode = 'buddy'; localStorage.setItem('hb.mode', 'buddy');
    setTimeout(() => hooks.render(), 250);
  });
}
