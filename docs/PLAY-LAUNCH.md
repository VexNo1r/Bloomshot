# Google Play launch: who does what, in order

Written October 9 2026, checked by an independent review the same day. Google's rules and screen names change; where this says "as I last knew", check the console. Everything under "Trevor" can be done from a phone browser, though Play Console is easier in the browser's desktop-site mode.

## The order of events

| Step | Who | Waits on |
|---|---|---|
| 1. Pay the $25 fee, create a **Personal** account, verify identity and device | Trevor | Google emails the result (can take days) |
| 2. Set up the payments profile (bank and tax) | Trevor | Step 1. Nothing can be sold until it is done |
| 3. Privacy policy: fill the two blanks, switch on Pages | Trevor gives the values and flips one setting, Claude edits | Nothing, can be done today |
| 4. Make the upload key (once) | Trevor adds one secret, Claude's workflow does the rest | Nothing, can be done today |
| 5. Create the app entry and finish the store listing | Trevor, with Claude's graphics | Steps 1 and 3 |
| 6. Build the signed bundle and upload it to **Internal testing** | Claude builds, Trevor uploads | Steps 4 and 5 |
| 7. **Closed test**: 12 testers opted in for 14 days in a row | Trevor recruits, testers join | Step 6, then Google's review |
| 8. Products and the purchase test | Trevor, with Claude | Steps 2 and 6, and a second bundle Claude builds |
| 9. Apply for production access, then publish | Trevor | Step 7, then Google's review |

Step 7 is the long one: Google requires it of new personal accounts before the game can go public, and its 14 days only start once Google has approved the closed test release and all 12 testers are in. Start it as soon as step 6 is done; do not wait for step 8. Recruit the 12 people while step 1 is being verified. They need Android phones and the Gmail address they use on Google Play.

## Step 1: the account

Pay the fee, choose **Personal**, and verify your identity and phone number. As I last knew, new personal accounts must also prove they can use a real Android device: install the **Google Play Console** app on an Android phone and sign in when the dashboard asks. If your phone is an iPhone, borrow an Android phone for that one sign-in.

## Step 2: payments profile

Bank account and tax details in Play Console's payments profile. As I last knew, an account that sells in-app products may have to show a contact address and email on its Play listing (Google's trader declaration, shown in the EU). Check what Play says it will display before you finish, and use details you are comfortable making public where Google allows it.

## Step 3: privacy policy

1. Tell Claude the effective date and a contact email you are happy to have public. Claude fills `docs/store/PRIVACY-POLICY.md`.
2. One time only, so the policy gets a web address: in the Bloomshot repository open Settings, Pages, and set Source to **GitHub Actions**. Until this is done, nothing is published.
3. After the next Pages build, the policy is at https://vexno1r.github.io/Bloomshot/privacy/. Open it on your phone and check it loads before pasting it into Play Console.

## Step 4: make the upload key (once, about 10 taps)

The upload key proves a build came from you. Google keeps the real signing key (Play App Signing), so a lost upload key can be reset by Google. The key is made inside GitHub and never appears in the repo, a log or chat.

1. GitHub, your profile picture, Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.
2. Name it `bloomshot-setup`, expiration 7 days, Repository access: Only select repositories, pick `Bloomshot`.
3. Repository permissions: set **Secrets** to Read and write. Generate the token and copy it.
4. In the Bloomshot repository: Settings, Secrets and variables, Actions, New repository secret. Name `SETUP_TOKEN`, paste the token.
5. Actions tab, **Create Android upload key**, Run workflow. It makes the key, stores it as four secrets starting `ANDROID_`, puts the key's public certificate in the run summary, and deletes the `SETUP_TOKEN` secret.
6. Delete the token itself under Developer settings, Fine-grained tokens.

## Step 5: the app entry and store listing

**Before anything is uploaded, confirm the app id with Claude.** It is `dev.bloomshot.game`, and the first upload to any track, even Internal testing, claims it for good.

Create app, then: name **Bloomshot** (check it is free), default language English (United States), **Game**, **Free** (purchases happen inside the app), accept the declarations. Then the dashboard's setup tasks, using `docs/store/LISTING.md`:

- Privacy policy: the address from step 3.
- Ads: the app contains no ads. Advertising ID: **No**, the app does not use it (the release build checks that it never asks for it).
- App access: no login needed. Content rating questionnaire. Target audience: 13 and over.
- Data safety: an anonymous id and purchase history, sent to RevenueCat for purchases only, as in LISTING.md.
- Store listing: the text from LISTING.md, the 512 px icon, the 1024 x 500 feature graphic and at least two phone screenshots. Claude supplies all of these; screenshots of the current game are fine for testing and can be replaced with final art before the public release.

The closed test in step 7 cannot be sent for review until these tasks are complete.

## Step 6: build and upload

1. Actions tab, **Android release bundle**, **Run workflow**. Always start a new run this way, never with Re-run on an old run.
2. When it finishes, open the Releases page: the newest pre-release has `bloomshot-<number>.aab` attached as a plain file.
3. Play Console, Testing, **Internal testing**, Create new release, upload that file, save, roll out.
4. Testers tab: create an email list with your own Gmail and tick it. Copy the opt-in link, open it on the Android phone signed in with that Gmail, tap Accept, then install Bloomshot from Play. Internal testing has no wait and no tester minimum.

The workflow refuses to publish unless the upload key exists. A run without it is a dry run: its file is named `DRY-RUN-do-not-upload` and must never go to Play, because it is signed with a throwaway key.

## Step 7: the closed test (start it right after step 6)

Testing, **Closed testing**, create a track, add the 12 testers' Gmail addresses (a list or a Google Group) and roll out the same bundle. Then open **Publishing overview** and tap **Send for review**: nothing is reviewed until you do, and a new account's first review can take several days. Once it is approved, send the testers the opt-in link. Each tester opens it on their phone, accepts, installs the app, and has to stay opted in. The 14 days count from the day all 12 are in; if someone leaves, the count can break, so keep a few spare testers.

## Step 8: products and the purchase test

The bundle from step 6 has no store in it: no store key is set and every product is switched off, so it shows no buy button and no Restore button. The purchase test needs a second bundle:

1. Create only the product being tested, one whose content is playable now, with its id and price from `docs/store/LISTING.md`, and tap **Activate**. Create the others when LISTING.md says so; a product id can never be reused. This needs the payments profile from step 2.
2. Connect RevenueCat to Play. It needs Play service credentials, and Claude will walk you through that; allow up to a day after adding them before testing.
3. Claude puts the Android public SDK key in `store-config.js` and switches on only that product. Run **Android release bundle** again (the new bundle gets a higher version code) and upload it to **Internal testing** only.
4. Add your Gmail under Settings, License testing. On that build, follow `docs/STORES.md` for the buy, cancel, buy again, restore and refund checks.

Only after they pass does a build with that product on sale go to the closed test or to production. Levels 5 to 10 (`bloomshot.levels.full`) can be tested only once the campaign code that sells it is merged; until then nothing in the game offers it.
