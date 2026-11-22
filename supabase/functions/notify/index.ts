// =====================================================================
// Homebase — "notify" server function (Supabase Edge Function)
// Sends phone notifications: a task was assigned to you, a reminder is due,
// a kid needs approval. Paste this whole file into:
//   Supabase → Edge Functions → Deploy a new function → Via Editor
//   Function name: notify      ⚠️ Turn OFF "Verify JWT" (this function checks sign-in itself,
//   and the every-minute reminder check uses its own secret key)
// No secrets to add: notification keys are created automatically on first use.
// =====================================================================
import postgres from 'npm:postgres@3.4.5';
import webpush from 'npm:web-push@3.6.7';

const env = (k: string) => Deno.env.get(k) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
const ANON_KEY = env('SUPABASE_ANON_KEY');
// deno-lint-ignore no-explicit-any
const sql: any = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 3, idle_timeout: 20 });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function secret(key: string) {
  const [r] = await sql`select value from public.app_secrets where key = ${key}`;
  return r?.value as string | undefined;
}
async function vapidKeys() {
  let pub = await secret('vapid_public'), priv = await secret('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await sql`insert into public.app_secrets (key, value) values ('vapid_public', ${k.publicKey}), ('vapid_private', ${k.privateKey})
              on conflict (key) do nothing`;
    pub = await secret('vapid_public'); priv = await secret('vapid_private');
  }
  return { publicKey: pub!, privateKey: priv! };
}

async function currentMember(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } });
  if (!r.ok) throw new HttpError(401, 'Please sign in again');
  const user = await r.json();
  const [m] = await sql`select * from public.members where user_id = ${user.id}`;
  if (!m) throw new HttpError(403, 'Not in a household');
  return m;
}

// send one notification to every phone of the given people
async function sendTo(memberIds: string[], payload: { title: string; body: string; url?: string; tag?: string }) {
  if (!memberIds.length) return 0;
  const subs = await sql`select * from public.push_subscriptions where member_id in ${sql(memberIds)}`;
  if (!subs.length) return 0;
  const keys = await vapidKeys();
  let sent = 0;
  for (const s of subs) {
    try {
      const d = webpush.generateRequestDetails(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ icon: 'icons/icon-192.png', ...payload }),
        { vapidDetails: { subject: 'mailto:homebase@example.com', publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 6 * 3600, urgency: 'high' },
      );
      const r = await fetch(d.endpoint, { method: d.method, headers: d.headers as Record<string, string>, body: d.body });
      if (r.status === 404 || r.status === 410) await sql`delete from public.push_subscriptions where id = ${s.id}`; // phone unsubscribed
      else if (r.ok) sent++;
      else console.warn('push failed', r.status, await r.text().catch(() => ''));
    } catch (e) { console.warn('push error', (e as Error).message); }
  }
  return sent;
}

const fmtDue = (d: Date, tz: string) => d.toLocaleString('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' });

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));

    // ---- every-minute reminder check (called by the database scheduler)
    if (b.action === 'due') {
      const key = await secret('cron_key');
      if (!key || req.headers.get('x-cron-key') !== key) throw new HttpError(401, 'Bad key');
      const due = await sql`
        update public.list_items i set reminded_at = now()
        where not i.done and i.reminded_at is null and i.due_at is not null
          and i.due_at <= now() + interval '1 minute' and i.due_at > now() - interval '30 minutes'
        returning i.*`;
      let sent = 0;
      for (const item of due) {
        const [list] = await sql`select name, emoji from public.lists where id = ${item.list_id}`;
        const [who] = item.assigned_to ? await sql`select * from public.members where id = ${item.assigned_to}` : [null];
        // assigned to a parent → just them; unassigned or a kid's → both parents
        const targets = who?.kind === 'parent' ? [who.id]
          : (await sql`select id from public.members where household_id = ${item.household_id} and kind = 'parent'`).map((m: any) => m.id);
        sent += await sendTo(targets, {
          title: `⏰ ${item.text}`,
          body: `${who && who.kind !== 'parent' ? `For ${who.name} · ` : ''}${list ? `${list.emoji} ${list.name}` : 'Reminder'}`,
          url: './', tag: `due-${item.id}`,
        });
      }
      return json({ checked: due.length, sent });
    }

    const member = await currentMember(req);
    const [hh] = await sql`select * from public.households where id = ${member.household_id}`;
    const tz = hh?.timezone || 'America/New_York';

    switch (b.action) {
      case 'vapid':
        return json({ publicKey: (await vapidKeys()).publicKey });

      case 'test':
        return json({ sent: await sendTo([member.id], { title: '🏡 Homebase', body: 'Notifications are working on this phone!', url: './', tag: 'test' }) });

      case 'assigned': {
        const [item] = await sql`select * from public.list_items where id = ${b.item_id} and household_id = ${member.household_id}`;
        if (!item || !item.assigned_to || item.assigned_to === member.id) return json({ sent: 0 });
        const [who] = await sql`select * from public.members where id = ${item.assigned_to}`;
        if (who?.kind !== 'parent') return json({ sent: 0 });
        const [list] = await sql`select name, emoji from public.lists where id = ${item.list_id}`;
        const due = item.due_at ? ` · due ${fmtDue(new Date(item.due_at), tz)}` : '';
        return json({ sent: await sendTo([who.id], {
          title: `${member.name} gave you a task`, body: `${item.text}${due}${list ? ` (${list.emoji} ${list.name})` : ''}`,
          url: './', tag: `assigned-${item.id}`,
        }) });
      }

      case 'approval': {
        const [c] = await sql`select * from public.completions where id = ${b.completion_id} and household_id = ${member.household_id} and status = 'pending'`;
        if (!c) return json({ sent: 0 });
        const [kid] = await sql`select * from public.members where id = ${c.member_id}`;
        const parents = (await sql`select id from public.members where household_id = ${member.household_id} and kind = 'parent'`).map((m: any) => m.id);
        const payload = c.kind === 'redeem'
          ? { title: `🎁 ${kid?.name} wants a prize`, body: `${c.emoji} ${c.title} (${-c.points} ⭐) — tap to approve` }
          : c.kind === 'request'
            ? { title: `🎬 ${kid?.name} sent you a video`, body: 'Something good she did — watch it and choose her stars' }
            : { title: `📷 ${kid?.name} finished a job`, body: `${c.emoji} ${c.title} — check the photo and approve ${c.points} ⭐` };
        return json({ sent: await sendTo(parents, { ...payload, url: './?tab=kids', tag: `approval-${c.id}` }) });
      }

      default:
        throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, (e as HttpError).status || 500);
  }
}

if (import.meta.main) Deno.serve(handle);
