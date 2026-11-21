// Data layer: one small API, two backends.
//  - Supabase (real data, live sync across devices)
//  - Demo (in-memory sample data, used when config.js is blank or ?demo is in the URL)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABLES = ['households', 'members', 'lists', 'list_items', 'messages', 'countdowns',
  'stores', 'catalog', 'catalog_locations', 'google_accounts', 'calendars', 'events', 'event_private', 'photos',
  'kid_profiles', 'chores', 'routines', 'rewards', 'completions', 'push_subscriptions'];
const BUCKET = 'item-photos';
// tables where the app may only read some columns
const COLUMNS = { google_accounts: 'id,household_id,member_id,google_email,status,last_sync,created_at' };

export async function createBackend() {
  const wantDemo = new URLSearchParams(location.search).has('demo');
  if (wantDemo || !SUPABASE_URL || !SUPABASE_ANON_KEY) return createDemoBackend();
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  return createSupabaseBackend(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
}

// ---------------------------------------------------------------- Supabase
function createSupabaseBackend(sb) {
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  let channel = null;

  return {
    demo: false,
    async getUser() { const { data } = await sb.auth.getSession(); return data.session?.user ?? null; },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          // User tapped the reset link in their email: let them pick a new password
          setTimeout(async () => {
            const pw = prompt('Choose a new password (at least 6 characters):');
            if (pw && pw.length >= 6) {
              const { error } = await sb.auth.updateUser({ password: pw });
              alert(error ? error.message : 'Password updated!');
            }
          }, 300);
        }
        cb(session?.user ?? null);
      });
    },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password) {
      const data = ok(await sb.auth.signUp({
        email, password, options: { emailRedirectTo: location.origin + location.pathname },
      }));
      return { needsConfirm: !data.session };
    },
    async resetPassword(email) {
      ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
    },
    async signOut() { await sb.auth.signOut(); },
    async rpc(fn, args) { return ok(await sb.rpc(fn, args)); },
    async select(table) {
      // page through results (Supabase returns at most 1000 rows per request)
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const page = ok(await sb.from(table).select(COLUMNS[table] || '*').range(from, from + 999));
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    },
    async fn(name, body) {
      const { data, error } = await sb.functions.invoke(name, { body });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch { /* keep generic message */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, id, patch) { ok(await sb.from(table).update(patch).eq('id', id)); },
    async remove(table, id) { ok(await sb.from(table).delete().eq('id', id)); },
    async updateWhere(table, col, val, patch) { ok(await sb.from(table).update(patch).eq(col, val)); },
    async removeWhere(table, col, val) { ok(await sb.from(table).delete().eq(col, val)); },
    async removeMany(table, ids) { if (ids.length) ok(await sb.from(table).delete().in('id', ids)); },
    async uploadPhoto(householdId, blob, bucket = BUCKET) {
      const path = `${householdId}/${crypto.randomUUID()}.jpg`;
      ok(await sb.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' }));
      return path;
    },
    async deletePhoto(path, bucket = BUCKET) { if (path) await sb.storage.from(bucket).remove([path]); },
    async photoUrls(paths, bucket = BUCKET) {
      if (!paths.length) return {};
      const data = ok(await sb.storage.from(bucket).createSignedUrls(paths, 60 * 60 * 12));
      return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    },
    subscribe(onChange) {
      if (channel) sb.removeChannel(channel);
      channel = sb.channel('homebase-live')
        .on('postgres_changes', { event: '*', schema: 'public' }, (p) => onChange(p.table))
        .subscribe();
    },
  };
}

