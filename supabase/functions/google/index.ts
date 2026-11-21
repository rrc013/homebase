// =====================================================================
// Homebase — "google" server function (Supabase Edge Function)
// Connects family Google accounts and keeps Google Calendar and Homebase
// in sync both ways. Paste this whole file into:
//   Supabase → Edge Functions → Deploy a new function → Via Editor
//   Function name: google
// Secrets needed (Edge Functions → Secrets): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// =====================================================================
import postgres from 'npm:postgres@3.4.5';

const env = (k: string) => Deno.env.get(k) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
const ANON_KEY = env('SUPABASE_ANON_KEY');
// deno-lint-ignore no-explicit-any
const sql: any = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 3, idle_timeout: 20 });

const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');
const PAST_DAYS = 31;      // keep a month of history
const FUTURE_DAYS = 366;   // and a year ahead
const MIN_SYNC_GAP_MS = 60_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ------------------------------------------------------------------ auth
async function currentMember(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } });
  if (!r.ok) throw new HttpError(401, 'Please sign in again');
  const user = await r.json();
  const [m] = await sql`select * from public.members where user_id = ${user.id}`;
  if (!m) throw new HttpError(403, 'Not in a household');
  return m;
}

// ------------------------------------------------------------------ Google helpers
async function googleToken(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params }),
  });
  const data = await r.json();
  if (!r.ok) throw new HttpError(400, data.error === 'invalid_grant' ? 'invalid_grant' : `Google: ${data.error_description || data.error}`);
  return data;
}

async function accessTokenFor(account: any) {
  try {
    const t = await googleToken({ grant_type: 'refresh_token', refresh_token: account.refresh_token });
    if (account.status !== 'ok') await sql`update public.google_accounts set status = 'ok' where id = ${account.id}`;
    return t.access_token as string;
  } catch (e) {
    if ((e as Error).message === 'invalid_grant') {
      await sql`update public.google_accounts set status = 'reconnect' where id = ${account.id}`;
      throw new HttpError(400, `${account.google_email} needs to be reconnected`);
    }
    throw e;
  }
}

async function gapi(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (r.status === 204 || r.status === 410) return null; // deleted / already gone
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status === 403 ? 403 : 400, `Google Calendar: ${data?.error?.message || r.status}`);
  return data;
}

const enc = encodeURIComponent;
const decodeJwt = (t: string) => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

