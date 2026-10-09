# Google Play launch: who does what, in order

Written October 9 2026. Google's rules and screen names change; where this says "as I last knew", check the console. Everything under "Trevor" can be done from a phone browser, though Play Console is easier in the browser's desktop-site mode.

## The order of events

| Step | Who | Waits on |
|---|---|---|
| 1. Pay the $25 fee, create a **Personal** account, verify identity | Trevor | Google emails the result (can take days) |
| 2. Set up the payments profile (bank and tax) | Trevor | Step 1. Nothing can be sold until it is done |
| 3. Fill the two blanks in the privacy policy | Trevor gives the values, Claude edits | Nothing |
| 4. Make the upload key (once) | Trevor adds one secret, Claude's workflow does the rest | Nothing, can be done today |
| 5. Create the app entry | Trevor | Step 1 |
| 6. Build the signed bundle and upload it to **Internal testing** | Claude builds, Trevor uploads | Steps 4 and 5 |
| 7. Create the in-app products and test a purchase and a restore | Trevor, with Claude | Step 6 |
| 8. Run the **closed test**: 12 testers opted in for 14 days in a row | Trevor recruits, testers join | Step 6 |
| 9. Apply for production access, then publish | Trevor | Step 8, then Google's review |

Step 8 is the long one: Google requires it of new personal accounts before the game can go public. Recruit the 12 people while step 1 is being verified. They need Android phones and the Gmail address they use on Google Play.

## Step 3: privacy policy blanks

Tell Claude the effective date and a contact email you are happy to have public. Claude fills `docs/store/PRIVACY-POLICY.md`, and the next Pages build publishes it at `/privacy/`. Play Console asks for that web address.

## Step 4: make the upload key (once, about 10 taps)

The upload key proves a build came from you. Google keeps the real signing key (Play App Signing), so a lost upload key can be reset by Google. The key is made inside GitHub and never appears in the repo, a log or chat.

1. GitHub, your profile picture, Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.
2. Name it `bloomshot-setup`, expiration 7 days, Repository access: Only select repositories, pick `Bloomshot`.
3. Repository permissions: set **Secrets** to Read and write. Generate the token and copy it.
4. In the Bloomshot repository: Settings, Secrets and variables, Actions, New repository secret. Name `SETUP_TOKEN`, paste the token.
5. Actions tab, **Create Android upload key**, Run workflow. It makes the key and stores it as four secrets starting `ANDROID_`.
6. Delete the `SETUP_TOKEN` secret, and delete the token under Developer settings.

## Step 5: the app entry

Create app, then: name **Bloomshot** (check it is free), default language English (United States), **Game**, **Free** (purchases happen inside the app), accept the declarations. Then the dashboard's setup tasks, using `docs/store/LISTING.md`: privacy policy link, ads: none, app access: no login needed, content rating questionnaire, target audience 13 and over, data safety (anonymous id and purchase history via RevenueCat, as in LISTING.md), store listing text and graphics. The app id is `dev.bloomshot.game` and cannot change after the first upload.

## Step 6: build and upload

1. Actions tab, **Android release bundle**, Run workflow.
2. When it finishes, open the Releases page: the newest pre-release has `bloomshot-<number>.aab` attached as a plain file.
3. Play Console, Testing, **Internal testing**, Create new release, upload that file, save, roll out. Add yourself under Testers. Internal testing has no wait and no tester minimum.

The workflow refuses to publish unless the upload key exists. A run without it is a dry run: its file is named `DRY-RUN-do-not-upload` and must never go to Play, because it is signed with a throwaway key.

## Step 7: products and the purchase test

Once a build is uploaded, create the in-app products with the ids in `store-config.js` and `docs/store/LISTING.md` (one-time products, the bundle cheaper than both parts). Add your Gmail under Settings, License testing. Then follow `docs/STORES.md` for the buy, cancel, buy again, restore and refund checks. Only after they pass does Claude flip `available` to `true`. RevenueCat also needs the Play service credentials; Claude will walk you through that when you get here.

## Step 8: the closed test

Testing, **Closed testing**, create a track, add the 12 testers' Gmail addresses (a list or a Google Group), roll out the same bundle. Each tester opens the opt-in link on their phone and installs the app, and has to stay opted in. The 14 days count from the day all 12 are in; if someone leaves, the count can break. Keep a few spare testers.
