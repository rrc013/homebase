# Homebase Phase 3 setup: Chores, Stars, Rewards and Harper's Buddy

Allow about 20 minutes. Nothing changes in Google Cloud or the server function this time.

## 1. Prepare the files
1. Unzip the new **homebase.zip** and rename the folder `homebase-phase3`.
2. Open `homebase-phase3` → `js` and **delete `config.js`** so your keys on GitHub aren't overwritten.

## 2. Run the database update
1. In Supabase, go to **SQL Editor** → **New query**.
2. Paste in all of `supabase/05-kids.sql` and click **Run**. You should see "Success."

## 3. Upload to GitHub
1. In your `homebase` repo, click **Add file** → **Upload files**, drag in everything inside `homebase-phase3`, and click **Commit changes**.
2. Open `js/config.js` on GitHub and confirm your keys are still there.
3. Wait 1–2 minutes, then fully close and reopen Homebase on your phone. You'll see a new **🌟 Kids** tab. Countdowns now live inside the **Board** tab.

## 4. Set up chores and rewards (on your phone)
1. Open **🌟 Kids** and tap **Add starter chores & rewards**. This adds 8 chores and 6 rewards; edit or delete any of them.
2. Tap **🧹 Chores** to edit each chore:
   - the picture Harper sees (she can't read yet)
   - stars (1, 2, 3, 5 or 10)
   - which days
   - who it's for
   - **📷 photo proof**, for chores you want to check
3. Tap **🎁 Rewards** to set real prizes and their star prices.
4. On Harper's card, tap **⚙️ Pet, routines & bedtime** to:
   - set her **routine start**, **OK-to-wake**, **bedtime** and **sleep** times
   - tap **Edit morning steps** and **Edit bedtime steps** to change the picture steps
   - leave the pet blank so Harper can pick it herself on her Buddy

## 5. Set up Harper's Buddy tablet
1. On her tablet, open `https://rrc013.github.io/homebase/` in **Chrome** and sign in with your or Nicole's login.
2. Chrome menu **⋮** → **Add to Home screen**, then open Homebase from the home-screen icon. This makes it full-screen.
3. Go to **Family** → **This device** → **🧒 Kid's Buddy**. Choose **Harper** and set a **grown-up PIN** (4+ digits).
4. The tablet is now Harper's Buddy. The first time, she picks her pet.
5. **To get back out:** press and hold the **top-left corner** for 2 seconds and enter your PIN. That menu also lets you:
   - **preview** each screen (wake, day, bedtime, sleep) to show Harper how it works
   - restart today's routines
   - exit Buddy mode
6. Turn the tablet's volume up so she hears the voice.

## Demo first, then let Harper set it up
Try it out as much as you like. When you're ready to hand it over:
1. On your phone, open **Kids** → Harper's card → **⚙️ Pet, routines & bedtime**.
2. Scroll down and tap **↺ Reset pet & stars**.

This clears her pet (so she picks it herself), all stars, prize requests and activity. Your chores, rewards, routines and bedtime times stay. Her Buddy switches to "Pick your pet!" within a few seconds.

You can also change the pet or its name anytime from the same screen.

## How it works

**Stars:**
- Chores give stars instantly, with a celebration and the pet eating.
- **📷 Photo-proof chores** wait for you. They show up at the top of your **Kids** tab, and the tab gets a red badge.
- Finishing the morning or bedtime routine earns its stars too (5 each to start; you can change this).

**Prizes:** Harper taps a prize she can afford and "asks." You approve it on your phone under **Waiting for you**.

**Pet:**
- It grows a level as she earns stars and unlocks a bow, scarf, sunglasses, balloon, crown, rainbow and castle.
- It's hungry in the morning and gets happier with each job.

**Her day:**

| Time | What the Buddy shows |
|---|---|
| OK-to-wake | A big sun says "Good morning, you can get up!" and starts the morning routine |
| Daytime | Her pet and picture jobs |
| Bedtime start | Everything turns dim and warm. The bedtime routine is read softly, step by step |
| After bedtime, until OK-to-wake | A near-black sleep clock with a faint moon. Tapping it gently reminds her it's still sleepy time |

**Undo:** your **Kids** tab → **📜 Activity** → ↩︎ removes any entry, including chores, bonus stars and prizes.

**Bonus stars:** **＋ Bonus stars** gives (or takes away) stars for catching her being good.

**On the hub:** the new **🌟 Kids** page and a Home-screen card show each kid's pet, stars and progress for today. Tapping a chore on the hub marks it done right away, with no photo needed.

## Good to know
- The Buddy keeps its screen on while Homebase is open. Fully locking the tablet so Harper can't leave the app comes in the kiosk phase.
- The voice uses the tablet's built-in text-to-speech. If it sounds robotic, go to Android **Settings** → **Text-to-speech** and pick a nicer voice.
- "Kid 2" is a placeholder. Rename it on the **Family** tab whenever you're ready; the new child gets their own Buddy, pet and chores.
