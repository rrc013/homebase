// Data layer: one small API, two backends.
//  - Supabase (real data, live sync across devices)
//  - Demo (in-memory sample data, used when config.js is blank or ?demo is in the URL)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABLES = ['households', 'members', 'lists', 'list_items', 'messages', 'countdowns'];

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
    async select(table) { return ok(await sb.from(table).select('*')); },
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, id, patch) { ok(await sb.from(table).update(patch).eq('id', id)); },
    async remove(table, id) { ok(await sb.from(table).delete().eq('id', id)); },
    async removeMany(table, ids) { if (ids.length) ok(await sb.from(table).delete().in('id', ids)); },
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
    households: [{ id: hid, name: 'The Colon Family', join_code: 'HB7K2Q', created_at: iso(now) }],
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
  };
  const item = (list_id, text, extra = {}) => db.list_items.push({
    id: uid(), household_id: hid, list_id, text, note: null, done: false, done_at: null, done_by: null,
    assigned_to: null, due_at: null, created_by: rob, created_at: iso(now - Math.random() * day), ...extra,
  });
  item(groc, 'Milk'); item(groc, 'Strawberries', { created_by: nic }); item(groc, 'Goldfish crackers', { note: 'The big carton' });
  item(groc, 'Coffee beans'); item(groc, 'Bananas', { done: true, done_at: iso(now - 3600e3), done_by: nic });
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
    async rpc(fn) {
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
      changed(table);
    },
    async removeMany(table, ids) { db[table] = db[table].filter((x) => !ids.includes(x.id)); changed(table); },
    subscribe(cb) { changeCb = cb; },
  };
}
