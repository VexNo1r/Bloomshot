# Bloomshot mobile release checklist

Updated October 13, 2026 from the repository, replacing the October 3 assessment of an incomplete ZIP. See LAUNCH-PLAN.md for ownership and PLAY-LAUNCH.md for the Android sequence.

## Current state

- The ten-level campaign, level 5 preview, Koi Conservatory, Keepsakes, Complete Garden bundle, powerups and packs are implemented. Levels 1 to 4, Garden puzzles, Meadow Rush and Moon trials are free. Paid content stays locked until store setup and purchase verification are complete.
- Both RevenueCat public SDK keys are empty and every catalog product has available: false. This build cannot accept money. Keep those safeguards until the corresponding sandbox checks pass.
- Android debug APK and unsigned iOS simulator builds passed in GitHub Actions on October 12 (runs 38191933641 and 38191935684). Compilation shows that the projects build; neither run demonstrates a launch on a device or simulator.
- Trevor confirmed October 12 that developer accounts, the Android upload key, RevenueCat setup and real-phone testing have not been completed.
- The retained application identifier is dev.bloomshot.game on both platforms. The player-facing name is Bloomshot. Check the actual App Store Connect name when creating the record; a search cannot reserve it.
- Trevor has supplied the public policy contact, hello@harborlineleadrecovery.com. Before submission, finish and deploy the policy, open the public URL and verify the in-app link. The iOS release workflow requires privacy.html in the exported app. Account configuration and the policy must agree with the submitted binary.

## Android gates, in order

| Gate | What completes it |
|---|---|
| Developer account | Enrollment fee, identity/device verification and account access completed by Trevor |
| Real-device check | Install the debug APK, complete the checklist below and record device/build/results |
| Upload key | Run **Create Android upload key** once on main with the setup token; confirm all four signing secrets |
| Signed bundle | Start **Android release bundle** on main; download the signed .aab from its pre-release, never a dry-run artifact |
| App setup | Listing, public policy, access/ads/target-audience/content-rating/data-safety forms completed truthfully for the submitted build |
| Internal testing | Install through Play with an approved tester account; record the bundle's version code |
| Purchase test | Payments profile, Play product, RevenueCat integration and public SDK key configured; test one product at a time |
| Closed testing | For new personal accounts: at least 12 testers opted in continuously for the preceding 14 days; collect meaningful feedback |
| Production | Apply for production access, address review feedback and submit an approved release |

An Android launch can earn revenue when its own store and purchase gates are complete. It does not have to wait for Apple approval. Approval, sales and launch dates cannot be guaranteed.

## iOS gates

The existing **iOS simulator build** workflow compiles without signing. A separate **iOS release archive** workflow is now prepared in `.github/workflows/ios-release.yml` to archive and export a signed IPA on a macOS runner once the owner supplies credentials. It has **not been run with signing assets**, and no App Store archive, IPA, upload, TestFlight install or purchase has been verified. Complete Apple enrollment, app setup and the steps below before making a release claim.

The app supports iPhone and iPad. Prepare screenshots for the size classes requested by App Store Connect and test both layouts and orientations. The app includes a UserDefaults privacy manifest for the Preferences plugin; also review the full SDK privacy report and App Privacy answers for the release binary.

## Preparing the iOS release workflow

Trevor must supply or authorize these account steps:

1. Enroll in the Apple Developer Program and accept the required agreements. Register the explicit App ID **dev.bloomshot.game**, then create the matching iOS app record in App Store Connect. The home-screen name remains Bloomshot.
2. Create an **Apple Distribution** certificate and retain its private key. Export a password-protected `.p12` containing that certificate **and private key**. A `.cer` certificate by itself cannot sign an app. Do not send signing keys or passwords in chat.
3. Create/download an **App Store Connect distribution provisioning profile** for that explicit App ID, team and certificate. Development, ad hoc, enterprise, wildcard, expired or mismatched profiles are refused.
4. Add the signing values below in Bloomshot's GitHub Actions secrets. Use base64 of the original file bytes; base64 is transport encoding, not encryption. Keep the originals in the owner's secure backup.
5. For optional automated upload, request App Store Connect API access and create a **team API key** with a role allowed to upload builds. Download its `.p8` once and retain it securely; record its key ID and issuer UUID. This workflow expects a team key, not an individual key or an In-App Purchase/server-notification key.

