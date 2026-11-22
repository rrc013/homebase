// Buddy mode: the kid's own screen (pet, picture jobs, prizes, morning/bedtime routines, sleep clock)
import { S, esc, byId, household, actions, hooks, $app, resizeImage, run, openSheet, toast } from './core.js';
import {
  kids, profileOf, choresFor, choreDone, routineOf, routineDone, balance, earned, todayProgress,
  completeChore, completeRoutine, requestReward, pendingRedeem, todayStr, setBedtimeNow,
  requestsToday, requestStarsWithVideo, VIDEO_LIMIT_PER_DAY,
} from './kids.js';
import { petHtml, petOf, PETS, levelInfo, mood } from './pets.js';
import { say, celebrate, tap, keepAwake, timerChime } from './fun.js';
import { BOOK, BOOK_ART, artFor } from './bedtime-book.js';

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
  const early = p.bedtime_now === todayStr(); // a grown-up tapped "Start bedtime now"
  // a grown-up starting bedtime wins over the clock, even after sleep time (until she finishes)
  if (early && !routineDone(k, 'bedtime') && m >= wake) return 'bedtime';
  if (asleep) return 'sleep';
  if ((m >= bed || early) && routineDone(k, 'bedtime')) return 'sleep';
  if (!early && m >= wake && m < wake + 30 && !routineDone(k, 'morning') && !localStorage.getItem(spokenKey('sunTapped'))) return 'wake';
  if (m >= bed || early) return 'bedtime';
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
  let ph = phase(k);
  const prof = profileOf(k);
  // "Start bedtime now" was just tapped (here or on a parent's phone): open the flip book at the cover
  if (prof.bedtime_now === todayStr() && ph === 'bedtime') {
    const token = `${k.id}:${prof.updated_at}`;
    if (localStorage.getItem('hb.bedNowOpened') !== token) {
      localStorage.setItem('hb.bedNowOpened', token);
      localStorage.removeItem(routineKey(k, 'bedtime')); localStorage.removeItem(pageKey(k, 'bedtime')); localStorage.removeItem(`${pageKey(k, 'bedtime')}.timer`);
      Object.assign(S.buddy, { screen: 'routine', kind: 'bedtime', confirm: null, preview: null, lastSpoken: null });
    }
  }
  // bedtime was cancelled while the routine was open: back to the day screen
  if (S.buddy.screen === 'routine' && S.buddy.kind === 'bedtime' && ph === 'day' && !S.buddy.preview) S.buddy.screen = null;
  document.body.classList.toggle('buddy-night', ph === 'bedtime' || ph === 'sleep' || (S.buddy.screen === 'routine' && S.buddy.kind === 'bedtime'));
  let body;
  if (!profileOf(k).pet_kind && S.buddy.hadPet) {
    // a grown-up just reset this kid: forget today's routine progress + greetings
    ['morning', 'bedtime'].forEach((kind) => { localStorage.removeItem(routineKey(k, kind)); localStorage.removeItem(pageKey(k, kind)); });
    ['pickpet', 'sunTapped', 'wake', 'bedtime'].forEach((w) => localStorage.removeItem(spokenKey(w)));
    S.buddy.screen = null; S.buddy.confirm = null;
  }
  S.buddy.hadPet = !!profileOf(k).pet_kind;
  if (!profileOf(k).pet_kind) body = petPicker(k);
  else if (S.buddy.screen === 'routine') body = routineScreen(k);
  else if (S.buddy.screen === 'prizes') body = prizeScreen(k);
  else if (S.buddy.screen === 'record') body = recordScreen(k);
  else if (ph === 'sleep') body = sleepScreen(k);
  else if (ph === 'wake') body = wakeScreen(k);
  else if (ph === 'bedtime') body = bedtimeScreen(k);
  else body = dayScreen(k);
  $app.innerHTML = `<div class="buddy phase-${ph}">
    <button class="buddy-secret" aria-label="Grown-ups" data-hold="parent"><span>🔒</span></button>
    ${S.api.demo ? '<div class="demo-banner">Demo mode — hold the 🔒 in the bottom-right corner (or the clock) for 2 seconds for the grown-up menu (PIN 1234)</div>' : ''}
    ${body}${S.buddy.confirm ? confirmOverlay(k) : newsOverlay(k, ph)}</div>`;
  if (S.buddy.screen === 'record') attachCamera();
}

