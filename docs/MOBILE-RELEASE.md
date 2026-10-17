# Bloomshot mobile launch: current status and order

Updated October 16, 2026 from the repository and Trevor's account-status confirmation. Both native projects and build scripts are in the repository. Account setup, compilation, signing, installed-phone testing and purchases are separate gates.

## Merge and launch order

1. **Completed: [PR #30](https://github.com/VexNo1r/Bloomshot/pull/30) is merged.** It prepares workflows, safer Android purchase returns and documentation; it does not create signing keys, dispatch the manual iOS archive, upload to Apple or enable sales.
2. **Hold [PR #31](https://github.com/VexNo1r/Bloomshot/pull/31) until Trevor approves the latest game playtest**, then merge it into main after its checks pass. Both PRs target main independently. If GitHub shows conflicts or failures, resolve them before asking Trevor to merge.
3. **Run a release archive only after both are merged and main contains the approved game.** The archive requires the offline privacy.html supplied by the game update. Verify the main commit and rerun packaging/unsigned compilation for that candidate.
4. Apple enrollment and app-record setup can proceed alongside interim website testing. TestFlight and Play testing of the installed apps are required before release. Public website/store publication remains a later owner approval.

PR #31 includes main after the #30 merge. Its checks must pass against current main before Trevor merges it. Merging is not approval to publish the game.

## Current facts

| Item | Verified state / required next evidence |
|---|---|
| Owner device | Trevor reports iPhone 13, iOS 26.6.2 and Low Power Mode off. His website report is not installed-app acceptance. Android device access is still needed. |
| Accounts | Trevor submitted Apple Individual enrollment under his personal legal name; membership activation is unverified. Google Play and RevenueCat remain outstanding at last confirmation. Identity, agreements, tax/banking and payment steps belong to Trevor. |
| App identity | Visible name **Bloomshot**; retained bundle/package ID **dev.bloomshot.game**. Confirm that ID/name in the actual app record; do not silently change native identifiers. |
| Billing | Public RevenueCat keys are blank and products disabled. Approved USD targets: $0.29 single, $0.49 for five of one kind, $1.00 for twenty mixed, five of each. These are planned prices; verify the merged catalog and store choices before enabling. |
| Policy | Contact **hello@harborlineleadrecovery.com**, effective **October 14, 2026**. Verify the merged offline Settings policy and an accessible public policy URL before submission. |
| iOS simulator | Game commit d647d922aaba7d13578953218b4462d34eddec4b compiled, installed and launched unsigned in iPhone 17 / iOS 26.5 Simulator in [run 38997583590](https://github.com/VexNo1r/Bloomshot/actions/runs/38997583590). The retained screenshot was visually reviewed and shows the tutorial, flowers, pod, scene and lower controls. No physical-phone interaction, audio, FPS, signing or purchase acceptance is established. |
| Android debug | The same d647d9 source compiled in [run 38997586106](https://github.com/VexNo1r/Bloomshot/actions/runs/38997586106); all 34 game assets in the downloaded APK match that Git source and the documented native HTML transformation. This is a debug test build, not a Play upload candidate or Android installation test. |
| iOS distribution | Archive/export/upload workflow prepared. No real certificate/profile import, signed Release export, Apple upload, TestFlight installation or sandbox purchase is verified. |
| Android return path | MainActivity now uses singleTop. The packaging guard rejects singleTask, following [RevenueCat's bank-verification return requirement](https://www.revenuecat.com/docs/getting-started/installation/capacitor). Actual banking-app return remains a sandbox test. |

This independent release branch deliberately does not contain unmerged game revisions; its older local catalog is not the launch configuration. The approved game update supplies [Product setup](store/PRODUCT-SETUP.md) and [Sandbox test plan](store/SANDBOX-TEST-PLAN.md).

## iPhone first

Follow [IOS-LAUNCH.md](IOS-LAUNCH.md), in this order:

1. Free Safari playtest and owner game approval. A website needs no paid Apple membership.
2. Apple Account with two-factor authentication → Individual Developer Program enrollment → active membership.
3. Explicit bundle ID → matching App Store Connect iOS app record.
4. Apple Distribution certificate/private-key P12 → matching App Store Connect provisioning profile → four signing secrets.
5. Approved main commit → fresh build number → **iOS release archive with upload unchecked** → inspect signed artifact.
6. Separate upload API key, if automated upload is used → new build number with upload selected → wait for Apple processing.
7. Manually managed internal TestFlight group → actual iPhone install and device report.
8. Paid Apps Agreement/tax/banking and store/RevenueCat setup → real sandbox evidence for one product at a time.
9. Accurate listing/media/privacy/compliance and review details → Trevor approves App Review submission and release.

App downloads are planned to be free. Paid membership is Apple's developer enrollment, not a charge to players. TestFlight and an App Store upload do not publish the app.

The source supports iPad as well as iPhone. Verify iPad layouts/orientations and required media before universal submission. The cloud macOS runner avoids needing a local Mac for compilation; it does not create the owner's signing identity or complete account tasks.

## Android after access to a test phone

Use the updated [Play guide](PLAY-LAUNCH.md) from the merged game. Trevor chose an individual publisher; do not infer that a business contact email establishes an Organization account.

1. Trevor enrolls and completes Google's identity/device and payments tasks.
2. Make the upload key once with **Create Android upload key** on main. Retain the complete key set.
3. Start a new **Android release bundle** run on main. Only an explicitly signed .aab belongs in Play; **DRY-RUN-do-not-upload** artifacts do not.
4. Complete app/policy forms, upload to Internal testing and install through Play on a real Android phone.
5. Configure products/RevenueCat; record purchase and bank-verification-return tests. Complete applicable closed-testing/production-access gates before requesting production.

An Android debug APK or compilation does not prove Play installation or billing. Recheck store requirements and the resolved release billing dependency when uploading.

## Evidence to retain

The installed apps target 60 FPS, with Graphics defaulting to Maximum. Balanced/Performance and an optional local frame-rate display come from PR #31. Complete [the native performance checklist](PERFORMANCE.md) on real iPhone and Android installations; desktop callback measurements or the private website do not establish native performance acceptance.

Record source commit, workflow URL, artifact version/build, product IDs, device/OS, tester/date and reproducible results. Keep browser emulation, unsigned compile, signed export, processed upload, phone install and sandbox transaction as separate evidence.

The seven exact iOS secret names, export-only default, optional upload and cleanup behavior are in [IOS-LAUNCH.md](IOS-LAUNCH.md). No account, agreement, private key or live product is created by the workflows. Either platform can earn only after its own approval and purchase gates pass; no approval date, sales or popularity is guaranteed.
