# Bloomshot: Trevor's launch steps

Updated October 16, 2026. Trevor chose **Individual enrollment under his personal legal name**, with **free downloads on iPhone and Android**. The game name remains **Bloomshot**, and the application identifier remains `dev.bloomshot.game`. Optional purchases retain their approved contents and prices; none are live. Trevor reports submitting Apple enrollment; membership payment and activation are not yet verified. Google Play and RevenueCat setup remain outstanding at the last confirmation.

This is the owner checklist. The engineer prepares and checks code, builds and media; Trevor handles identity, agreements, payments, banking/tax details, real-phone testing, merges and final release decisions. Do not paste passwords, private keys, payment details or identity documents into chat or the public repository.

October 16 status: **PR #30 is merged**. PR #31 remains open for game/graphics changes and owner approval. The installed iPhone and Android apps are the release targets. Graphics defaults to Maximum; Balanced and Performance offer lower detail. Use Show frame rate for local testing and follow [the installed-device performance checks](PERFORMANCE.md) once TestFlight/Play builds are available.

## 1. Play on your iPhone now

1. Trevor reported **iPhone 13, iOS 26.6.2** on October 15. For future tests, confirm those fields at **Settings → General → About**. Serial number and IMEI are not needed.
2. Scan the QR shown in the private project chat with the Camera app. Tap its link and open it in Safari. The private address is deliberately omitted from this public guide.
3. Sign in with the same ChatGPT account if the hosting service asks. You do not need to find this Codex chat on your phone.
4. If an older layout appears, open the game's **Settings → Restart and update** when offered. This restarts the current run and preserves saved progress.
5. Test aiming and the four power buttons above Split. Try Level 2's rocks, Level 3's cups, and Sunny's first attack; the boss shortcut QR in the chat can open wave ten directly.
6. Check sound after a tap, pause/resume, and completed-level/meadow/settings saving after closing and reopening the **same** Safari version. Unfinished runs restart after a reload by design. Website and native-app saves are separate; no cross-device save sync is promised.
7. Report the level/wave, what happened and the phone details. Browser emulation and the private website do not establish a native install or a real purchase test.

## 2. Start Apple enrollment under your name

