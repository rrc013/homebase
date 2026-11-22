// Quick add: "Call plumber @Nicole tomorrow 5pm" → { text: 'Call plumber', member: Nicole, due: <date> }
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function parseQuick(input, members = [], now = new Date(), meId = null) {
  let text = ` ${input} `;
  let member = null, date = null, time = null, night = false;
  const cut = (re) => { text = text.replace(re, ' '); };
  const at = (y, m, d) => new Date(y, m, d);
  const today = at(now.getFullYear(), now.getMonth(), now.getDate());

  // @person (first name, start of name is enough: @nic)
  const mention = text.match(/\s@([\p{L}\d]+)/u);
  if (mention) {
    const q = mention[1].toLowerCase();
    member = q === 'me' ? members.find((m) => m.id === meId)
      : members.find((m) => m.name.toLowerCase() === q) || members.find((m) => m.name.toLowerCase().startsWith(q));
    if (member) cut(new RegExp(`\\s@${mention[1]}(?=\\s)`, 'u'));
  }

  // times: 5pm, 5:30 pm, at 5, at 17:00, noon
  let m = text.match(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)/i)
    || text.match(/\sat\s+(\d{1,2})(?::(\d{2}))?(?=\s)/i)
    || text.match(/\s(?:at\s+)?(\d{1,2}):(\d{2})(?=\s)/i);
  if (m) {
    let h = +m[1]; const min = +(m[2] || 0); const ap = (m[3] || '').toLowerCase().replace(/\./g, '');
    if (h <= 24 && min < 60) {
      if (ap === 'pm' && h < 12) h += 12;
      else if (ap === 'am' && h === 12) h = 0;
      else if (!ap && !m[0].includes(':') && h >= 1 && h <= 7) h += 12; // "at 5" → 5pm
      time = [h, min];
      cut(m[0].endsWith(' ') ? m[0] : new RegExp(escapeRe(m[0]) + '(?=\\s)'));
    }
  } else if (/\s(at\s+)?noon(?=\s)/i.test(text)) { time = [12, 0]; cut(/\s(at\s+)?noon(?=\s)/i); }

  // dates
  if (/\s(today)(?=\s)/i.test(text)) { date = today; cut(/\s(today)(?=\s)/i); }
  else if (/\s(tonight)(?=\s)/i.test(text)) { date = today; night = true; cut(/\s(tonight)(?=\s)/i); }
  else if (/\s(tomorrow|tmrw|tmr)(?=\s)/i.test(text)) { date = addDays(today, 1); cut(/\s(tomorrow|tmrw|tmr)(?=\s)/i); }
  else if ((m = text.match(/\sin\s+(\d+)\s+(day|days|week|weeks)(?=\s)/i))) {
    date = addDays(today, +m[1] * (m[2].toLowerCase().startsWith('week') ? 7 : 1)); cut(m[0]);
  } else if ((m = text.match(/\s(?:on\s+)?(?:next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday|rsday)?(?=\s)/i))) {
    const idx = DAYS.findIndex((d) => d.startsWith(m[1].toLowerCase().slice(0, 3)));
    let diff = (idx - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    date = addDays(today, diff); cut(m[0]);
  } else if ((m = text.match(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/))) {
    let y = m[3] ? +m[3] : today.getFullYear(); if (y < 100) y += 2000;
    date = at(y, +m[1] - 1, +m[2]);
    if (!m[3] && date < today) date = at(y + 1, +m[1] - 1, +m[2]);
    cut(m[0]);
  } else if ((m = text.match(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/i))) {
    const mon = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
    date = at(today.getFullYear(), mon, +m[2]);
    if (date < today) date = at(today.getFullYear() + 1, mon, +m[2]);
    cut(m[0]);
  }

  let due = null;
  if (date || time) {
    const [h, mi] = time || (night ? [19, 0] : [9, 0]);
    const base = date || today;
    due = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, mi);
    if (!date && due <= now) due = addDays(due, 1); // time only and already passed → tomorrow
  }
  text = text.replace(/\s+(on|at|by|for)\s*$/i, ' ').replace(/\s{2,}/g, ' ').trim();
  return { text: text || input.trim(), member, due };
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function quickLabel(p, now = new Date()) {
  const parts = [];
  if (p.member) parts.push(`${p.member.emoji || ''} ${p.member.name}`.trim());
  if (p.due) {
    const d = p.due, t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t0) / 864e5);
    const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 7
      ? d.toLocaleDateString([], { weekday: 'long' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    parts.push(`${day} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  }
  return parts.join(' · ');
}
