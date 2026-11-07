# Bloomshot native purchase test plan

Prepared October 15, 2026 for the catalog at `2bbfe89321338f49f3d5cdbb17e8cf34b3bdf472`. **All tests below are not run on a real device.** Local fake-plugin tests, browser playtests, successful builds and this document are not purchase evidence. Trevor currently has an iPhone and no store/RevenueCat accounts.

Use [Product setup](PRODUCT-SETUP.md) for the exact 13 SKUs, prices, credential destinations and three entitlements. Use [iOS launch](../IOS-LAUNCH.md) and [Mobile release](../MOBILE-RELEASE.md) for signing/upload. The tested build must include both the native release work and the current game; record its actual commit/build identifiers.

For Trevor's free-download first release, leave RevenueCat unconfigured and every SKU disabled. The disabled-build case and normal native/device release checks apply; the billing cases remain **Not run** and block a future purchase-enabled release, rather than falsely blocking the no-purchase app on accounts/products it does not yet use.

## Prepare a native sandbox session

1. Complete the owner account, App Store Connect product, RevenueCat Apple credential and In-App Purchase capability gates in the setup worksheet. Do not put secret key material in test reports.
2. Have the engineer prepare a private native test build with the Apple public SDK key and only the SKU under test enabled. The shipped configuration remains disabled. Do not use the RevenueCat Test Store key as proof of Apple billing.
3. Install that build through TestFlight or the documented development-signing route on Trevor's actual iPhone. A Safari playtest, home-screen website or `?alllevels` link cannot test StoreKit.
4. Create/verify the sandbox tester in App Store Connect and follow the current device sign-in instructions. TestFlight purchases use Apple's sandbox; record the test environment and the purchasing account without publishing its email. RevenueCat notes that sandbox product metadata can be inconsistent, so retain the sheet's displayed price/currency and console settings as separate evidence. [Apple sandbox and TestFlight guidance](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store).
5. Start from the normal native save: no `?qa`, `?alllevels`, `?bosses` or `?mockstore`. Record the four power counts and owned entitlements before each case. Use separate sandbox identities to test mutually exclusive fresh single-product and bundle cases.
6. Open the Levels/powerup shelf or the relevant locked-content card. Buy only from those out-of-run screens. Keep Settings → Restore purchases available. Screen-record the app and store sheet where practical, omitting account credentials.

RevenueCat's own Test Store and local mock mode are useful development checks, but the final native billing gate requires the real platform sandbox. [RevenueCat sandbox testing](https://www.revenuecat.com/docs/test-and-launch/sandbox).