// ---------------------------------------------------------------- Demo
function createDemoBackend() {
  const uid = () => crypto.randomUUID();
  const now = Date.now();
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const dateOnly = (ms) => new Date(ms).toISOString().slice(0, 10);

  const hid = uid();
  const rob = uid(), nic = uid(), har = uid(), kid2 = uid();
  const groc = uid(), todo = uid(), rem = uid();
  const db = {
    households: [{ id: hid, name: 'The Colon Family', join_code: 'HB7K2Q', created_at: iso(now), timezone: 'America/New_York', weather_place: 'Sarasota, FL', weather_lat: 27.3364, weather_lon: -82.5307 }],
    members: [
      { id: rob, household_id: hid, user_id: 'demo-user', name: 'Robert', kind: 'parent', color: '#5B8DEF', emoji: '🧔', sort: 0 },
      { id: nic, household_id: hid, user_id: 'demo-2', name: 'Nicole', kind: 'parent', color: '#E57373', emoji: '👩', sort: 1 },
      { id: har, household_id: hid, user_id: null, name: 'Harper', kind: 'kid', color: '#F28CB1', emoji: '🦄', sort: 11 },
      { id: kid2, household_id: hid, user_id: null, name: 'Kid 2', kind: 'kid', color: '#7BC67E', emoji: '🐻', sort: 12 },
    ],
    lists: [
      { id: groc, household_id: hid, name: 'Groceries', kind: 'shopping', emoji: '🛒', sort: 0 },
      { id: todo, household_id: hid, name: 'To-Do', kind: 'todo', emoji: '✅', sort: 1 },
      { id: rem, household_id: hid, name: 'Reminders', kind: 'reminders', emoji: '🔔', sort: 2 },
    ],
    list_items: [],
    messages: [],
    countdowns: [],
    stores: [],
    catalog: [],
    catalog_locations: [],
    google_accounts: [],
    calendars: [],
    events: [],
    event_private: [],
    photos: [],
    kid_profiles: [],
    chores: [],
    routines: [],
    rewards: [],
    completions: [],
    push_subscriptions: [],
  };

  // ---- demo kids data
  db.kid_profiles.push({ member_id: har, household_id: hid, pet_kind: 'puppy', pet_name: 'Biscuit', morning_start: '06:45',
    wake_time: '07:00', bedtime_start: '19:15', sleep_time: '20:00', voice: true });
  const chore = (title, emoji, points, extra = {}) => {
    const c = { id: uid(), household_id: hid, member_id: har, title, emoji, points, schedule: 'days', days: [0, 1, 2, 3, 4, 5, 6],
      due_date: null, time_of_day: 'anytime', photo_proof: false, active: true, sort: db.chores.length, created_at: iso(now), ...extra };
    db.chores.push(c); return c;
  };
  const toys = chore('Pick up toys', '🧸', 2, { time_of_day: 'evening' });
  chore('Clear your plate', '🍽️', 1);
  const feed = chore('Feed the pets', '🐾', 2, { time_of_day: 'morning' });
  chore('Clothes in hamper', '🧺', 1, { time_of_day: 'evening' });
  chore('Water the plants', '🪴', 3, { days: [6], photo_proof: true });
  chore('Make your bed', '🛏️', 2, { time_of_day: 'morning', photo_proof: true });
  chore('Match the socks', '🧦', 3, { schedule: 'weekly' });
  const rr = (kind, steps, points = 5) => db.routines.push({ id: uid(), household_id: hid, member_id: har, kind, points, steps });
  rr('morning', [['🚽', 'Go potty'], ['🪥', 'Brush your teeth'], ['👗', 'Get dressed'], ['🥣', 'Eat breakfast'], ['🎒', 'Get your backpack']].map(([emoji, title]) => ({ emoji, title })));
  rr('bedtime', [['🧸', 'Clean up toys'], ['🛁', 'Bath time'], ['👕', 'Put on pajamas'], ['🪥', 'Brush your teeth'], ['🚽', 'Go potty'], ['📖', 'Story time'], ['💤', 'Lights out']].map(([emoji, title]) => ({ emoji, title })));
  [['🍦', 'Ice cream treat', 15], ['🎬', 'Pick the family movie', 20], ['🛝', 'Park trip with Dad', 25], ['🌙', 'Stay up 15 min late', 25], ['🎨', 'New coloring book', 30], ['🧸', 'Small toy', 50]]
    .forEach(([emoji, title, cost], i) => db.rewards.push({ id: uid(), household_id: hid, member_id: null, title, emoji, cost, active: true, sort: i, created_at: iso(now) }));
  const dayStr = (d) => { const x = new Date(Date.now() + d * day); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const done = (kind, ref, title, emoji, points, d, extra = {}) => db.completions.push({ id: uid(), household_id: hid, member_id: har, kind, ref_id: ref,
    title, emoji, day: dayStr(d), points, status: 'approved', photo_path: null, note: null, created_by: nic, created_at: iso(now + d * day), ...extra });
  for (let d = -9; d < 0; d++) { done('chore', toys.id, 'Pick up toys', '🧸', 2, d); done('chore', feed.id, 'Feed the pets', '🐾', 2, d); done('routine', null, 'Morning routine', '☀️', 5, d); }
  done('bonus', null, 'Helped Mom with groceries', '🌟', 3, -2, { note: 'Helped carry bags' });
  done('redeem', null, 'Ice cream treat', '🍦', -15, -3);
  done('chore', feed.id, 'Feed the pets', '🐾', 2, 0);

  // ---- demo calendars & events
  const accWork = uid(), accRob = uid(), accNic = uid();
  db.google_accounts.push(
    { id: accWork, household_id: hid, member_id: rob, google_email: 'robert@inspiredvision.tax', status: 'ok', last_sync: iso(now) },
    { id: accRob, household_id: hid, member_id: rob, google_email: 'robert.personal@gmail.com', status: 'ok', last_sync: iso(now) },
    { id: accNic, household_id: hid, member_id: nic, google_email: 'nicole@gmail.com', status: 'ok', last_sync: iso(now) },
  );
  const calWork = uid(), calRob = uid(), calNic = uid(), calFam = uid(), calHol = uid();
  const calRow = (id, account_id, name, member_id, color, extra = {}) => ({
    id, household_id: hid, account_id, google_calendar_id: name, name, google_color: color, color, member_id,
    is_work: false, show: true, can_write: true, ...extra, show_on_home: !extra.is_work,
  });
  db.calendars.push(
    calRow(calWork, accWork, 'robert@inspiredvision.tax', rob, '#5B8DEF', { is_work: true }),
    calRow(calRob, accRob, 'Robert', rob, '#5B8DEF'),
    calRow(calNic, accNic, 'Nicole', nic, '#E57373'),
    calRow(calFam, accNic, 'Family', null, '#2F6F6A'),
    calRow(calHol, accRob, 'Holidays in United States', null, '#7BC67E', { show: false, can_write: false }),
  );
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const at = (d, h, m = 0) => new Date(startOfToday.getTime() + d * day + (h * 60 + m) * 60000);
  const ymd = (d) => { const x = new Date(startOfToday.getTime() + d * day); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const ev = (calendar_id, title, d, h, m, durMin, extra = {}) => {
    const id = uid();
    const isWork = calendar_id === calWork;
    db.events.push({ id, household_id: hid, calendar_id, google_event_id: id, recurring_id: extra.recurring_id || null,
      title: isWork ? 'Work Meeting' : title, location: isWork ? null : (extra.location || null), notes: null, all_day: false,
      start_at: iso(at(d, h, m)), end_at: iso(at(d, h, m + durMin)), start_date: null, end_date: null, private: isWork });
    if (isWork) db.event_private.push({ event_id: id, household_id: hid, member_id: rob, title, location: extra.location || null, notes: null });
  };
  const allDay = (calendar_id, title, d, days = 1) => {
    const id = uid();
    db.events.push({ id, household_id: hid, calendar_id, google_event_id: id, title, all_day: true,
      start_at: iso(at(d, 12)), end_at: iso(at(d + days, 12)), start_date: ymd(d), end_date: ymd(d + days), private: false });
  };
  for (let d = -3; d < 35; d++) {
    const wd = new Date(startOfToday.getTime() + d * day).getDay();
    if (wd >= 1 && wd <= 5) {
      ev(calWork, ['Client call — Hixson', 'Tax planning: Sgroi PT', 'Review 990 draft', 'Team standup', 'Valuation call'][(d + 10) % 5], d, 10, 0, 60, { location: 'Zoom' });
      if (wd === 2 || wd === 4) ev(calWork, 'Meeting with Monmouth Dental', d, 14, 30, 45);
      ev(calFam, 'School drop-off', d, 7, 45, 20, { recurring_id: 'drop' });
    }
    if (wd === 3) ev(calNic, 'Pilates', d, 18, 0, 60);
    if (wd === 6) ev(calFam, 'Harper swim lesson', d, 9, 30, 45, { location: 'YMCA' });
    if (wd === 0) ev(calFam, 'Church', d, 10, 0, 90);
  }
  ev(calRob, 'Gym', 0, 6, 0, 60); ev(calNic, 'Coffee with Sarah', 1, 11, 0, 60, { location: 'Starbucks' });
  ev(calFam, 'Dinner at Mom & Dad\'s', 2, 17, 0, 120); ev(calRob, 'Formella walkthrough', 3, 15, 0, 60, { location: '7535 Castle Dr' });
  ev(calFam, 'Pediatrician — Harper', 6, 9, 0, 45);
  allDay(calFam, 'Thanksgiving', 5); allDay(calNic, 'Girls weekend', 12, 3); allDay(calRob, 'Trash pickup', 1);

  // ---- demo photo-frame pictures (simple painted scenes)
  const scene = (sky1, sky2, ground, sun) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>`
    + `<rect width="1600" height="1000" fill="url(#s)"/><circle cx="1150" cy="330" r="110" fill="${sun}" opacity=".9"/>`
    + `<path d="M0 720 Q400 600 800 700 T1600 660 V1000 H0Z" fill="${ground}"/><path d="M0 820 Q500 740 1000 820 T1600 800 V1000 H0Z" fill="#000" opacity=".15"/></svg>`);
  const demoPhotos = {
    'demo/1.jpg': scene('#FFB88C', '#FFE3C2', '#2F6F6A', '#FFF4D6'),
    'demo/2.jpg': scene('#6EC6FF', '#D6F0FF', '#4E9F3D', '#FFF59D'),
    'demo/3.jpg': scene('#2C3E73', '#E58C8A', '#1E2A3A', '#FFD7A8'),
    'demo/4.jpg': scene('#9ED8DB', '#F6F7D7', '#E9B872', '#FFFFFF'),
  };
  Object.keys(demoPhotos).forEach((path) => db.photos.push({ id: uid(), household_id: hid, path, uploaded_by: nic, created_at: iso(now) }));
  const photos = { ...demoPhotos };
  const publix = uid(), costco = uid();
  db.stores.push(
    { id: publix, household_id: hid, name: 'Publix', emoji: '🟢', sort: 0, section_order: ['Produce', 'Bakery', 'Deli', 'Aisle 3', 'Aisle 7', 'Dairy', 'Frozen'] },
    { id: costco, household_id: hid, name: 'Costco', emoji: '🔴', sort: 1, section_order: [] },
  );
  const cat = (name, emoji, use_count, locs = {}, notes = null) => {
    const id = uid();
    db.catalog.push({ id, household_id: hid, name, emoji, photo_path: null, notes, use_count, last_used: iso(now - use_count * 3600e3), created_at: iso(now) });
    for (const [store, section] of Object.entries(locs)) {
      db.catalog_locations.push({ id: uid(), household_id: hid, catalog_id: id, store_id: store === 'p' ? publix : costco, section });
    }
    return id;
  };
  const C = {
    milk: cat('Milk', '🥛', 30, { p: 'Dairy', c: 'Fridge wall' }, 'Organic whole milk, red cap'),
    straw: cat('Strawberries', '🍓', 14, { p: 'Produce' }),
    gold: cat('Goldfish crackers', '🐟', 12, { p: 'Aisle 7', c: 'Snack aisle' }, 'Harper likes the colors ones'),
    coffee: cat('Coffee beans', '☕', 9, { p: 'Aisle 3' }),
    ban: cat('Bananas', '🍌', 25, { p: 'Produce', c: 'Produce room' }),
  };
  cat('Eggs', '🥚', 22, { p: 'Dairy' }); cat('Bread', '🍞', 18, { p: 'Bakery' }); cat('Chicken breast', '🍗', 11, { c: 'Meat' });
  cat('Apple juice', '🧃', 8, { p: 'Aisle 3' }); cat('Paper towels', '🧻', 6, { c: 'Paper goods' }); cat('Cheddar cheese', '🧀', 10, { p: 'Deli' });
  cat('Frozen peas', '🫛', 4, { p: 'Frozen' }); cat('Yogurt pouches', '🥄', 13, { p: 'Dairy' });
  const item = (list_id, text, extra = {}) => db.list_items.push({
    id: uid(), household_id: hid, list_id, text, note: null, done: false, done_at: null, done_by: null,
    assigned_to: null, due_at: null, created_by: rob, created_at: iso(now - Math.random() * day), ...extra,
  });
  item(groc, 'Milk', { catalog_id: C.milk }); item(groc, 'Strawberries', { created_by: nic, catalog_id: C.straw });
  item(groc, 'Goldfish crackers', { note: 'The big carton', catalog_id: C.gold });
  item(groc, 'Coffee beans', { catalog_id: C.coffee }); item(groc, 'Dish soap');
  item(groc, 'Bananas', { done: true, done_at: iso(now - 3600e3), done_by: nic, catalog_id: C.ban });
  item(todo, 'Call Formella about cabinets', { assigned_to: rob });
  item(todo, 'Schedule pediatrician visit', { assigned_to: nic, due_at: iso(now + 2 * day) });
  item(todo, 'Return library books', { assigned_to: har });
  item(rem, 'Trash & recycling out', { due_at: iso(now + 0.4 * day) });
  item(rem, 'Pay water bill', { due_at: iso(now - 0.5 * day) });
  item(rem, 'Picture day — wear the blue dress', { due_at: iso(now + 4 * day), assigned_to: har });
  db.messages.push(
    { id: uid(), household_id: hid, author_id: nic, body: 'Dinner at Mom & Dad\'s on Sunday at 5! 🍝', color: '#FFE58F', pinned: true, created_at: iso(now - 7200e3) },
    { id: uid(), household_id: hid, author_id: rob, body: 'Plumber is coming Tuesday between 9–11.', color: '#B5E3F7', pinned: false, created_at: iso(now - 26e6) },
    { id: uid(), household_id: hid, author_id: nic, body: 'Proud of Harper for reading 3 sight words today!', color: '#FFC8DD', pinned: false, created_at: iso(now - 60e6) },
  );
  db.countdowns.push(
    { id: uid(), household_id: hid, title: 'Thanksgiving', emoji: '🦃', target_date: dateOnly(now + 5 * day) },
    { id: uid(), household_id: hid, title: 'Christmas', emoji: '🎄', target_date: dateOnly(now + 34 * day) },
    { id: uid(), household_id: hid, title: 'Harper\'s birthday', emoji: '🎂', target_date: dateOnly(now + 96 * day) },
  );

  let user = { id: 'demo-user', email: 'demo@homebase.app' };
  let authCb = () => {};
  let changeCb = () => {};
  const changed = (t) => setTimeout(() => changeCb(t), 0);

  return {
    demo: true,
    async getUser() { return user; },
    onAuthChange(cb) { authCb = cb; },
    async signIn(email) { user = { id: 'demo-user', email }; authCb(user); },
    async signUp(email) { user = { id: 'demo-user', email }; authCb(user); return { needsConfirm: false }; },
    async resetPassword() {},
    async signOut() { user = null; authCb(null); },
    async fn(name, b = {}) {
      await new Promise((r) => setTimeout(r, 150));
      if (name === 'notify') { console.info('[demo] notify', b); return { ok: true, sent: 0 }; }
      if (b.action === 'sync') return { skipped: true };
      if (b.action === 'auth_url') return { url: location.pathname + '?demo&code=demo&state=demo' };
      if (b.action === 'connect') return { ok: true, email: 'new.account@gmail.com' };
      if (b.action === 'disconnect') {
        const cals = db.calendars.filter((c) => c.account_id === b.account_id).map((c) => c.id);
        db.events = db.events.filter((e) => !cals.includes(e.calendar_id));
        db.calendars = db.calendars.filter((c) => c.account_id !== b.account_id);
        db.google_accounts = db.google_accounts.filter((a) => a.id !== b.account_id);
        changed('calendars'); return { ok: true };
      }
      if (b.action === 'save_event') {
        const cal = db.calendars.find((c) => c.id === b.calendar_id);
        const row = {
          calendar_id: b.calendar_id, title: cal.is_work ? 'Work Meeting' : b.title, location: cal.is_work ? null : (b.location || null),
          notes: cal.is_work ? null : (b.notes || null), all_day: !!b.all_day, private: cal.is_work,
          start_at: b.all_day ? `${b.start_date}T12:00:00Z` : b.start, end_at: b.all_day ? `${b.end_date}T12:00:00Z` : b.end,
          start_date: b.all_day ? b.start_date : null, end_date: b.all_day ? b.end_date : null,
        };
        let id = b.event_id;
        if (id) Object.assign(db.events.find((e) => e.id === id), row);
        else { id = uid(); db.events.push({ id, household_id: hid, google_event_id: id, ...row }); }
        if (cal.is_work) {
          db.event_private = db.event_private.filter((p) => p.event_id !== id);
          db.event_private.push({ event_id: id, household_id: hid, member_id: rob, title: b.title, location: b.location || null, notes: b.notes || null });
        }
        changed('events'); return { ok: true };
      }
      if (b.action === 'delete_event') {
        const e = db.events.find((x) => x.id === b.event_id);
        db.events = db.events.filter((x) => x.id !== b.event_id && !(b.all_repeats && e.recurring_id && x.recurring_id === e.recurring_id));
        changed('events'); return { ok: true };
      }
      throw new Error('Unknown action');
    },
    async rpc(fn, args = {}) {
      if (fn === 'remember_item') {
        const key = args.p_name.trim().toLowerCase();
        let c = db.catalog.find((x) => x.name.trim().toLowerCase() === key);
        if (c) { c.use_count += 1; c.last_used = iso(Date.now()); }
        else {
          c = { id: uid(), household_id: hid, name: args.p_name.trim(), emoji: args.p_emoji || '🛒', photo_path: null, notes: null, use_count: 1, last_used: iso(Date.now()), created_at: iso(Date.now()) };
          db.catalog.push(c);
        }
        changed('catalog');
        return c.id;
      }
      if (fn === 'set_calendar_home') {
        const c = db.calendars.find((x) => x.id === args.p_calendar_id); if (c) c.show_on_home = args.p_show;
        changed('calendars'); return null;
      }
      if (fn === 'reset_join_code') {
        db.households[0].join_code = Math.random().toString(36).slice(2, 8).toUpperCase();
        changed('households');
        return db.households[0].join_code;
      }
      return hid;
    },
    async select(table) { return structuredClone(db[table]); },
    async insert(table, row) {
      const full = { id: uid(), created_at: iso(Date.now()), ...row };
      db[table].push(full); changed(table); return structuredClone(full);
    },
    async update(table, id, patch) {
      const r = db[table].find((x) => x.id === id); if (r) Object.assign(r, patch); changed(table);
    },
    async remove(table, id) {
      db[table] = db[table].filter((x) => x.id !== id);
      if (table === 'lists') db.list_items = db.list_items.filter((i) => i.list_id !== id);
      if (table === 'catalog') {
        db.catalog_locations = db.catalog_locations.filter((l) => l.catalog_id !== id);
        db.list_items.forEach((i) => { if (i.catalog_id === id) i.catalog_id = null; });
      }
      if (table === 'stores') db.catalog_locations = db.catalog_locations.filter((l) => l.store_id !== id);
      changed(table);
    },
    async removeMany(table, ids) { db[table] = db[table].filter((x) => !ids.includes(x.id)); changed(table); },
    async updateWhere(table, col, val, patch) { db[table].filter((x) => x[col] === val).forEach((x) => Object.assign(x, patch)); changed(table); },
    async removeWhere(table, col, val) { db[table] = db[table].filter((x) => x[col] !== val); changed(table); },
    async uploadPhoto(householdId, blob, _bucket) { const path = `${householdId}/${uid()}.jpg`; photos[path] = URL.createObjectURL(blob); return path; },
    async deletePhoto(path) { delete photos[path]; },
    async photoUrls(paths) { return Object.fromEntries(paths.filter((p) => photos[p]).map((p) => [p, photos[p]])); },
    subscribe(cb) { changeCb = cb; },
  };
}