function topBar(k, { stars = true } = {}) {
  const avail = balance(k) + pendingRedeem(k).reduce((s, x) => s + x.points, 0);
  return `<div class="b-top">
    <div class="b-clock" data-bclock data-hold="parent">${clock()}</div>
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
    <button class="b-proud" data-act="b-record">🙋 I did something good!</button>
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
// ---- Bedtime Book mode: cover → one page per step → "You did it!"
const isBook = (r) => (r?.steps || []).some((st) => st.art);
const pageKey = (k, kind) => `${routineKey(k, kind)}.page`;
const starTrack = (n, cur) => `<div class="bk-stars">${Array.from({ length: n }, (_, j) =>
  `<span class="${j < cur ? 'on' : ''} ${j === cur - 1 ? 'big' : ''}">★</span>`).join('')}</div>`;
const artBox = (st) => {
  const a = artFor(st);
  return a ? `<div class="bk-art" style="background:${a.bg}">${a.svg}</div>` : `<div class="bk-art" style="background:#EEE9F8"><span class="bk-emoji">${esc(st.emoji || '⭐')}</span></div>`;
};
function timeLeftText(endsAt) {
  const left = Math.ceil((endsAt - Date.now()) / 60000);
  return left <= 0 ? "✓ Time's up" : `${left} min left`;
}
// keep "x min left" current without redrawing the page, and ring once when the time is up
setInterval(() => document.querySelectorAll('.bk-left[data-ends]').forEach((el) => {
  el.textContent = timeLeftText(+el.dataset.ends);
  if (Date.now() < +el.dataset.ends || document.hidden) return;
  let t = null; try { t = JSON.parse(localStorage.getItem(el.dataset.tkey) || 'null'); } catch { t = null; }
  if (!t || t.rung) return;
  t.rung = true; localStorage.setItem(el.dataset.tkey, JSON.stringify(t));
  const night = S.buddy.kind === 'bedtime';
  el.classList.add('ding');
  timerChime({ quiet: night });
  setTimeout(() => talk(`Time's up! Tap done when you're ready.`, { quiet: night }), 3400);
}), 5_000);

function bookScreen(k, r) {
  const steps = r.steps, n = steps.length;
  const night = S.buddy.kind === 'bedtime';
  let pg = +(localStorage.getItem(pageKey(k, S.buddy.kind)) || 0);
  if (pg > n + 1) pg = n + 1;
  const speakOnce = (text) => setTimeout(() => {
    if (S.buddy.lastSpoken !== `bk${pg}`) { S.buddy.lastSpoken = `bk${pg}`; talk(text, { quiet: night }); }
  }, 300);
  let page;
  if (pg === 0) {
    speakOnce(`${BOOK.title}. ${BOOK.subtitle} Let's start, ${k.name}!`);
    page = `<div class="bk-page cover">
      <div class="bk-art" style="background:${BOOK_ART.moon.bg}">${BOOK_ART.moon.svg}</div>
      <div class="bk-text"><h1>${BOOK.title}</h1><p class="bk-say">${BOOK.subtitle}</p>
        <small class="bk-belongs">THIS BOOK BELONGS TO</small><div class="bk-name">${esc(k.name)}</div></div>
    </div>`;
  } else if (pg <= n) {
    const st = steps[pg - 1];
    speakOnce(`${st.title}. ${st.say || ''}`);
    const mins = +st.minutes || 0;
    // remember when this page started so redraws don't restart the timer
    const tKey = `${pageKey(k, S.buddy.kind)}.timer`;
    let t = null; try { t = JSON.parse(localStorage.getItem(tKey) || 'null'); } catch { t = null; }
    if (!t || t.pg !== pg) { t = { pg, start: Date.now() }; localStorage.setItem(tKey, JSON.stringify(t)); }
    const total = mins * 60, elapsed = Math.min(total, (Date.now() - t.start) / 1000), endsAt = t.start + total * 1000;
    page = `<button class="bk-page" data-act="b-say" data-text="${esc(`${st.title}. ${st.say || ''}`)}">
      ${artBox(st)}
      <div class="bk-text">
        <small class="bk-step">STEP ${pg} OF ${n}</small>
        <h1>${esc(st.title)}</h1>
        ${st.say ? `<p class="bk-say">${esc(st.say)}</p>` : ''}
        ${mins ? `<div class="bk-time">🕒 ${mins} minute${mins === 1 ? '' : 's'}</div>
          <div class="bk-dots">${'<i></i>'.repeat(Math.min(mins, 15))}</div>
          <div class="bk-timer"><i style="animation-duration:${total}s;animation-delay:-${elapsed.toFixed(1)}s"></i></div>
          <div class="bk-left" data-ends="${endsAt}" data-tkey="${tKey}">${timeLeftText(endsAt)}</div>` : (pg === n ? '<div class="bk-time">Lights out</div>' : '')}
        <small class="bk-hint">🔊 tap to hear it again</small>
      </div>
    </button>
    ${starTrack(n, pg)}`;
  } else {
    speakOnce(`You did it, ${k.name}! ${BOOK.endLine}`);
    page = `<div class="bk-page end">
      <div class="bk-end-stars">★ <b>★</b> ★</div>
      <h1>${BOOK.endTitle}</h1>
      <p class="bk-say">${BOOK.endLine}</p>
    </div>`;
  }
  const btn = pg === 0 ? "Let's go! 🌙" : pg <= n ? '✓ Done!' : 'Goodnight 💤';
  return `
    ${topBar(k, { stars: false })}
    <div class="b-row"><button class="b-back" data-act="b-home">‹</button><h1 class="b-title">${night ? '🌙 Bedtime' : '☀️ Morning'}</h1></div>
    ${page}
    <div class="rt-nav">
      ${pg > 0 ? '<button class="b-back big" data-act="b-page" data-d="-1">‹</button>' : '<span></span>'}
      <button class="b-big-btn" data-act="b-page" data-d="1">${btn}</button>
    </div>`;
}

