# Google Play launch, from account setup to first sale

Updated October 12, 2026. Trevor confirmed that Play enrollment, RevenueCat, the upload key and phone testing have not been completed. The application identifier remains dev.bloomshot.game. This is a checklist, not a record of completed store steps.

October 13 workflow audit: upload-key creation is gated to a manual main run and refuses complete or partial signing-secret sets. Release signing uses strict error handling and an exit trap so even a malformed keystore decode removes the temporary file. Same-repository PRs and branch builds receive no real upload key. These guards were inspected locally; they do not establish a real signed Play release.

## The order

| Step | Owner action | Evidence |
|---|---|---|
| 1 | Enroll in Play Console; choose the account type that truthfully describes the publisher; complete identity/device verification | Verified Console account |
| 2 | Set up the merchant payments profile, banking and tax details | Console confirms requirements complete |
| 3 | Publish the policy and finish app setup for the submitted build | Public policy and in-app link work; dashboard tasks complete |
| 4 | Make the Android upload key once | Four signing secrets and public certificate |
| 5 | Run a signed main build and install it through Internal testing | .aab version code and device test report |
| 6 | Start Closed testing and collect meaningful feedback | Eligible testers opted in, test notes and bug fixes |
| 7 | Configure RevenueCat and one product; sandbox-test a second Internal build | Buy/cancel/restore/refund results |
| 8 | Apply for production access and submit the release | Google's approval and published listing |

Steps 2 through 4 can run in parallel. For a new personal developer account, the production-access test requires at least 12 testers who have been opted in continuously for the preceding 14 days. The elapsed time alone does not guarantee access: Google reviews the testing process and readiness. Internal testing does not count toward this requirement.

## 1. Account

Enroll directly in Play Console. Complete the verification tasks shown for the chosen account type. New personal accounts must verify access to a real Android device through the Play Console app. Device verification and actual gameplay testing are separate steps.

Confirm the legal seller and contact details before enrollment. Information displayed to customers depends on account type, monetization and regional trader requirements. Complete the applicable declarations truthfully.

## 2. Payments

Configure the merchant payments profile and the banking/tax details requested by the Console. No in-app product can earn money until the required agreements and payment setup are complete. Credentials and financial details stay in the store/account dashboards, not the repository or chat.

## 3. Policy and app entry

The policy uses **October 14, 2026** and **hello@harborlineleadrecovery.com**, approved by Trevor. Publish the current web build and open https://vexno1r.github.io/Bloomshot/privacy/ before entering that address in the Console. Check the policy link from Settings on the installed app. Both are required.

Private playtests keep result sharing hidden because no public game address or store listing is live. Set `LINKS.web` in `bloomshot/native.js` only after opening the public game address and verifying it works without owner access. Set a platform store link only after that listing is public, then verify a shared result reaches the intended game page. Do not share the owner-only preview address.

Create a **Game**, with downloads **Free** and purchases inside the app. Keep dev.bloomshot.game for the first upload; the first uploaded bundle fixes the app's package identity. Use the listing's player-facing name and current screenshots in docs/store/LISTING.md.

Complete privacy policy, ads, app access, target audience, content rating, Data Safety and Advertising ID forms. The app has no ads, player login or advertising-ID permission. Answer audience questions from the intended audience, rather than inferring audience from the content rating.

For the no-purchases test binary, do not promise available paid products or a Restore control. When RevenueCat is enabled, update forms and listing to match that version. Its current guidance declares purchase history collected for app functionality and analytics (purchase reporting), rather than no collection. Do not add advertising identifiers unless the actual SDK/integrations use them. Console declarations must cover the versions distributed on Play.

## 4. Upload key, once

The upload key signs bundles for Play App Signing. Keep the existing key and all four secrets together; never replace an established key as a routine build fix.

1. In GitHub Settings > Developer settings > Personal access tokens, create a fine-grained token with short expiry, access to **Bloomshot only**, and repository **Secrets: Read and write**.
2. In Bloomshot Settings > Secrets and variables > Actions, add it as **SETUP_TOKEN**. Never paste it into chat or commit it.
3. Run **Create Android upload key** on **main**. It refuses to modify an existing complete or partial signing-secret set. On success it stores ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD, writes the public certificate to the summary and deletes SETUP_TOKEN.
4. Save the public certificate/fingerprint from the summary, then revoke/delete the setup token in GitHub's token settings.