1. On the laptop, open [Apple Developer enrollment](https://developer.apple.com/programs/enroll/) and choose **Start your enrollment**.
2. Sign in with the Apple Account you will keep as the publisher's owner. Complete Apple's two-factor authentication prompts.
3. Choose **Individual**. Enter your actual legal name and contact details in Apple's form. Do not substitute Harborline's trade name for your personal name. Apple shows the individual's legal name as seller; the app title can still be Bloomshot.
4. Review Apple's agreement and complete its identity and membership-payment steps yourself. Apple lists **US$99 per membership year**; local pricing and any tax appear during enrollment. Resume the existing enrollment from [Apple Developer Account](https://developer.apple.com/account/) in a regular browser. Do not start a duplicate enrollment while it is unresolved. If an order acknowledgment already exists, check its status instead of paying again. Apple sends membership confirmation after processing; its [enrollment guidance](https://developer.apple.com/help/account/membership/program-enrollment/) directs owners to support if confirmation has not arrived within 24 hours of purchase. Tell the engineer when membership is active; an application or payment receipt alone is not proof of activation.
5. Follow [iPhone launch](IOS-LAUNCH.md) to register the exact bundle ID, create the App Store Connect app record and prepare signing. Use **Bloomshot** as the app name if accepted. Do not choose a replacement name or bundle ID without reviewing it together.
6. Set the app download price to **Free** when pricing is configured. For purchases later, complete the Paid Apps agreement, banking and tax tasks in App Store Connect yourself. These are separate from the download price.

Apple's [enrollment requirements](https://developer.apple.com/programs/enroll/) cover individual/sole-proprietor enrollment and seller names. The signing/upload instructions use a cloud macOS build; Trevor's Windows laptop is not expected to run Xcode.

## 3. Create RevenueCat and Google accounts in parallel

1. Open [RevenueCat's account setup](https://www.revenuecat.com/docs/welcome/overview), follow **creating an account**, verify your email and sign in.
2. Create a project named **Bloomshot**. Add its Apple App Store app using `dev.bloomshot.game` once that app is registered. Use [Product setup](store/PRODUCT-SETUP.md) for the exact fields and credential destinations. Do not turn products on in game code yet.
3. Open [Google's Play Console signup instructions](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en) and use the Google Account that will own the app.
4. Choose **Personal** for the chosen personal publishing route. Complete Google's agreement, actual identity/contact verification and **US$25 one-time** registration payment yourself. Verify Google's current checkout amount before paying.
5. Arrange access to an eligible real Android device. New personal accounts require device verification using the Play Console app; an iPhone cannot do that check.
6. In Play Console create **Bloomshot**, English (United States), **Game**, **Free**. Complete the declarations for the actual build, with no ads. Follow [Play launch](PLAY-LAUNCH.md) for app setup, signing and Internal testing.
7. Recruit at least 12 Android testers, with extra people to allow for dropouts. New personal accounts must have at least **12 continuously opted-in testers for 14 days** before applying for production access. The clock starts with eligible closed-test opt-ins, not account signup; Google still reviews the application. [Official testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

The first native test builds keep purchases disabled. Account setup, device testing and Android closed testing can move forward while purchase verification is prepared. Optional purchase products are separate from making the download free.

## 4. Merge only when prompted, in this order

Both pull requests target `main` directly. The engineer will identify the checked revision and give a merge-ready prompt; a green older revision is not a reason to merge while a new update is being prepared.

1. **Completed: [PR #30, native release preparation](https://github.com/VexNo1r/Bloomshot/pull/30) is merged.** It prepares signing and the Android billing handoff; it does not publish an app.
2. **Second: [PR #31, game and purchase preparation](https://github.com/VexNo1r/Bloomshot/pull/31)**, after Trevor approves the current game and its latest checks pass.
3. **Then: build and test from main**, only once both are merged. The release archive expects the privacy policy and current game files supplied by PR #31.

When prompted to merge: sign in to GitHub, open the exact PR link, select its **Conversation** tab, scroll to the merge box, confirm the base is **main** and checks have passed, choose **Merge pull request**, then **Confirm merge**. If GitHub offers a different merge method, confirm it merges into main. If it shows conflicts or failing checks, stop and report that state; do not force a merge or change the target branch. Wait for the first PR to say **Merged** before the second. The engineer rechecks the second PR against the new main.

Merging is separate from switching on GitHub Pages, uploading an app or approving a public release. Do not enable public hosting before the agreed game-approval gate.

## 5. Install, verify purchases, and submit

1. The engineer prepares the signed iPhone/Android builds using [iPhone launch](IOS-LAUNCH.md) and [Play launch](PLAY-LAUNCH.md). Trevor supplies signing/account setup through the specified private dashboards, never the public repo.
2. Install the iPhone build through TestFlight; install Android through Play Internal testing when that track is ready. Record the build and device. A simulator compilation or website is not an installed-app check.
3. Work through the device checklist in [Mobile release](MOBILE-RELEASE.md). Complete the [purchase sandbox plan](store/SANDBOX-TEST-PLAN.md) for each product before it can be enabled for sale. Confirm actual localized prices and exact delivery quantities.
4. Review the refreshed screenshot/video drafts, final public support/privacy pages, descriptions and store declarations. Draft browser captures are not native-device evidence and are never a claim that an untested product can be bought.
5. Once the tested build and listing are approved, Trevor authorizes submission for store review. Apple and Google approval are external steps; a build, upload or tester invitation is not a public release.

The project has no ads, subscriptions, paid randomness, mid-run sales or loss-screen sales. Free downloads and optional purchases must stay clearly described. No release date or income amount is guaranteed by the code checks.