// ------------------------------------------------------------------ calendars
async function refreshCalendars(account: any, token: string) {
  const items: any[] = [];
  let pageToken = '';
  do {
    const d = await gapi(token, `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${enc(pageToken)}` : ''}`);
    items.push(...(d?.items ?? []));
    pageToken = d?.nextPageToken ?? '';
  } while (pageToken);

  const existing = await sql`select * from public.calendars where account_id = ${account.id}`;
  const byGid = new Map(existing.map((c: any) => [c.google_calendar_id, c]));
  const [owner] = await sql`select * from public.members where id = ${account.member_id}`;
  const personal = /@(gmail|googlemail)\.com$/i.test(account.google_email);

  for (const it of items) {
    const name = it.summaryOverride || it.summary || it.id;
    const canWrite = ['owner', 'writer'].includes(it.accessRole);
    const prev: any = byGid.get(it.id);
    if (prev) {
      await sql`update public.calendars set name = ${name}, google_color = ${it.backgroundColor ?? null}, can_write = ${canWrite}
                where id = ${prev.id}`;
      byGid.delete(it.id);
    } else {
      await sql`insert into public.calendars
        (household_id, account_id, google_calendar_id, name, google_color, color, member_id, is_work, show, can_write)
        values (${account.household_id}, ${account.id}, ${it.id}, ${name}, ${it.backgroundColor ?? null}, ${owner?.color ?? null},
                ${account.member_id}, ${!!it.primary && !personal}, ${!!it.primary}, ${canWrite})`;
    }
  }
  const gone = [...byGid.values()].map((c: any) => c.id);
  if (gone.length) await sql`delete from public.calendars where id in ${sql(gone)}`;
}

// ------------------------------------------------------------------ events
function toRow(ev: any, cal: any) {
  const allDay = !!ev.start?.date;
  return {
    household_id: cal.household_id,
    calendar_id: cal.id,
    google_event_id: ev.id,
    recurring_id: ev.recurringEventId ?? null,
    title: cal.is_work ? 'Work Meeting' : (ev.summary || '(No title)'),
    location: cal.is_work ? null : (ev.location ?? null),
    notes: cal.is_work ? null : (ev.description ?? null),
    all_day: allDay,
    start_at: allDay ? `${ev.start.date}T12:00:00Z` : ev.start.dateTime,
    end_at: allDay ? `${ev.end.date}T12:00:00Z` : ev.end.dateTime,
    start_date: allDay ? ev.start.date : null,
    end_date: allDay ? ev.end.date : null,
    private: !!cal.is_work,
    updated_at: new Date().toISOString(),
  };
}
const EVENT_COLS = ['household_id', 'calendar_id', 'google_event_id', 'recurring_id', 'title', 'location', 'notes',
  'all_day', 'start_at', 'end_at', 'start_date', 'end_date', 'private', 'updated_at'];

async function saveEvents(cal: any, events: any[]) {
  const rows = events.filter((e) => e.status !== 'cancelled' && (e.start?.date || e.start?.dateTime)).map((e) => toRow(e, cal));
  const saved: any[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    saved.push(...await sql`
      insert into public.events ${sql(chunk, EVENT_COLS)}
      on conflict (calendar_id, google_event_id) do update set
        recurring_id = excluded.recurring_id, title = excluded.title, location = excluded.location, notes = excluded.notes,
        all_day = excluded.all_day, start_at = excluded.start_at, end_at = excluded.end_at,
        start_date = excluded.start_date, end_date = excluded.end_date, private = excluded.private, updated_at = excluded.updated_at
      returning id, google_event_id`);
  }
  // Work calendars: real details go in the owner-only table
  if (cal.is_work && saved.length) {
    const byG = new Map(events.map((e) => [e.id, e]));
    const priv = saved.map((s) => {
      const e: any = byG.get(s.google_event_id);
      return { event_id: s.id, household_id: cal.household_id, member_id: cal.owner_member_id,
        title: e?.summary || '(No title)', location: e?.location ?? null, notes: e?.description ?? null };
    });
    for (let i = 0; i < priv.length; i += 500) {
      await sql`insert into public.event_private ${sql(priv.slice(i, i + 500), ['event_id', 'household_id', 'member_id', 'title', 'location', 'notes'])}
        on conflict (event_id) do update set title = excluded.title, location = excluded.location, notes = excluded.notes,
          member_id = excluded.member_id`;
    }
  }
  return saved;
}

async function syncCalendar(cal: any, token: string) {
  const timeMin = new Date(Date.now() - PAST_DAYS * 864e5).toISOString();
  const timeMax = new Date(Date.now() + FUTURE_DAYS * 864e5).toISOString();
  const all: any[] = [];
  let pageToken = '';
  do {
    const q = `timeMin=${enc(timeMin)}&timeMax=${enc(timeMax)}&singleEvents=true&maxResults=2500${pageToken ? `&pageToken=${enc(pageToken)}` : ''}`;
    const d = await gapi(token, `/calendars/${enc(cal.google_calendar_id)}/events?${q}`);
    all.push(...(d?.items ?? []));
    pageToken = d?.nextPageToken ?? '';
  } while (pageToken);

  const saved = await saveEvents(cal, all);
  const keep = saved.map((s) => s.google_event_id);
  // remove anything deleted in Google
  if (keep.length) await sql`delete from public.events where calendar_id = ${cal.id} and google_event_id not in ${sql(keep)}`;
  else await sql`delete from public.events where calendar_id = ${cal.id}`;
  if (!cal.is_work) await sql`delete from public.event_private where event_id in (select id from public.events where calendar_id = ${cal.id})`;
  return keep.length;
}

async function syncHousehold(householdId: string, force = false) {
  const accounts = await sql`select * from public.google_accounts where household_id = ${householdId}`;
  if (!force) {
    const recent = accounts.some((a: any) => a.last_sync && Date.now() - new Date(a.last_sync).getTime() < MIN_SYNC_GAP_MS);
    if (recent) return { skipped: true };
  }
  const result: any = { accounts: 0, events: 0, errors: [] as string[] };
  for (const acct of accounts) {
    try {
      const token = await accessTokenFor(acct);
      await refreshCalendars(acct, token);
      const cals = await sql`
        select c.*, a.member_id as owner_member_id from public.calendars c
        join public.google_accounts a on a.id = c.account_id where c.account_id = ${acct.id}`;
      for (const cal of cals) {
        if (cal.show) result.events += await syncCalendar(cal, token);
        else await sql`delete from public.events where calendar_id = ${cal.id}`;
      }
      await sql`update public.google_accounts set last_sync = now() where id = ${acct.id}`;
      result.accounts++;
    } catch (e) {
      result.errors.push((e as Error).message);
    }
  }
  return result;
}

// ------------------------------------------------------------------ actions
async function calendarFor(member: any, calendarId: string) {
  const [cal] = await sql`
    select c.*, a.member_id as owner_member_id, a.id as acct_id from public.calendars c
    join public.google_accounts a on a.id = c.account_id
    where c.id = ${calendarId} and c.household_id = ${member.household_id}`;
  if (!cal) throw new HttpError(404, 'Calendar not found');
  if (cal.is_work && cal.owner_member_id !== member.id) throw new HttpError(403, 'Only the owner can change work events');
  if (!cal.can_write) throw new HttpError(403, `"${cal.name}" is read-only`);
  const [acct] = await sql`select * from public.google_accounts where id = ${cal.acct_id}`;
  return { cal, token: await accessTokenFor(acct) };
}

function googleBody(b: any) {
  const body: any = { summary: b.title, location: b.location || null, description: b.notes || null };
  if (b.all_day) {
    body.start = { date: b.start_date };
    body.end = { date: b.end_date };
  } else {
    body.start = { dateTime: b.start, timeZone: b.time_zone || 'America/New_York' };
    body.end = { dateTime: b.end, timeZone: b.time_zone || 'America/New_York' };
  }
  if (b.repeat && b.repeat !== 'none') body.recurrence = [`RRULE:FREQ=${b.repeat}`];
  return body;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const member = await currentMember(req);
    const b = await req.json().catch(() => ({}));

    switch (b.action) {
      // Step 1 of connecting: build the Google sign-in link
      case 'auth_url': {
        if (member.kind !== 'parent') throw new HttpError(403, 'Parents only');
        const state = crypto.randomUUID();
        await sql`delete from public.oauth_states where created_at < now() - interval '1 hour'`;
        await sql`insert into public.oauth_states (state, household_id, member_id) values (${state}, ${member.household_id}, ${member.id})`;
        const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
          client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: b.redirect_uri, response_type: 'code', scope: SCOPES,
          access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true', state,
        });
        return json({ url });
      }

      // Step 2: Google sent the person back with a code
      case 'connect': {
        const [st] = await sql`delete from public.oauth_states where state = ${b.state} and member_id = ${member.id}
                               and created_at > now() - interval '20 minutes' returning *`;
        if (!st) throw new HttpError(400, 'That sign-in link expired — please try connecting again');
        const t = await googleToken({ grant_type: 'authorization_code', code: b.code, redirect_uri: b.redirect_uri });
        const email = t.id_token ? decodeJwt(t.id_token).email : null;
        if (!email) throw new HttpError(400, 'Google did not share the account email');
        let refresh = t.refresh_token;
        if (!refresh) {
          const [old] = await sql`select refresh_token from public.google_accounts where household_id = ${member.household_id} and google_email = ${email}`;
          refresh = old?.refresh_token;
        }
        if (!refresh) throw new HttpError(400, 'Google did not return offline access. Remove Homebase at myaccount.google.com → Security → Third-party connections, then connect again.');
        const [acct] = await sql`
          insert into public.google_accounts (household_id, member_id, google_email, refresh_token, status)
          values (${member.household_id}, ${member.id}, ${email}, ${refresh}, 'ok')
          on conflict (household_id, google_email) do update set refresh_token = excluded.refresh_token, status = 'ok', member_id = excluded.member_id
          returning *`;
        await refreshCalendars(acct, t.access_token);
        const sync = await syncHousehold(member.household_id, true);
        return json({ ok: true, email, sync });
      }

      case 'sync':
        return json(await syncHousehold(member.household_id, !!b.force));

      case 'save_event': {
        const { cal, token } = await calendarFor(member, b.calendar_id);
        const body = googleBody(b);
        let gid: string;
        if (b.event_id) {
          const [ev] = await sql`select * from public.events where id = ${b.event_id} and calendar_id = ${cal.id}`;
          if (!ev) throw new HttpError(404, 'Event not found');
          delete body.recurrence; // editing changes just this occurrence
          const updated = await gapi(token, `/calendars/${enc(cal.google_calendar_id)}/events/${enc(ev.google_event_id)}`,
            { method: 'PATCH', body: JSON.stringify(body) });
          gid = updated.id;
        } else {
          const created = await gapi(token, `/calendars/${enc(cal.google_calendar_id)}/events`, { method: 'POST', body: JSON.stringify(body) });
          gid = created.id;
        }
        await syncCalendar(cal, token); // pulls in repeats too
        return json({ ok: true, google_event_id: gid });
      }

      case 'delete_event': {
        const [ev] = await sql`select * from public.events where id = ${b.event_id} and household_id = ${member.household_id}`;
        if (!ev) throw new HttpError(404, 'Event not found');
        const { cal, token } = await calendarFor(member, ev.calendar_id);
        const target = b.all_repeats && ev.recurring_id ? ev.recurring_id : ev.google_event_id;
        await gapi(token, `/calendars/${enc(cal.google_calendar_id)}/events/${enc(target)}`, { method: 'DELETE' });
        await syncCalendar(cal, token);
        return json({ ok: true });
      }

      case 'disconnect': {
        const [acct] = await sql`select * from public.google_accounts where id = ${b.account_id} and member_id = ${member.id}`;
        if (!acct) throw new HttpError(404, 'Account not found');
        await fetch(`https://oauth2.googleapis.com/revoke?token=${enc(acct.refresh_token)}`, { method: 'POST' }).catch(() => {});
        await sql`delete from public.google_accounts where id = ${acct.id}`;
        return json({ ok: true });
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
