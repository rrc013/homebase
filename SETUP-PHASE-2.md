# Homebase Phase 2 setup: Calendar, Hub, Weather, Photo frame

Allow about 45 minutes. Do the parts in order. **Part A (Google Cloud)** is the longest.

Throughout, your app address is assumed to be `https://rrc013.github.io/homebase/`. If yours is different, use yours everywhere, and **keep the trailing slash**.

---

## Part A: Google Cloud (lets Homebase talk to Google Calendar)

Use your **personal Gmail** to sign in to Google Cloud. Your business account works too, but personal keeps it simple.

### A1. Create a project
1. Go to **console.cloud.google.com**.
2. Open the project picker at the top left, choose **New Project**, name it `Homebase`, and click **Create**.
3. Make sure **Homebase** is selected in the project picker before continuing.

### A2. Turn on the Calendar API
1. Search the top bar for **Google Calendar API** and open it.
2. Click **Enable**.

### A3. Set up the sign-in screen
1. Search the top bar for **Google Auth Platform** and open it. Click **Get started**.
2. Fill in the steps:
   - **App name:** `Homebase`
   - **User support email:** your email
   - **Audience:** **External**
   - **Contact email:** your email
   - Agree to the policy, then click **Create**.
3. In the left menu, click **Branding** and fill in:
   - **Application home page:** `https://rrc013.github.io/homebase/`
   - **Application privacy policy link:** `https://rrc013.github.io/homebase/privacy.html`
   - **Authorized domains → Add domain:** `rrc013.github.io`
   - Click **Save**.

### A4. Add the calendar permissions
1. In the left menu, click **Data Access**, then **Add or remove scopes**.
2. Paste these into the **Manually add scopes** box at the bottom, one per line, then click **Add to table** and **Update**:
   ```
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/calendar.calendarlist.readonly
   openid
   email
   ```
3. Click **Save**.

### A5. Create the login keys
1. In the left menu, click **Clients**, then **+ Create client**.
2. **Application type:** **Web application**. **Name:** `Homebase web`.
3. Under **Authorized redirect URIs**, click **+ Add URI** and enter exactly `https://rrc013.github.io/homebase/`.
4. Click **Create**.
5. Copy the **Client ID** and **Client secret** into a note. You need both in Part B. Download the JSON too; the secret may only be shown once.

### A6. Publish the app (so the connection doesn't expire every 7 days)
1. In the left menu, click **Audience**.
2. Under *Publishing status*, click **Publish app**, then **Confirm**. The status should change to **In production**.
3. Google may say verification is needed. **Ignore that and don't submit for verification.** For a private family app (under 100 users) it works without it. You'll just see a "Google hasn't verified this app" screen once per account when connecting.

> **Publish button greyed out?** It's usually an unsaved or blank Branding field. Go back to A3, make sure the home page, privacy link and authorized domain are filled in and saved, then try again.

### A7. Allow it on your business (Google Workspace) account
The inspiredvision.tax account is a Google Workspace account, so its admin settings can block unverified apps. If you get **"Access blocked"** when connecting your business calendar:
1. Go to **admin.google.com** → **Security** → **Access and data control** → **API controls**.
2. Click **Manage Third-Party App Access** → **Add app** → **OAuth App Name Or Client ID**.
3. Paste the **Client ID** from A5, select it, choose your whole organization, and set access to **Trusted**. Save.

---

## Part B: Supabase

### B1. Run the database update
1. In Supabase, go to **SQL Editor** → **New query**.
2. Paste in all of `supabase/03-calendar-hub.sql` and click **Run**. You should see "Success."

Then do the same with `supabase/04-hub-home-calendars.sql`. This lets you choose which calendars appear on the hub's Home screen.

### B2. Add the Google keys as secrets
1. Click **Edge Functions** in the sidebar, then **Secrets**.
2. Add two secrets:
   - `GOOGLE_CLIENT_ID` = the Client ID from A5
   - `GOOGLE_CLIENT_SECRET` = the Client secret from A5
3. Click **Save**.