function routineScreen(k) {
  const r = routineOf(k, S.buddy.kind);
  if (isBook(r)) return bookScreen(k, r);
  const steps = r?.steps || [];
  const night = S.buddy.kind === 'bedtime';
  let i = +(localStorage.getItem(routineKey(k, S.buddy.kind)) || 0);
  if (i >= steps.length) i = steps.length - 1;
  const step = steps[i];
  if (!step) return `${topBar(k, { stars: false })}<p class="b-none">No steps yet.</p><button class="b-big-btn" data-act="b-home">Back</button>`;
  setTimeout(() => { if (S.buddy.lastSpoken !== `${S.buddy.kind}${i}`) { S.buddy.lastSpoken = `${S.buddy.kind}${i}`; talk(`${step.title}${step.say ? `. ${step.say}` : ''}`, { quiet: night }); } }, 250);
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
      <span class="b-sleep-clock" data-bclock data-hold="parent">${clock()}</span>
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

// ------------------------------------------------------------------ "I did something good!" video recorder
const rec = { stream: null, recorder: null, chunks: [], blob: null, url: null, mime: '', facing: 'user', state: 'live', left: 20, timer: null, error: null };
const MAX_SECONDS = 20;
async function startCamera() {
  stopCamera();
  rec.error = null;
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: rec.facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: true,
    });
  } catch (e) { rec.error = e.name === 'NotAllowedError' ? 'denied' : 'nocam'; }
  hooks.render();
}
function stopCamera() { rec.stream?.getTracks().forEach((t) => t.stop()); rec.stream = null; }
function attachCamera() {
  const v = document.getElementById('rec-live');
  if (v && rec.stream && v.srcObject !== rec.stream) { v.srcObject = rec.stream; v.play().catch(() => {}); }
}
function pickMime() {
  const opts = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return opts.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}
function leaveRecorder() {
  clearInterval(rec.timer); if (rec.recorder?.state === 'recording') rec.recorder.stop();
  stopCamera(); if (rec.url) URL.revokeObjectURL(rec.url);
  Object.assign(rec, { recorder: null, chunks: [], blob: null, url: null, state: 'live', left: MAX_SECONDS });
}

