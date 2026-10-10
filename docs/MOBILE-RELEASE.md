# Bloomshot mobile release: assessment and checklist

Prepared October 3 2026 from `BLOOMSHOT-Claude-handoff.zip`, the concept handoff and the native source notes (`README.md`, `package.json`, `capacitor.config.json`, `NATIVE-VERIFICATION.json`, `web-inventory.json`). The native zip itself (`android/`, `ios/`, `scripts/`) was not available, so nothing about the generated native projects has been inspected.

## Where things stand

Verified in this pass:

- The web game runs. All 118 existing checks pass (engine 20, Rush 17, PWA worker 20, sound 12, garden 20, save integration 14, Moon engine 15), plus the Moon level, precache-stream and pointer checks.
- It renders cleanly at phone size (390 x 844) and on an iPad (820 x 1180), where it sits in a centered phone-width column. Safe-area insets are already used for top and bottom.
- The purchase layer in `docs/STORES.md` passes its own 14 checks and works in a browser in test mode.

The Android debug APK and the iOS simulator build both compiled in GitHub Actions on October 3, 2026.

Not verified by anyone yet: any real device or simulator run, WebView performance, touch feel, audio on phones, and every store step.

## Gaps between today and a store release

| Gap | Needs accounts? | Who | Notes |
|---|---|---|---|
| Purchase plumbing | No | Done (this pass) | Test mode only until keys exist. |
| **Something to sell** | No | Content work, in progress | As of October 3 2026 the Koi Conservatory is built (pools 1 and 2 free, pools 3 to 8 behind `world_koi`) and the Keepsake Collection (three seed styles, `style_collection1`) is next. A Launch Bundle (`bloomshot.bundle.launch1`) grants both. All three stay `available: false` in `store-config.js` until a sandbox purchase and restore work end to end. The six Moon trials are free. |
| Android debug APK in the cloud | No | Built once, October 3 2026 | `.github/workflows/android-debug.yml` (Actions tab, Run workflow). The APK is attached to the run as `bloomshot-debug-apk`. Compiles; has not been launched on a device. Lets Trevor sideload a real Android build with no account. |
| iOS compile check in the cloud | No | Passed once, October 3 2026 | `.github/workflows/ios-simulator.yml`. Compiles unsigned for the simulator (`BUILD SUCCEEDED`); cannot be installed on an iPhone and has not been run in a simulator. |
| Final app id and name check | No | Trevor decides | `dev.bloomshot.game` is a placeholder; the first upload to any Google Play track, even Internal testing, claims it for good, so confirm it before that upload. The name "Bloomshot" has not been searched in either store. |
| Privacy policy page | No | Claude drafts, Trevor hosts | Required by both stores. The game collects nothing and has no accounts or ads, which makes it short. |
| Store listing text, screenshots, age ratings | No (drafting) | Claude | Entered into the consoles after enrollment. iPad screenshots are required if iPad is supported. |
| iPhone haptics | No | Written, October 3 2026 | `navigator.vibrate` does nothing on iOS, so `bloomshot/native.js` sends buzzes to the Capacitor Haptics plugin in the app (found as `Capacitor.Plugins.Haptics`, the way the injected native bridge exposes it) and keeps `vibrate()` on the web. Unit-tested with a fake plugin shaped like that bridge; the feel on a real iPhone and Android phone is untested. |
| Share sheet | No | Written, October 10 2026 | `BloomNative.share({ text, url, title })` in `bloomshot/native.js` opens the phone's share sheet through `@capacitor/share` 8.0.3 in the app, the browser's own share sheet on the web, and otherwise copies the text and link to the clipboard. `BloomNative.link` is the link to share: the Google Play page on Android, the web game elsewhere until the App Store listing exists. Unit-tested with fake plugins; not yet tried on a real phone. The game's share button and daily result call it. |
| Progress safety in the native app | No | Written, October 3 2026 | Progress lives in `localStorage`. In the app, `bloomshot/native.js` also copies each save to the phone's preferences. Until an install has checked its local save against that backup (a marker stored beside the save), the local save is treated as unverified: a usable backup is restored over it and the page reloads once, and a backup that cannot be read is never overwritten. This guards against the OS clearing the WebView's storage while the app stays installed. It does not survive deleting the app, it cannot tell which of two valid copies is newer once an install has been checked, and it has not run on a real device. |
| Real device testing | Android: no. iPhone/iPad: yes | Trevor + Claude | See below. |
| Signing, TestFlight, sandbox purchases, submission | **Yes** | Trevor | Below. |

## What Trevor can do now, for free

1. **Create an empty private GitHub repo for the game** and connect it, so the game and native shell can live in one place with the workflows above. Claude cannot create repositories from here.
2. Decide the **final app name and app id**, and search the App Store and Google Play for "Bloomshot" to make sure it is not taken or too close to something else.
3. Sign up for a **RevenueCat account** (free).
4. **Line up 12 people with Android phones** for the Google closed test (see below). Their Google account emails are needed later.
5. Choose whether the hosted web version should become **public** so testers can open it. It is currently owner-private. iPhone and iPad testers can play the web version from Safari with Add to Home Screen until the native app is on TestFlight.
6. Tell Claude if the Android phone can install a sideloaded APK; then the first real-device test needs no money at all.

## What needs money or an account (Trevor only)

Costs and rules are as of my last information. Confirm each on the official page when enrolling.

- **Google Play Console**: one-time fee (about $25) and identity verification. New personal accounts must run a **closed test with at least 12 testers for 14 consecutive days** before they can publish to production. That 14-day clock is the longest lead time on Android, so if only one account can be paid for first, make it this one. The step-by-step order, including how the Android upload key and signed bundle are made, is in `docs/PLAY-LAUNCH.md`.
- **Apple Developer Program**: about $99 a year. Enrolling as an **Individual** shows the legal name as the seller; an Organization needs a legal entity and a D-U-N-S number. Needed for TestFlight, sandbox purchases, signing and submission.
- **Banking and tax** in both consoles (Paid Apps agreement in App Store Connect, payments profile in Play Console). No purchase can go live until these are complete.
- **Apple Small Business Program** (15% commission instead of 30%): apply after enrolling.
- **Signing**: an App Store Connect API key for automated uploads, and Google Play App Signing. Trevor stores these as GitHub Actions secrets himself; never paste them into chat. For Android, the `Create Android upload key` workflow makes the upload key and stores it as secrets itself (`docs/PLAY-LAUNCH.md`), and `Android release bundle` builds the signed `.aab`.
- **Pressing Submit** and answering any reviewer questions.

## Suggested order

1. Repo, name, app id (free, now).
2. Native folder is in the repo and both cloud builds have compiled once; Trevor sideloads the Android APK and plays it, and Claude fixes what that finds.
3. Haptics and the save backup are written; store-listing text is drafted; testing-track graphics are made from the current game, and final store screenshots wait for the final art.
4. Pay for Google Play; start the 12-tester, 14-day closed test with the free game.
5. Pay for Apple when the next check arrives; TestFlight; sandbox-test purchases.
6. Create products and entitlements; flip `available` on finished content; submit both.

## Honest limits

No revenue can happen until paid content exists and both stores approve the app. Review times and outcomes are outside anyone's control, and the concept handoff itself notes that purchase demand has not been tested. Prices in the catalog are test values.