| Secret | Value |
|---|---|
| `IOS_TEAM_ID` | Ten-character Apple Developer Team ID |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64 of the Apple Distribution certificate/private-key `.p12` |
| `IOS_CERTIFICATE_PASSWORD` | Password protecting that `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64 of the matching App Store Connect `.mobileprovision` |
| `APP_STORE_CONNECT_API_KEY_ID` | Ten-character team API key ID; required only when upload is selected |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Team API issuer UUID; required only when upload is selected |
| `APP_STORE_CONNECT_API_KEY_BASE64` | Base64 of that key's `.p8`; required only when upload is selected |

The workflow builds on GitHub's macOS runner; it does not require a local Mac for that build. Signing material still needs to be created and backed up through the owner's Apple account and approved signing tools. No account, certificate, profile or API key is created by this workflow.

## Archive, export and optional upload

1. Select **iOS release archive**, **Run workflow**, branch **main**. Branch runs are skipped; there is no push or pull-request signing trigger.
2. Enter the App Store version (default `1.0`) and an unused numeric build number from **1 to 9999**, greater than previous uploads for that version. A retry using the same number is not a new App Store build. The workflow does not query the account to allocate build numbers.
3. Leave **upload_to_app_store_connect** unchecked for the first signing run. Missing secrets fail before dependencies are installed. The workflow checks Xcode 26+, verifies the imported distribution identity against the profile, and applies manual signing only to the App target's Release configuration in the temporary CI checkout.
4. A successful run preserves a signed `.xcarchive`, exported `.ipa` and `ReleaseMetadata.json` as an Actions artifact for 14 days. The metadata records bundle/version/build/commit and whether the upload command completed. Download and securely retain the deliverable before the artifact expires. An App Store IPA is for delivery through Apple; it is not a development/ad hoc package to sideload on an arbitrary phone.
5. After reviewing that artifact and the app record, use a **new build number** and select upload if desired. The workflow validates/uploads using `xcrun altool` and the team API key. It does not submit a version for review or publish the app. If optional upload fails after export, the valid exported artifact is kept for diagnosis or manual delivery.
6. Confirm Apple's processing result and the build's appearance in App Store Connect. Then configure TestFlight, complete required compliance/testing details and install it on a real iPhone and iPad. TestFlight processing or external beta review may require additional account actions.

Signing uses a temporary keychain and an installed profile on the disposable runner. An exit handler restores the original keychain search list and removes the imported profile, keychain, `.p12`, decoded `.p8` and temporary signing files on normal success or failure. Release artifacts exclude private signing material. The runner is disposable; abrupt host termination cannot be certified by a local cleanup handler.

Prepared and locally inspectable: workflow guards, secret checks, profile/certificate validation, export options, App-only signing configuration, packaging checks and cleanup. Still unverified: macOS keychain import, real certificate/profile matching, Xcode Release archive/export, Apple API authentication/upload, processing, TestFlight installation, physical-device performance and every sandbox purchase. The first signed run must confirm the runner's current Xcode export options and `altool` authentication behavior. Fix any toolchain/account error before describing the workflow as a verified release path.

Complete paid-app agreements, tax/banking, store products and RevenueCat separately. Purchases remain disabled until their sandbox scenarios pass; creating an IPA does not activate them.

Apple references checked October 13, 2026:

- [Create an App Store provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/)
- [App Store Connect API keys and roles](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/)
- [Upload builds, supported Xcode versions and processing](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Xcode archive/export options](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/): the archive/export command structure also applies here; use `xcodebuild -help` for the active toolchain's export keys.
- [Apple's altool API-key authentication reference](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool): this workflow uses the supported app-upload commands, rather than notarization.

## Real-device report

Record the commit, APK/bundle version, device model, OS/WebView version, date and tester. Check:

1. Fresh install, first-run tutorial and tutorial replay; aim/release, turn petal, Split and each powerup.
2. Levels 1 to 4, the level 5 preview, one Garden puzzle, a Moon trial and both free Koi pools.
3. Sound enabled/disabled, headphones, an interruption, lock/unlock and background/foreground during a run.
4. Small screen safe areas, readable labels, touch responsiveness and sustained performance during a busy wave and finale.
5. Android Back behavior, native share sheet, shared destination, policy link and offline cold launch.
6. Save/relaunch and backup restoration without resetting existing progress. Reinstallation is a separate test; do not promise that local progress or consumed powerups restore with purchases.

Capture reproducible failures as issues with screenshots or recordings. A browser pass and a compile pass do not replace this report.

## Current platform requirements

The Android project targets API 36, matching Google's requirement for new apps and updates from August 31, 2026. The shipped dependency graph must use Play Billing Library 8 or newer; verify the resolved release dependency, not just the npm plugin version. The release workflow checks the signature, billing permission, absence of advertising-ID permission and 16 KB ELF alignment. If native libraries are present, also verify the generated APK's packaging and test on a 16 KB environment.

- [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Play Billing Library support timeline](https://developer.android.com/google/play/billing/deprecation-faq.html)
- [Android 16 KB page-size support](https://developer.android.com/guide/practices/page-sizes)
- [Apple app upload overview](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)

Recheck these requirements when uploading. Nothing in this checklist is evidence that a store account, device test, purchase or submission has been completed.
