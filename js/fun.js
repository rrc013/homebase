// Voice, sounds and celebrations for the kids' screens
let voice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang?.startsWith('en'));
  // prefer a friendly-sounding US English voice when one exists
  voice = voices.find((v) => /female|samantha|google us english|en-us/i.test(`${v.name} ${v.lang}`)) || voices[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function say(text, { quiet = false, enabled = true } = {}) {
  if (!enabled || !('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = quiet ? 0.85 : 0.95;
  u.pitch = quiet ? 1.0 : 1.15;
  u.volume = quiet ? 0.45 : 1;
  speechSynthesis.speak(u);
}

let ctx;
function tone(freq, start, dur, vol = 0.18, type = 'sine') {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
}
export function chime({ quiet = false } = {}) {
  try {
    const v = quiet ? 0.05 : 0.18;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, v, 'triangle'));
  } catch { /* audio not available */ }
}
export function tap() { try { tone(880, 0, 0.08, 0.08); } catch { /* ignore */ } }

export function celebrate({ quiet = false, emojis } = {}) {
  const set = emojis || (quiet ? ['⭐', '✨', '🌙'] : ['⭐', '🎉', '✨', '🌟', '💖', '🎈']);
  const n = quiet ? 14 : 40;
  const box = document.createElement('div');
  box.className = `confetti ${quiet ? 'quiet' : ''}`;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = set[i % set.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 0.6}s`;
    s.style.animationDuration = `${(quiet ? 3.2 : 2) + Math.random() * 1.4}s`;
    s.style.fontSize = `${1.4 + Math.random() * 1.6}rem`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4800);
  chime({ quiet });
}

// Keep the screen on (hub + buddy). Chrome on Android supports this over https.
let lock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !lock && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}

// Full screen hides Android's status bar and Chrome's address bar (needs a tap to start)
export function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

// "time's up" — a soft music-box tune (quieter at bedtime), played twice
export function timerChime({ quiet = false } = {}) {
  try {
    const v = quiet ? 0.07 : 0.16;
    const tune = [784, 659, 523, 659, 784];
    [0, 1.6].forEach((rep) => tune.forEach((f, i) => tone(f, rep + i * 0.22, 0.6, v, 'sine')));
  } catch { /* audio not available */ }
}
