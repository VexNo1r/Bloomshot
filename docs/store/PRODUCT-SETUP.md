# Bloomshot purchase setup worksheet

Prepared October 15, 2026 against game commit `2bbfe89321338f49f3d5cdbb17e8cf34b3bdf472`. Account setup, product creation, signing, sandbox purchases and real-device purchase recovery are **not completed**. Trevor confirmed that he has an iPhone and no developer or RevenueCat accounts. This worksheet does not enable purchases.

The source of truth is [`store-config.js`](../../bloomshot/store-config.js), together with [`store.js`](../../bloomshot/store.js) and [`powers.js`](../../bloomshot/powers.js). The current catalog has **13 products: four permanent purchase products and nine consumables. There are three entitlement IDs**, not four. Both SDK keys are empty, every product has `available: false`, and `mockHosts` is empty.

Trevor's chosen launch route is a **free app download on iPhone and Android**, using Individual developer enrollment under his personal legal identity. The first release can retain empty RevenueCat keys and all purchases disabled; RevenueCat/product setup below is for a later billing-enabled test/release, not a prerequisite for distributing a no-purchase build. Store enrollment, signing, device testing and release review still apply. A free download with billing off earns no purchase revenue.

## 1. Create the owner accounts before changing the app

Use the owner-controlled Apple Account for Apple Developer enrollment and App Store Connect, choosing **Individual** with Trevor's verified legal details. Trevor must complete enrollment, identity checks, agreements, tax and banking details himself. Use the separate [iOS launch guide](../IOS-LAUNCH.md) for signing and the first TestFlight upload. Apple lists its payment prerequisites in [Overview of receiving payments](https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments/); this document does not collect that information.

Create a RevenueCat account and a project named **Bloomshot**. Add the Apple App Store app first. Google Play can follow when an Android test device and Play developer account are available. Creating an account or project does not constitute a tested purchase service.

| Field | Value to enter or record |
| --- | --- |
| Displayed app name | `Bloomshot` |
| Apple bundle ID / Android package name | `dev.bloomshot.game` — current code value; availability/registration is unverified |
| Primary localization | English (United States) for these prepared product strings |
| Internal Apple app SKU | Owner-selected, unique internal value; `bloomshot-ios` is a suggestion, not an existing registration |
| Current iOS deployment target | iOS 15.0 in the native project |
| Support contact | `hello@harborlineleadrecovery.com` |
| Privacy policy effective date | October 14, 2026 |
| Privacy policy URL | A final public, unauthenticated HTTPS policy URL; use the verified release URL, not a private playtest URL |
| RevenueCat app records | One App Store app and, later, one Google Play app under the Bloomshot project |
| Account/customer model | Anonymous RevenueCat App User ID; Bloomshot has no player login or cross-platform account |

Do not invent an Apple app ID number, seller name, Team ID, business address, tax identity or registered company. Those come from the owner's actual account.

## 2. Keep the credentials separate

| Item | Where it belongs | What it is for |
| --- | --- | --- |
| RevenueCat **Apple public SDK key** | Eventually `revenueCatKeys.ios`, through a reviewed test/release change | App-to-RevenueCat purchase SDK configuration |
| RevenueCat **Google public SDK key** | Eventually `revenueCatKeys.android` | Android SDK configuration; do not reuse the Apple key |
| Apple **In-App Purchase** `.p8` key, Key ID and Issuer ID | RevenueCat's App Store app settings | RevenueCat's Apple transaction processing |
| Apple **App Store Connect team API** `.p8`, Key ID and Issuer ID | Private upload/signing setup described in `IOS-LAUNCH.md` | Upload automation; this is a different credential from the In-App Purchase key |
| Apple distribution certificate/private key and provisioning profile | Private signing setup, never this catalog | Signing the iOS app |
| Google Cloud service-account JSON | RevenueCat's Google Play app settings | Server-side Play receipt/order access |
| Android upload keystore and passwords | Private release signing setup | Signing uploaded Android builds; not a RevenueCat credential |