function recordScreen(k) {
  if (rec.error) {
    return `${topBar(k, { stars: false })}
      <div class="b-row"><button class="b-back" data-act="b-rec-close">‹</button><h1 class="b-title">Show Mom & Dad</h1></div>
      <div class="b-center"><div style="font-size:5rem">📷</div>
        <p class="b-soft">${rec.error === 'denied' ? 'Ask Mom or Dad to let Homebase use the camera and microphone.' : "The camera isn't working right now."}</p>
        <button class="b-big-btn" data-act="b-rec-retry">Try again</button></div>`;
  }
  if (rec.state === 'review' || rec.state === 'sending') {
    return `${topBar(k, { stars: false })}
      <div class="b-row"><button class="b-back" data-act="b-rec-close">‹</button><h1 class="b-title">Your video</h1></div>
      <video class="rec-video" src="${rec.url}" controls autoplay playsinline></video>
      <div class="rec-actions">
        <button class="b-no big" data-act="b-rec-again" ${rec.state === 'sending' ? 'disabled' : ''}>🔄 Try again</button>
        <button class="b-big-btn" data-act="b-rec-send" ${rec.state === 'sending' ? 'disabled' : ''}>${rec.state === 'sending' ? 'Sending…' : '📨 Send to Mom & Dad'}</button>
      </div>`;
  }
  const recording = rec.state === 'recording';
  return `${topBar(k, { stars: false })}
    <div class="b-row"><button class="b-back" data-act="b-rec-close">‹</button><h1 class="b-title">Show Mom & Dad!</h1></div>
    <div class="rec-wrap ${recording ? 'is-rec' : ''}">
      <video id="rec-live" class="rec-video live ${rec.facing === 'user' ? 'mirror' : ''}" muted playsinline autoplay></video>
      ${recording ? `<div class="rec-badge">● <span id="rec-left">${rec.left}</span></div>` : ''}
      ${!rec.stream ? '<div class="rec-loading">Starting the camera…</div>' : ''}
    </div>
    <div class="rec-actions">
      ${recording ? '<span></span>' : '<button class="b-back big" data-act="b-rec-flip" aria-label="Switch camera">🔄</button>'}
      <button class="rec-btn ${recording ? 'stop' : ''}" data-act="${recording ? 'b-rec-stop' : 'b-rec-start'}" aria-label="${recording ? 'Stop' : 'Record'}"><i></i></button>
      <span class="rec-hint">${recording ? 'Tap to stop' : 'Tap the red button'}</span>
    </div>`;
}

// ------------------------------------------------------------------ news: stars given/taken, prizes and videos answered
const annKey = (k) => `hb.announced.${k.id}`;
const sig = (x) => `${x.id}:${x.status}`;
const parentWord = (m) => {
  if (!m) return 'Mom or Dad';
  if (/👩|👱‍♀️|👩‍🦰|👵/.test(m.emoji)) return 'Mommy';
  if (/🧔|👨|👨‍🦱|👴/.test(m.emoji)) return 'Daddy';
  return m.name;
};
function nextNews(k) {
  const mine = S.data.completions.filter((x) => x.member_id === k.id);
  const raw = localStorage.getItem(annKey(k));
  if (!raw) { localStorage.setItem(annKey(k), JSON.stringify(mine.map(sig))); return null; } // first run: no flood of old news
  const seen = new Set(JSON.parse(raw));
  return mine.filter((x) => (x.kind === 'bonus' && x.status === 'approved') || ((x.kind === 'request' || x.kind === 'redeem') && x.status !== 'pending'))
    .filter((x) => !seen.has(sig(x)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] || null;
}
function markNews(k, x) {
  const seen = JSON.parse(localStorage.getItem(annKey(k)) || '[]');
  seen.push(sig(x));
  localStorage.setItem(annKey(k), JSON.stringify(seen.slice(-600)));
}
function newsOverlay(k, ph) {
  if (ph === 'sleep' || ph === 'wake' || S.buddy.screen === 'routine' || S.buddy.screen === 'record' || !profileOf(k).pet_kind) return '';
  const x = nextNews(k);
  if (!x) return '';
  const who = parentWord(byId('members', x.reviewed_by || x.created_by));
  const n = Math.abs(x.points);
  let icon, big, line, happy = true;
  if (x.kind === 'bonus' && x.points >= 0) {
    icon = x.emoji && x.emoji !== '🌟' ? x.emoji : '🌟'; big = `+${n} ⭐`;
    line = `${who} gave you ${n} star${n === 1 ? '' : 's'}${x.note ? ` for: ${x.note.toLowerCase()}` : ''}!`;
  } else if (x.kind === 'bonus') {
    happy = false; icon = '💭'; big = `−${n} ⭐`;
    line = `You lost ${n} star${n === 1 ? '' : 's'}${x.note ? ` for: ${x.note.toLowerCase()}` : ''}. You can earn them back by being kind and helpful!`;
  } else if (x.kind === 'request' && x.status === 'approved') {
    icon = '🎬'; big = `+${n} ⭐`; line = `${who} watched your video! You earned ${n} star${n === 1 ? '' : 's'}${x.note ? ` for: ${x.note.toLowerCase()}` : ''}!`;
  } else if (x.kind === 'request') {
    happy = false; icon = '🎬'; big = 'Not this time'; line = `${who} watched your video. Not this time, but keep trying!`;
  } else if (x.status === 'approved') {
    icon = x.emoji; big = 'YES! 🎉'; line = `${who} said yes to ${x.title}!`;
  } else {
    happy = false; icon = x.emoji; big = 'Not right now'; line = `Not right now for ${x.title}. Keep saving your stars!`;
  }
  const night = ph === 'bedtime';
  if (S.buddy.newsSpoken !== sig(x)) {
    S.buddy.newsSpoken = sig(x);
    setTimeout(() => { talk(line, { quiet: night || !happy }); if (happy) celebrate({ quiet: night }); }, 300);
  }
  return `<div class="b-confirm"><div class="b-confirm-card news ${happy ? '' : 'gentle'}">
    <span class="bj-emoji huge">${esc(icon)}</span><h2>${esc(big)}</h2><p class="news-line">${esc(line)}</p>
    <button class="b-big-btn" data-act="b-news-ok" data-id="${x.id}" data-status="${x.status}">${happy ? 'Yay! 🎉' : 'Okay'}</button>
  </div></div>`;
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
  if (ph !== S.buddy.lastPhase && !S.buddy.confirm && S.buddy.screen !== 'routine' && S.buddy.screen !== 'record') { S.buddy.lastPhase = ph; hooks.render(); }
}, 20_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.mode === 'buddy') keepAwake(true); });

