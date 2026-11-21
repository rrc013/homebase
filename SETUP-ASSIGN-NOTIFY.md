# Homebase update: Assigning tasks + Phone notifications

Allow about 15 minutes. **Do Phase 3 first** if you haven't yet; this builds on it.

## What's new
- **⭐ For me**: the first chip on the Lists tab shows everything assigned to you, across all lists, grouped as Overdue / Today / Coming up / Anytime. Anything you add there is assigned to you.
- **👤 Mine only / Everyone**: a toggle on each to-do or reminder list.
- **Quick assign while typing**: type `Call plumber @Nicole tomorrow 5pm` and it fills in the person and the due time. A preview appears under the box as you type. Examples:
  - `@nic` or `@me`
  - `today`, `tonight`, `tomorrow`, `friday`, `in 3 days`, `12/3`, `dec 15`
  - `5pm`, `at 5`, `2:30pm`, `noon`
- **👥 People** (on the hub): a column per family member showing today's events, their to-dos, and the kids' remaining jobs. Work meetings collapse to one line.
- **🔔 Phone notifications**:
  - when someone gives you a task
  - when a reminder comes due
  - when Harper sends a photo proof or asks for a prize
  
  Due reminders go to the person assigned. If no one is assigned, or it's Harper's, they go to both parents.

---

## 1. Prepare the files
1. Unzip the new **homebase.zip** and rename the folder `homebase-update`.
2. **Delete `js/config.js`** from that folder.

## 2. Run the database update
In Supabase, go to **SQL Editor** → **New query**, paste all of `supabase/06-notifications.sql`, and click **Run**.

## 3. Create the "notify" server function
1. Go to **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly **`notify`**.
3. Paste in all of `supabase/functions/notify/index.ts` and click **Deploy function**.
4. Open the new function's **Details** (or settings), turn **Verify JWT** **OFF**, and save. This one checks sign-in itself, and the every-minute reminder check uses its own secret key.
5. There are no secrets to add. The notification keys are created automatically the first time someone turns notifications on.

## 4. Turn on the every-minute reminder check
1. Open `supabase/07-reminder-schedule.sql` in Notepad.
2. Replace `YOUR-PROJECT-URL` with your Supabase Project URL, the same one in `js/config.js` (e.g. `https://abcd1234.supabase.co`). No trailing slash.
3. Paste it into a **New query** in the SQL Editor and click **Run**.

If it says *extension "pg_cron" is not available* or similar: go to **Database** → **Extensions**, turn on **pg_cron** and **pg_net**, then run it again.

## 5. Upload to GitHub
1. Click **Add file** → **Upload files**, drag in everything from `homebase-update`, and click **Commit changes**.
2. Confirm `js/config.js` still has your keys.
3. Wait 1–2 minutes, then fully close and reopen Homebase on each device.

## 6. Turn on notifications (each phone)
1. Open Homebase from the **home-screen icon**, then go to **Family** → **This device**.
2. Tap **🔔 Turn on notifications for this phone** and choose **Allow**.
3. Tap **Send test**. A "Notifications are working" message should pop up.
4. Nicole does the same on her phone.

## Try it
- On your phone's To-Do list, type `Test task @Nicole in 1 min`. Her phone should ping right away with "Robert gave you a task", and again about a minute later with the reminder.

## Troubleshooting
| Problem | Fix |
|---|---|
| No "Turn on notifications" button | Open Homebase in Chrome (not another browser) and add it to the home screen. |
| "Notifications are blocked" | Go to Chrome → ⋮ → **Settings** → **Site settings** → **Notifications**, then allow your Homebase site. |
| Test works, but no due reminders | Check that step 4 ran with your real URL. In Supabase, go to **Integrations** (or **Database**) → **Cron** and look at the `homebase-reminders` job history. |
| Function errors | Go to **Edge Functions** → **notify** → **Logs** and send me what it says. |
| "Please sign in again" errors from notify | Make sure **Verify JWT** is OFF for `notify` (step 3). It must stay ON for `google`. |