Never paste private keys, certificates, passwords, tester emails, receipts or bank/tax information into this public repository. Only the platform-specific RevenueCat **public SDK keys** are intended to ship in app code. A RevenueCat secret/admin API key is not an SDK key.

For the pinned `@revenuecat/purchases-capacitor` **13.7.0**, Apple purchase processing requires the In-App Purchase key. In App Store Connect, open **Users and Access → Integrations → In-App Purchase**, generate and securely download the key, then upload it to the RevenueCat App Store app's **In-app purchase key configuration**, enter the Issuer ID and check credential validation. Do not substitute an upload API key or a legacy subscription shared secret. [RevenueCat's key instructions](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration) explicitly apply to Capacitor 9.0.0 and newer.

The final Apple App ID and signing profile must support **In-App Purchase**. Check the App target's **Signing & Capabilities → In-App Purchase** in Xcode; the checked-in project does not establish that the owner's future signing setup has this capability. The Android checkout at `2bbfe89` has `launchMode="singleTask"`, which must be corrected to `singleTop` or `standard` before billing validation. The separate native release PR contains the proposed correction; verify that both the native and game changes are merged into the tested build. [RevenueCat's Capacitor setup](https://www.revenuecat.com/docs/getting-started/installation/capacitor) explains both requirements and the Android banking-app cancellation risk.

## 3. Enter these exact 13 product identifiers

Create the first four as Apple **Non-Consumable** products and the remaining nine as Apple **Consumable** products. For Google Play, create one-time in-app products, and set their matching RevenueCat product type to **Non-consumable** or **Consumable** respectively. Do not create subscriptions.

Use the **Display name** as the product's internal reference name too, if convenient. The prepared English names fit Apple's 30-character display-name limit and descriptions fit its 45-character description limit. [Apple's product field reference](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information) describes these fields. Add the required review screenshot and notes from the real test build before submission; existing art QA crops are not purchase-review screenshots.

| Product ID | Display name | USD target | Exact delivery / entitlement | Prepared short description |
| --- | --- | --- | --- | --- |
| `bloomshot.world.koi` | Koi Conservatory | $4.99 | `world_koi`; opens Koi pools 3–8 | Unlock Koi pools 3 to 8. |
| `bloomshot.style.collection1` | Keepsake Collection | $1.99 | `style_collection1`; all three paid keepsake styles | Unlock all three keepsake styles. |
| `bloomshot.levels.full` | Levels 5 to 10 | $2.99 | `levels_full`; campaign levels 5–10 | Unlock levels 5 to 10. |
| `bloomshot.bundle.complete1` | Complete Garden | $6.99 | All three entitlements above, permanently | Levels 5 to 10, Koi pools and Keepsakes. |
| `bloomshot.power.sunburst` | Sunburst | $0.29 | +1 Sunburst | One Sunburst powerup. |
| `bloomshot.power.lullaby` | Lullaby | $0.29 | +1 Lullaby | One Lullaby powerup. |
| `bloomshot.power.dandelion` | Dandelion | $0.29 | +1 Dandelion | One Dandelion powerup. |
| `bloomshot.power.beeline` | Bee Line | $0.29 | +1 Bee Line | One Bee Line powerup. |
| `bloomshot.pack.sunburst5` | 5 Sunbursts | $0.49 | +5 Sunbursts | Five Sunburst powerups. |
| `bloomshot.pack.lullaby5` | 5 Lullabies | $0.49 | +5 Lullabies | Five Lullaby powerups. |
| `bloomshot.pack.dandelion5` | 5 Dandelions | $0.49 | +5 Dandelions | Five Dandelion powerups. |
| `bloomshot.pack.beeline5` | 5 Bee Lines | $0.49 | +5 Bee Lines | Five Bee Line powerups. |
| `bloomshot.pack.bag20` | 20-powerup Bag | $1.00 | +5 of each of the four powers, 20 total | Five of each powerup. Twenty in all. |

These are Trevor's approved USD targets, not verified store price points or a promise of the same number in every currency. Verify each console's actual selectable price and local storefront offer. If a target cannot be configured, stop and obtain Trevor's price decision; do not silently substitute $0.99 for $1.00 or change any other price. The runtime uses the store's localized price once the product loads.

Never create or sell the retired `bloomshot.pack.bag12`. The code recognizes its older saved grants as three of each power, but it is not one of the 13 current products. Do not reuse that identifier for the twenty bag.

## 4. Attach the three RevenueCat entitlements

In **Product catalog → Entitlements**, create exactly these identifiers, then attach the matching products for each configured store:

| Entitlement ID | Suggested description | Attach these products |
| --- | --- | --- |
| `levels_full` | Campaign levels 5 to 10 | `bloomshot.levels.full`, `bloomshot.bundle.complete1` |
| `world_koi` | Koi Conservatory pools 3 to 8 | `bloomshot.world.koi`, `bloomshot.bundle.complete1` |
| `style_collection1` | Keepsake Collection | `bloomshot.style.collection1`, `bloomshot.bundle.complete1` |

Attach **none** of the nine consumables to an entitlement. They grant inventory through Bloomshot's local transaction ledger. RevenueCat tracks the transaction but does not manage this game's spent powerup balance. [RevenueCat's non-subscription guidance](https://www.revenuecat.com/docs/platform-resources/non-subscriptions) explains this distinction.

Bloomshot currently fetches these products directly with `getProducts(..., type: 'NON_SUBSCRIPTION')` and calls `purchaseStoreProduct`. It does not read RevenueCat Offerings or use a RevenueCat paywall. An Offering/package setup is optional for this implementation; it does not replace creating the products or attaching all three bundle entitlements.

Record the project's purchase-transfer setting. Because this app uses anonymous users, a permanent purchase must be recoverable by the same store account after reinstall. RevenueCat recommends **Transfer to new App User ID** for apps without their own account system; verify the chosen behavior in the reinstall test. Do not promise that purchases transfer between iPhone and Android. [Restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior).

## 5. Finish each store connection

For Apple, check the final bundle ID, the In-App Purchase key validation and both sandbox/production App Store Server Notification destinations in RevenueCat/App Store Connect. Notifications are needed for reliable one-time-purchase refund detection; verify receipt of a test notification before recording the refund test as ready. See [Platform Server Notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications).

For Google later, create/select a Google Cloud project; enable the Google Play Android Developer, Play Developer Reporting and Pub/Sub APIs. Create a service account with Pub/Sub Editor and Monitoring Viewer roles, download its JSON key securely, and invite its `client_email` in Play Console **Users and permissions** for Bloomshot. RevenueCat's current guide lists four permissions: **View app information and download bulk reports**, **View financial data, orders, and cancellation survey responses**, **Manage orders and subscriptions**, and **Manage store presence**. Upload the JSON in RevenueCat's Google Play app settings, configure Real-Time Developer Notifications and validate credentials. New credentials can require propagation time. Follow the current [Google Play service-credential guide](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials), rather than copying an old permission checklist.

## 6. Privacy and test-build gates

Before enabling RevenueCat, reconcile the actual dashboard integrations, SDK build and submitted privacy answers with [`PRIVACY-POLICY.md`](PRIVACY-POLICY.md). For Apple with the current anonymous/no-advertising setup, RevenueCat requires **Purchase History** for **App Functionality** and **Analytics** (purchase reporting); identity linkage and tracking answers depend on actual configuration. Do not declare payment-card collection by Bloomshot. See [Apple App Privacy](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy).

For Google, RevenueCat's guidance calls for **Purchase history** collection, not ephemeral processing, for app functionality and analytics. Sharing and identifier answers depend on integrations and the service-provider relationship. Confirm the support process can handle purchase-record deletion requests before claiming it can. See [Google Play Data Safety](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety). A no-ads/no-login game with billing enabled must not claim that it collects no data.

Leave the shipped catalog disabled. After setup, prepare a **separate, private native sandbox build** with the correct platform public key and only the product under test available. This is necessary to exercise the store sheet; it is not permission to enable production sales. Keep mock/review saves separate, follow the [sandbox test plan](SANDBOX-TEST-PLAN.md), and promote each product only after its recorded physical-device checks pass and the owner approves release. No account, console configuration, purchase or enablement is completed by this worksheet.