### B3. Create the server function
1. Go to **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name the function exactly **`google`**.
3. Delete the sample code, paste in all of `supabase/functions/google/index.ts`, and click **Deploy function**.
4. Leave the JWT verification setting **on**. It's on by default, and it means only signed-in family members can use the function.

---

## Part C: Upload the app files to GitHub

1. In the unzipped update folder, **delete `js/config.js`** so your keys on GitHub aren't overwritten.
2. In your `homebase` repo, choose **Add file** → **Upload files**, drag in everything, and click **Commit changes**.
3. Open `js/config.js` on GitHub and confirm your keys are still there.
4. Wait 1–2 minutes, then fully close and reopen the app on your phone. You should see a **📅 Calendar** tab.

---

## Part D: Connect calendars

### D1. Your accounts (on your phone)
1. Go to the **Family** tab → **Google Calendars** → **＋ Connect account**.
2. Pick your **business** Google account.
3. When you see "Google hasn't verified this app," tap **Advanced** → **Go to Homebase (unsafe)**. It's your own app, so this is expected.
4. **Check both calendar permission boxes** and tap **Continue**.
5. You'll land back in Homebase with "Connected ✓". Your business calendar is automatically marked 🔒 **work**.
6. Repeat for your **personal** Gmail.

### D2. Nicole's account (on her phone)
Nicole signs in to Homebase on her phone and does the same with her Gmail. Only she can connect her account.

### D3. Choose what shows
Under each account, check the calendars you want to see.

Tap ⚙️ on a calendar to set:
- **Whose calendar it is**, for example "Family" for a shared calendar.
- **Color**.
- **🔒 Work**: details hidden everywhere except the owner's phone.

---

## Part E: Set up the hub screen

1. On the big tablet or screen, open your app link in Chrome and sign in.
2. Go to **Family** (on the hub this is **⚙️ Settings**) → **This device** → **🖥️ Hub screen**.
3. Choose when the photo frame starts (5 minutes is the default).
4. From your phone, go to **Family** → **Photo frame** → **＋ Add photos** and pick some family pictures.
5. Set the weather town under **Family** → **Weather** (it starts as Sarasota).

Locking the tablet so it can't be exited, and keeping it always on while charging, come in the kiosk phase.

---

## How it works (good to know)

- **Two-way sync:** events you add in Homebase go straight into Google Calendar. Changes made in Google show up in Homebase within about 5 minutes, or right away if you tap **🔄 Sync now**.
- **Range:** Homebase keeps the past month and the next 12 months.
- **Hub Home screen:** work calendars start off the Home screen, so the day isn't buried in meetings. Home shows a single line instead, like "🔒 Robert – 4 work meetings", and tapping it opens the full calendar. Change which calendars appear with **Calendars** on the Today card, or **🏠 Choose calendars for the hub Home screen** on the Family tab. Every calendar still shows on the Calendar screen.
- **Work privacy:** the hub, tablets and Nicole's phone show "Robert – Work Meeting". Only your phone shows real titles. The details are stored in a table only your login can read.
- **Repeating events:** you can create daily, weekly, monthly or yearly events. Editing one changes just that occurrence, and deleting gives you "this one" or "all".
- **Disconnecting** an account removes its events from Homebase only. Nothing is deleted in Google.

## Troubleshooting

| What you see | Fix |
|---|---|
| "Access blocked: Homebase has not completed the Google verification process" | The app is still in Testing. Do step A6. |
| "Access blocked" only on the business account | Do step A7 (Workspace admin). |
| "Error 400: redirect_uri_mismatch" | The redirect URI in A5 must exactly match your app address, including `https://` and the trailing `/`. |
| "Insufficient authentication scopes" | You unchecked the calendar boxes. Connect again and check both boxes. |
| "Needs reconnecting" on an account | Tap **Reconnect**. This happens if access was removed in Google or the password changed. |
| Calendar tab says "Connect your calendars" after connecting | Tap **🔄 Sync now** on the Family tab, and make sure at least one calendar is checked. |
| Function errors | In Supabase, go to **Edge Functions** → **google** → **Logs** to see the error. Send it to me. |