If the workflow fails, inspect its error before retrying. It may have stored only part of the key set, and SETUP_TOKEN may remain. Remove/revoke the setup token after troubleshooting. Never blindly delete signing secrets: recover the original complete key if possible. If the upload key was used in Play and is lost, request an upload-key reset and follow Google's instructions before uploading with a replacement. GitHub cannot show secret values back to you.

## 5. Signed bundle and Internal test

1. Select **Android release bundle**, then **Run workflow** on **main**. Use a new run for every upload. Do not retry an older run after a newer build has been uploaded, and do not rename the workflow file.
2. With all four key secrets present, the workflow publishes a pre-release with bloomshot-<versionCode>.aab. Pull requests, branch builds and missing-key builds use throwaway keys and explicitly label artifacts **DRY-RUN-do-not-upload**.
3. Download the signed .aab from Releases, verify its commit/version, and upload it to Internal testing. Roll out to an email list including your own Play account.
4. Open the opt-in link using that account on the phone, accept, install from Play and record the device checks in MOBILE-RELEASE.md. An APK installed by sideload is useful device QA but does not prove Play installation or billing.

Version codes use the workflow run number plus an attempt slot. There are at most ten attempts per run; the eleventh is rejected to prevent a collision. A retry of an old run can still be older than a more recent run, which is why Play uploads use fresh runs and newer codes.

The release workflow checks the signature, billing permission, absence of advertising-ID permission and 16 KB ELF alignment. The project targets API 36. Also inspect the resolved Play Billing dependency (version 8 or newer under the current policy) and test the installed binary; those build checks alone do not establish store eligibility.

## 6. Closed test

Finish app setup, add testers to a Closed track and submit the release for review through Publishing overview. After approval, send the track's opt-in link. Invite more than the minimum to allow for dropouts.

For a new personal account, at least 12 testers must remain opted in continuously for the preceding 14 days when you apply for production access. Give them real tasks covering tutorial, levels, audio, offline launch, interruptions and save behavior; collect feedback through Play's testing feedback and the support contact. Keep a record of fixes and what was tested. A tester email on a list without an opt-in is insufficient.

You may begin this test with purchases disabled while account/product setup proceeds. Once sandbox checks pass, roll out the verified purchase build to the test track. Do not enable an unverified product for the closed test or production.

## 7. RevenueCat and sandbox purchase

1. Create the RevenueCat account/app and connect it to Play using the current service-credential instructions. Keep service/admin secrets outside the game.
2. Create the product in Play with its exact ID from LISTING.md. Configure the permanent unlock as Non-consumable in RevenueCat; configure powerups as Consumable with no entitlement.
3. For Complete Garden, attach its single product to **all three** entitlements: levels_full, world_koi and style_collection1.
4. Add the Android **public SDK key** to store-config.js and enable only the product under test. Produce a new signed Internal build. This test configuration is not production approval.
5. Add the tester as a license tester and perform the scenarios in STORES.md on the Play-installed binary. Confirm permanent unlock, cancel, already-owned behavior, second-device/reinstall restore and refund; separately test consumable quantities, repeated buys, pending payments, storage/capacity limits and termination during confirmation.
6. Keep unsuccessful products off. Promote a product to wider sale only after recording passing evidence and accurate prices/entitlements.

The campaign, Koi, Keepsakes, bundle and powerup shelf already exist. No new paid game content or separate shop is a prerequisite for the first tested campaign purchase.

## 8. Production access and release

Apply from the Console once the account's testing requirements are met. Describe tester engagement, feedback, changes and why the app is ready. Address any further testing/review requirements; then submit a verified release and product configuration.

The Android launch does not have to wait for Apple enrollment or approval. Store approval and sales are separate from code completion, and neither a revenue amount nor a release date is guaranteed.

## Official references

Checked October 12, 2026; recheck when uploading.

- [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Personal-account Android device verification](https://support.google.com/googleplay/android-developer/answer/14316361)
- [Play App Signing and upload-key reset](https://support.google.com/googleplay/android-developer/answer/9842756)
- [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Play Billing Library support timeline](https://developer.android.com/google/play/billing/deprecation-faq.html)
- [Google Play privacy-policy requirements](https://support.google.com/googleplay/android-developer/answer/10144311)
- [RevenueCat Google Play credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)
- [RevenueCat Data Safety guide](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety)