let holdTimer, gateOpenAt = 0;
const openGate = () => { clearTimeout(holdTimer); if (Date.now() - gateOpenAt < 1500) return; gateOpenAt = Date.now(); parentGate(); };
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-hold=parent]')) return;
  holdTimer = setTimeout(openGate, 1500);
});
['pointerup', 'pointerleave'].forEach((t) => document.addEventListener(t, () => clearTimeout(holdTimer)));
// On Android a long press makes Chrome show its own menu (Back / Reload / Share…). Block it on the
// Buddy, and treat the long press on the 🔒 or the clock as the grown-up gesture.
document.addEventListener('contextmenu', (e) => {
  if (S.mode !== 'buddy' && S.mode !== 'hub') return;
  e.preventDefault();
  if (e.target.closest('[data-hold=parent]')) openGate();
});
// the Buddy double-checks for changes every minute (e.g. "Start bedtime now" from a phone)
setInterval(() => { if (S.mode === 'buddy' && S.user && !document.hidden) hooks.reload(); }, 60_000);

function parentGate() {
  const pin = localStorage.getItem('hb.pin') || (S.api.demo ? '1234' : '');
  const entered = prompt('Grown-ups: enter your PIN');
  if (entered === null) return;
  if (pin && entered !== pin) { toast('Wrong PIN'); return; }
  openSheet(`
    <h2>Grown-up menu</h2>
    <div class="stack-sm">
      ${profileOf(kid()).bedtime_now === todayStr() && !routineDone(kid(), 'bedtime')
        ? '<button type="button" class="btn" data-act="bp-bedtime" data-on="">↩︎ Cancel early bedtime</button>'
        : '<button type="button" class="btn primary" data-act="bp-bedtime" data-on="1">🌙 Start bedtime now</button>'}
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
  'b-home': () => { tap(); leaveRecorder(); go({ screen: null, confirm: null }); },
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
  'b-news-ok': (el) => { tap(); markNews(kid(), { id: el.dataset.id, status: el.dataset.status }); hooks.render(); },
  'b-record': () => {
    const k = kid();
    tap();
    if (requestsToday(k) >= VIDEO_LIMIT_PER_DAY) { talk(`You already sent ${VIDEO_LIMIT_PER_DAY} videos today. You can send more tomorrow!`); return; }
    talk('Show Mom and Dad something good you did! Tap the red button to start.');
    leaveRecorder(); go({ screen: 'record' }); startCamera();
  },
  'b-rec-retry': () => startCamera(),
  'b-rec-flip': () => { tap(); rec.facing = rec.facing === 'user' ? 'environment' : 'user'; startCamera(); },
  'b-rec-start': () => {
    if (!rec.stream) return;
    tap();
    rec.mime = pickMime();
    try { rec.recorder = new MediaRecorder(rec.stream, rec.mime ? { mimeType: rec.mime, videoBitsPerSecond: 900_000 } : undefined); }
    catch { rec.recorder = new MediaRecorder(rec.stream); }
    rec.chunks = [];
    rec.recorder.ondataavailable = (e) => { if (e.data?.size) rec.chunks.push(e.data); };
    rec.recorder.onstop = () => {
      clearInterval(rec.timer);
      rec.blob = new Blob(rec.chunks, { type: rec.recorder?.mimeType || rec.mime || 'video/webm' });
      rec.mime = rec.blob.type;
      rec.url = URL.createObjectURL(rec.blob);
      rec.state = 'review'; stopCamera();
      talk('Great video! Do you want to send it to Mom and Dad?');
      hooks.render();
    };
    rec.recorder.start(250);
    rec.state = 'recording'; rec.left = MAX_SECONDS;
    rec.timer = setInterval(() => {
      rec.left -= 1;
      const el = document.getElementById('rec-left'); if (el) el.textContent = rec.left;
      if (rec.left <= 0 && rec.recorder?.state === 'recording') rec.recorder.stop();
    }, 1000);
    hooks.render();
  },
  'b-rec-stop': () => { tap(); if (rec.recorder?.state === 'recording') rec.recorder.stop(); },
  'b-rec-again': () => { tap(); leaveRecorder(); startCamera(); hooks.render(); },
  'b-rec-send': async () => {
    const k = kid();
    rec.state = 'sending'; hooks.render();
    const ok = await run(() => requestStarsWithVideo(k, rec.blob, rec.mime));
    if (!ok) { rec.state = 'review'; hooks.render(); return; }
    celebrate({ emojis: ['🎬', '⭐', '💌'] });
    talk('I sent your video to Mom and Dad! They will watch it soon.');
    leaveRecorder(); go({ screen: null });
  },
  'b-rec-close': () => { tap(); leaveRecorder(); go({ screen: null }); },
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
  'b-page': async (el) => {
    const k = kid(), r = routineOf(k, S.buddy.kind), key = pageKey(k, S.buddy.kind);
    const night = S.buddy.kind === 'bedtime';
    const n = r.steps.length;
    const pg = Math.max(0, +(localStorage.getItem(key) || 0) + +el.dataset.d);
    tap();
    if (pg > n + 1) { // tapped "Goodnight" on the last page
      const saved = await run(() => completeRoutine(k, r));
      celebrate({ quiet: night, emojis: ['⭐', '✨', '🌙'] });
      if (saved) talk(`You earned ${r.points} stars. Sleep tight, ${k.name}.`, { quiet: night });
      localStorage.setItem(key, String(n + 1));
      go({ screen: null, kind: null });
      return;
    }
    localStorage.setItem(key, String(pg));
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
  'bp-bedtime': async (el) => {
    S.buddy.preview = null; S.buddy.screen = null;
    await setBedtimeNow(kid(), !!el.dataset.on);
    document.querySelector('button[data-act=sheet-close]')?.click();
    hooks.render();
  },
  'bp-preview': (el) => { S.buddy.preview = el.dataset.p || null; S.buddy.screen = null; document.querySelector('button[data-act=sheet-close]')?.click(); hooks.render(); },
  'bp-kid': () => { S.buddy.kidId = document.getElementById('bp-kid').value; localStorage.setItem('hb.buddyKid', S.buddy.kidId); document.querySelector('button[data-act=sheet-close]')?.click(); hooks.render(); },
  'bp-reset': () => {
    const k = kid();
    ['morning', 'bedtime'].forEach((kind) => { localStorage.removeItem(routineKey(k, kind)); localStorage.removeItem(pageKey(k, kind)); localStorage.removeItem(`${pageKey(k, kind)}.timer`); });
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
    <p class="muted small">This screen becomes the kid's own: pet, picture jobs, prizes and routines. To get back out, hold the faint 🔒 in the bottom-right corner (or the clock) for 2 seconds and enter your PIN.</p>
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