For Android later, use a real Android device, the same package ID, the test-track opt-in, and an account explicitly configured under Play Console **License testing**. Track membership alone does not make purchases free: verify that the Google sheet shows a test payment instrument. Exercise the bank-verification background/return path after the native `singleTask` correction is present. [Google's billing-test guidance](https://developer.android.com/google/play/billing/test) and [RevenueCat's Google sandbox guide](https://www.revenuecat.com/docs/test-and-launch/sandbox/google-play-store). An iPhone pass does not certify Android.

## Record every case

For each run retain: date/time and tester initials; device/model/OS; native app version/build number and game commit; store, sandbox environment and storefront; product ID; expected price/currency; initial and final counts/entitlements; outcome; a private purchase/transaction reference; relevant RevenueCat sandbox event and redacted app log; and evidence location. Put **Pass**, **Fail**, **Blocked** or **Not run** beside each case. Never record a pass from an expected result alone.

Do not commit real receipts, purchase tokens, App User IDs, tester emails or credentials to GitHub. A short sanitized summary may point to privately retained evidence.

## Product acceptance ledger

Each row starts **Not run** on both stores. Test the exact contents; do not substitute one single SKU for all nine consumables.

| Product ID | Expected successful result | iPhone | Android |
| --- | --- | --- | --- |
| `bloomshot.world.koi` | `world_koi`; Koi pools 3–8 open | Not run | Not run |
| `bloomshot.style.collection1` | `style_collection1`; all three styles open | Not run | Not run |
| `bloomshot.levels.full` | `levels_full`; levels 5–10 open | Not run | Not run |
| `bloomshot.bundle.complete1` | All three entitlements, with all content playable | Not run | Not run |
| `bloomshot.power.sunburst` | Exactly +1 Sunburst | Not run | Not run |
| `bloomshot.power.lullaby` | Exactly +1 Lullaby | Not run | Not run |
| `bloomshot.power.dandelion` | Exactly +1 Dandelion | Not run | Not run |
| `bloomshot.power.beeline` | Exactly +1 Bee Line | Not run | Not run |
| `bloomshot.pack.sunburst5` | Exactly +5 Sunbursts | Not run | Not run |
| `bloomshot.pack.lullaby5` | Exactly +5 Lullabies | Not run | Not run |
| `bloomshot.pack.dandelion5` | Exactly +5 Dandelions | Not run | Not run |
| `bloomshot.pack.beeline5` | Exactly +5 Bee Lines | Not run | Not run |
| `bloomshot.pack.bag20` | Exactly +5 of each power, 20 total, atomically | Not run | Not run |

For each permanent product test successful buy, cancel, repeated tap/already-owned behavior, restart/offline access, same-store restore and refund/revocation. For each consumable test successful buy, cancel, two successive distinct purchases, restart and Restore without replaying old grants. Run the shared recovery/failure cases below for the appropriate single, five-pack, mixed-pack and permanent/bundle paths on each platform.

## Shared test matrix

All rows are **Not run on a real device** until evidence is attached.

| Case | Action / test state | Required observation |
| --- | --- | --- |
| Disabled build | Use the unmodified shipped catalog and empty keys | No purchase sheet, charge or invented ownership; web mode sells nothing |
| Product loading | Load each enabled test SKU online | Exact ID, real store price/currency, correct contents; missing product refuses before payment |
| Success | Complete the platform sandbox sheet | Matching RevenueCat sandbox transaction; correct unlock or exact inventory increment once |
| Cancel | Cancel the real sheet | No grant, no entitlement change; retry is possible |
| Rapid taps | Tap twice while the first sheet is opening/active | One sheet; second request blocked; one transaction/grant |
| Already owned | Tap a previously bought permanent item | No second charge; content stays available |
| Complete Garden | Buy on an account owning none of its contents | All three entitlement IDs active, not just the first one |
| Partly owned bundle | Own any single item, then visit the bundle offer | Bundle not sold at full price; remaining singles are usable |
| Repeated consumable | Buy the same SKU twice | Two distinct transaction IDs and exactly two grants, never an “owned forever” powerup |
| Same-install replay | Reopen and Restore repeatedly after a completed buy | No duplicate inventory; previously delivered transaction stays delivered |
| Kill during confirmation | Terminate from the app switcher after approving the sheet; reopen online, then Restore if needed | Durable same-install intent recovers a confirmed transaction exactly once; no automatic second purchase sheet |
| Connectivity interruption | Disconnect during receipt confirmation; reopen offline, then online | No false success or “nothing charged” claim for an uncertain result; original intent survives until checked |
| Delayed payment completes | Use a supported pending/deferred sandbox flow, then let it succeed while app is closed | No premature grant; reopen/Restore settles one confirmed transaction once |
| Delayed payment declines | Use a supported pending/deferred flow, then decline/cancel it at the store | No grant; verify same-SKU purchase can eventually be retried safely, or mark blocked for recovery work |
| Clock skew | With a test build/device setup, change device time around an interrupted purchase | Reconciliation uses transaction identity, not a local-date cutoff; no lost or duplicate grant |
| Pre-purchase storage failure | Controlled native test fixture makes durable save or intent readback fail | Purchase refused before opening the sheet; no charge |
| Post-purchase storage failure | Controlled native fixture fails the game-save write after a confirmed transaction | Whole grant remains owed; after writes recover, retry/relaunch delivers it once |
| Capacity, single/pack | At 999 of a power, or 995 before buying five | Shelf refuses a pack that would exceed 999; a pack that fits is delivered in full |
| Capacity, mixed bag | One power at 995 and the others lower | Entire bag refused before purchase; never sell/deliver only the part that fits |
| Capacity after payment | In a controlled test fixture, make one count overflow before delivery | Whole paid grant stays pending; after room is made, all 20 arrive atomically once |
| Backup still loading | Launch native while its Preferences restore is deliberately delayed | No paid grant acknowledged into an unverified/stale in-memory save; authoritative normal save receives it later |
| QA isolation | Controlled native `?qa` test and a separate localhost mock session | Native review/QA save does not acknowledge real grants; mock/review counts never appear in the normal save |
| Offline ownership | Buy a permanent item, exit, reopen offline; later return online | Last verified ownership retained offline; provider's refreshed answer becomes authoritative online |
| Permanent reinstall | On a sacrificial test install/account, remove local data and reinstall, then Restore with the same store account | Eligible permanent entitlements return under the configured RevenueCat transfer behavior; local progress is a separate matter |
| Consumable reinstall | Repeat with previously spent/unspent powers; Restore | No invented regrant of old transactions; do not promise a restored consumable balance or game progress |
| Refund/revoke | Use the store's supported sandbox/refund path and verify notification arrival | Permanent ownership reflects provider revocation after refresh; no duplicate consumable grant; record actual latency |
| Resume after store/bank app | Background/foreground during the native sheet or verification handoff | One coherent result, no duplicate sheet/grant, game/save usable after returning |

Use Google's slow test instruments where available for pending-completes and pending-declines cases; Apple deferred/interrupted behavior needs its own supported sandbox method. A local mock “pending” result is not evidence of either platform's real pending lifecycle. [Google testing documentation](https://developer.android.com/google/play/billing/test).

Storage, backup-delay, capacity-race and clock cases may need an engineer-controlled native QA fixture. Label that evidence as **fault injection** and keep the shipped runtime unchanged. A simple browser mock cannot close those native failure cases.

## Recovery limits and release blockers

`store.js` keeps a local baseline of transaction IDs, unresolved consumable intents and owed grants. `app.js` must persist the complete inventory update and receipt before acknowledging delivery. The game caps each power at 999; its save retains the latest 50 delivered receipt IDs while the store ledger retains its seen IDs. Keep both intact for same-install recovery. Never erase a pending intent simply to make a test turn green.

Bloomshot has no account/backend balance service. After a reinstall or on another device, old consumable history is treated as history, not a fresh grant. RevenueCat distinguishes restoration of permanent access from recovery of finished consumables; the latter needs an account system this game does not have. [Restoring purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases). OS backup behavior is not a substitute for a documented guarantee.

The current implementation preserves uncertain/pending consumable intent without an expiry. If a later store decline leaves that SKU blocked indefinitely, **fail the recovery case** and keep that product disabled until a verified resolution exists. Do not invent a timeout that might discard a real charge.

Consumable refunds are purchase records, not an implemented subtraction from this local inventory. The present app does not claw back granted powerups automatically. Confirm the intended support/refund handling before enabling consumable sales; do not describe the balance as server-secured. Reliable one-time-purchase refund detection needs the configured [platform notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications).

The billing follow-up corrects the reviewed commit's Restore message: already-owned permanent unlocks, recovered consumable purchases, confirmed grants waiting to be saved and unresolved payment confirmation have separate messages. Restore also retries a same-install owed grant through the existing save handler after a successful store check. Automated store and actual UI-handler tests cover these states; the native cases above remain **Not run** until observed on a phone. An empty Restore result does not mean the account never bought consumables or that local game progress can be recovered.

Check the enabled SDK/integrations against the published policy and console privacy answers, including purchase-history collection. Do not select a no-data declaration merely because login and ads are absent. Keep the real-phone result log separate from the browser/engine QA reports.

## Product-by-product enablement record

Only after the relevant cases pass may a reviewed release change enable a SKU on the tested platform. Keep untested products disabled. The current `available` flag is shared by the catalog, so **an iPhone sandbox pass alone does not authorize an Android build to sell the same SKU**; gate the release/build configuration accordingly.

For each promoted SKU record: passing evidence location, device/OS, store, actual product price/currency, build/commit, tester, cancellation/recovery/restore/refund result, remaining limitations and owner release approval. Preserve the approved prices and fixed contents. No SKU has a passing record yet.
