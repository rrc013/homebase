# Homebase setup

> **Phase 2 (Calendar, Hub, Weather, Photo frame):** after Phase 1 is working, follow **SETUP-PHASE-2.md**.

## Phase 1 setup

Phase 1 gives you shared **Lists** (groceries, to-dos, reminders), a **grocery library** that remembers items (with photos and aisle locations per store), the **family message board**, and **Countdowns** on your phone and Nicole's. Changes sync live between the two phones.

Setup takes about 15 minutes. It follows the same steps as Still I Do.

---

## 1. Create the Supabase project

1. Go to supabase.com → **New project**. Name it `homebase`, set a database password (save it), and pick the East US region.
2. When it finishes, open **SQL Editor → New query**.
3. Open `supabase/schema.sql` from this folder, copy all of it, paste it in, and click **Run**. You should see "Success. No rows returned."
4. Click **New query** again and do the same with `supabase/02-grocery-library.sql`. This adds the grocery library, stores and photo storage.

## 2. Connect the app to Supabase

1. In Supabase, go to **Project Settings → API** (on some screens it's **API Keys** / **Data API**).
2. Copy the **Project URL** and the **anon / publishable** key.
3. Open `js/config.js` and paste them between the quotes:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

The anon key is safe to put in a public repo. The database's security rules only let each family see its own data.

## 3. Put it on GitHub Pages

1. On GitHub, create a new **public** repo named `homebase`.
2. Click **Add file → Upload files** and drag in everything from this folder, keeping the `css`, `js`, `icons` and `supabase` folders intact. Commit.
3. In the repo, go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, then **main**, then **/ (root)**, and click **Save**.
4. After a minute or two, your app is at `https://rrc013.github.io/homebase/`. The exact link is shown at the top of the Pages screen.

## 4. Tell Supabase where the app lives

This makes the email confirmation and password-reset links open your app.

1. In Supabase, go to **Authentication → URL Configuration**.
2. Set **Site URL** to your GitHub Pages link, e.g. `https://rrc013.github.io/homebase/`.
3. Under **Redirect URLs**, add the same link and click **Save**.

## 5. Sign up and install on your phones

**You (first parent):**

1. Open the link in Chrome on your phone and tap **Create an account**.
2. Confirm the email Supabase sends you, then come back and sign in.
3. Choose **Start our family**. Harper and "Kid 2" are prefilled; you can rename Kid 2 anytime on the Family tab.
4. Install the app: Chrome menu **⋮ → Add to Home screen** (or **Install app**).

**Nicole:**

1. On your **Family** tab, tap **Share** to send her the link and join code.
2. She creates an account, confirms her email, signs in, and chooses **Join with a code**.

## 6. Optional: lock down sign-ups

Once you've both joined, go to **Authentication → Sign In / Providers** in Supabase and turn off **Allow new users to sign up**. Your data is already private either way; this just stops strangers from creating empty accounts.

---

## Preview without setup

Open `index.html?demo` (or your Pages link with `?demo` at the end) to try the app with sample data. Nothing is saved in demo mode.

## Already set up before the grocery library?

1. Run `supabase/02-grocery-library.sql` in the SQL Editor.
2. Upload the new files to GitHub, replacing the old ones. **Don't replace `js/config.js`**, since it holds your keys; skip it when uploading.

## Using the grocery library

- Start typing on the grocery list and suggestions appear from items you've bought before. Tapping the box with nothing typed shows your most frequently bought items.
- Every new grocery item is remembered automatically and gets a food icon.
- Tap any grocery item to add a photo, the aisle or section at each store, and notes like brand or shelf. That info stays with the item for every future trip.
- Add your stores on the Family tab, or with **＋ Add your stores** on the grocery list. Pick **Shopping at** to group the list by that store's sections; unsorted items go at the bottom.
- In a store's settings, put the sections in the order you walk the store.
- **📚 Library** shows everything you've saved, so you can search it, edit items or add them back to the list.

## Updating later

When I send updated files, upload them to the repo the same way (replace existing files). If an update includes SQL, run it in the SQL Editor. Phones pick up the new version the next time the app is opened.

## Good to know

- On the free plan, Supabase pauses a project after about a week with no activity. Daily use keeps it awake. If it ever pauses, click **Restore** in the Supabase dashboard.
- Kids don't have logins. Their profiles are used for assigning items now, and for chores, points and the Buddy device in Phase 3.

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | The app page |
| `css/styles.css` | Look and feel |
| `js/app.js` | Screens and behavior |
| `js/db.js` | Talks to Supabase (or demo data) |
| `js/config.js` | **Your Supabase keys go here** |
| `supabase/schema.sql` | Database setup: run once in Supabase |
| `supabase/02-grocery-library.sql` | Grocery library update: run once, after schema.sql |
| `supabase/03-calendar-hub.sql` | Calendar, photos and weather update: run once, after 02 |
| `supabase/04-hub-home-calendars.sql` | Choose which calendars show on the hub Home screen: run once, after 03 |
| `supabase/functions/google/index.ts` | Google Calendar server function (pasted into Supabase) |
| `js/core.js`, `js/calendar.js`, `js/hub.js`, `js/weather.js`, `js/photos.js` | Shared helpers, calendar, hub screen, weather and photo frame |
| `privacy.html` | Privacy policy page (Google requires one) |
| `SETUP-PHASE-2.md` | Step-by-step setup for calendar sync and the hub |
| `manifest.webmanifest`, `sw.js`, `icons/` | Make it installable as an app |
