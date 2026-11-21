# Bloomshot native source

Updated October 13, 2026. This folder is the Capacitor Android/iOS shell for the game in ../bloomshot. The application identifier is dev.bloomshot.game; the player-facing name is Bloomshot. Edit the source game, never generated www files.

## Included

- Capacitor 8.5.2 with pinned core/CLI/platform dependencies and a reproducible npm lockfile.
- The current campaign, free Garden/Moon modes, Koi, Keepsakes, powerups and purchase UI, bundled locally for offline gameplay.
- Haptics, Preferences save backup, native sharing and RevenueCat purchase support. RevenueCat keys are empty and catalog products disabled; no real purchase is offered yet.
- Committed Android Gradle and iOS Xcode/Swift Package Manager projects, launcher icons and splash assets.
- A UserDefaults privacy manifest in ios/App/App/PrivacyInfo.xcprivacy.

Android debug and unsigned iOS simulator cloud builds passed October 12, 2026. No real-device or simulator launch and no real-store purchase has been verified. A compile result is not a store-ready release.

## Rebuild

Use Node 22 or newer. Run **npm ci**, **npm run sync**, then **npm run check** from this folder.

Use sync:android or sync:ios to refresh one platform. scripts/prepare-web.cjs copies the runtime assets from the game's sw.js list and removes browser installation/service-worker controls. scripts/check.cjs verifies source and generated hashes, missing resources, local asset references and the absence of a remote Capacitor server URL.

www/, web-inventory.json, platform public copies, dependencies, build caches and local settings are generated and gitignored. Do not commit signing keys, profiles or credentials. The packaging check does not test game behavior, compilation, billing or store policy.

## Android

Use JDK 21 and Android SDK 36 for the committed project (minimum API 24). The Gradle wrapper downloads its dependencies on first build. On a configured machine, run **npm run sync:android**, then **npm run open:android**.

**Android debug APK** in GitHub Actions produces an installable debug artifact with no store account. **Android release bundle** produces an .aab; only a manual run on main can receive the real upload key and publish a signed pre-release. Pull requests, branch runs and missing-key runs use a throwaway key and label the result DRY-RUN-do-not-upload. Never upload that result to Play.

Start every Play build with **Run workflow** on main, not a retry of an old run, and upload only a newer version code. See ../docs/PLAY-LAUNCH.md for key setup and track rollout.

## iPhone and iPad

Use macOS with Xcode 26 or newer. Capacitor uses Swift Package Manager. Run **npm run sync:ios**, then **npm run open:ios**.

**iOS simulator build** checks unsigned compilation. It cannot be installed on an iPhone and does not create a TestFlight/App Store upload. Configure the developer team, signing and release archive after Apple enrollment. The project supports iPhone portrait and iPad orientations; test each supported device class.

**iOS release archive** is a prepared manual workflow for `main`, requiring the Apple Distribution private-key/certificate P12, its password, the matching App Store Connect provisioning profile and the Team ID. It checks those assets, creates a temporary signing keychain, applies signing to the App Release target, and archives/exports an IPA on macOS. An explicit input optionally validates/uploads with an App Store Connect team API key; export without upload is the default. Its cleanup removes temporary signing material, and the artifact includes build/source/upload metadata. See ../docs/MOBILE-RELEASE.md for all secret names and the exact sequence.

This release workflow has not yet been run with real signing assets. No signed archive, export, upload or TestFlight install is verified. The owner still needs Apple enrollment/app setup and physical-device testing. Purchases remain off until RevenueCat/store configuration and sandbox verification are complete.

## Save and release limits

The native app and website have separate saves. In the app, native.js mirrors progress to Preferences and checks the backup when WebView storage is missing. This does not provide an account or cross-platform sync, and does not guarantee progress after deleting/reinstalling the app. OS-managed backups may restore data depending on platform settings. A store Restore action restores eligible permanent purchases; it does not restore spent powerups or local run progress.

Complete the device and purchase checks in ../docs/MOBILE-RELEASE.md and ../docs/STORES.md before claiming release readiness. Developer enrollment, identity verification, payments/tax details, store product configuration and store approval remain external launch gates.

The xcode/uuid override in package.json is retained from the original shell setup. Re-run **npm audit** when dependencies change; a past clean audit is not a guarantee about current dependencies.
