# Purchases: how the store layer works

Updated October 12, 2026. The purchase layer and paid content are implemented and have local automated coverage, but **no real store purchase has been tested**. Trevor confirmed that developer and RevenueCat accounts are not set up. Both public SDK keys are empty and every product is disabled in the shipped configuration.

## What exists

| File | Job |
|---|---|
| `bloomshot/store-config.js` | The catalog (product ids, entitlement ids, test prices) and the RevenueCat public keys. Edit this file to change what is sold. |
| `bloomshot/store.js` | `BloomStore`: init, `products()`, `owns(entitlement)`, `purchase(productId)`, `restore()`, `subscribe(fn)`, and for powerups `onConsumable(fn)`, `deliver(fn)` and `pendingGrants()`. |
| `bloomshot/store-ui.js` | A "Purchases" section in Settings with **Restore purchases**. It stays hidden unless a store is live. |
| `bloomshot/qa/test-store.cjs` | Fake-plugin checks for purchases, bundles, consumables, pending payment, reinstall and shipped-catalog consistency. These do not verify a native store purchase. |

The campaign unlock opens levels 5 to 10 (`levels_full`), with a free preview of the first three waves of level 5. Koi pools 3 to 8 use `world_koi`; Keepsakes use `style_collection1`. The Complete Garden grants all three. The Levels page already has the unlock card and powerup shelf; Settings provides Restore when the store is live. A disabled product is not a purchase offer.

The prepared Android bundle and iOS archive/export workflows package the current catalog exactly as configured. Signing an app or uploading it to a test track does not enable billing. The iOS release workflow is prepared but unverified with real signing assets; follow `MOBILE-RELEASE.md` before using TestFlight for the purchase checks below.

## Three modes, chosen at startup

- **native**: inside the Capacitor app. The store (through RevenueCat) is the only source of truth. Owned items are cached locally only so the first screen paints; the store's answer replaces the cache on every launch, so refunds take effect. If the app is offline, the last known answer is kept.
- **mock**: simulated purchases for development. Only on `localhost`, or on a hostname listed in `mockHosts`, and only with `?mockstore=1`. The public website can never enter this mode.
- **web**: the website sells nothing. `owns()` is always false, whatever is in storage.

## Rules the code enforces

1. A product with `available: false` cannot be purchased. Enable each product only after its content is playable and its actual-phone sandbox buy/cancel/restore/refund checks pass.
2. If no RevenueCat key is set for the platform, the store stays off and sells nothing.
3. A second tap during a purchase is refused, so a player cannot be charged twice.
4. A confirmed cancellation does not grant an item. An uncertain store response preserves the pending receipt, blocks a second purchase sheet and directs the player to reopen or Restore purchases; it must not claim that nothing was charged.
5. The 'Restore purchases' button is always present once a store is live (Apple requires it).
6. A bundle is never sold to someone who already owns part of it. `purchase()` answers `{ ok: false, reason: 'partly-owned', owned: [...] }` before the store is opened, so nobody pays full price for something they have.
7. A bundle must grant everything it lists. If the store reports success but an entitlement is missing (the product was not attached to all of them in RevenueCat), `purchase()` answers `{ ok: false, reason: 'not-granted', missing: [...] }` rather than pretending.
8. Paid powerups use a transaction ledger and game-save receipt IDs to avoid duplicate grants and recover interrupted purchases. This depends on intact local storage; do not promise that clearing data, an OS backup or reinstallation restores consumables. See "Powerups" below and verify failure/recovery on real devices before enabling sales.

## Setting it up when the accounts exist

1. Create the app in App Store Connect and Google Play Console with the final app id (the placeholder `dev.bloomshot.game` is not claimed anywhere; the first upload to any track, even internal testing, claims it for good).
2. Create each unlock as a **non-consumable** (Apple) / **one-time in-app product** (Google), and each powerup as a **consumable** (Apple) / **one-time in-app product** (Google), with the ids in `store-config.js`.
3. In RevenueCat: add the store app and products. Configure Google Play permanent unlocks as **Non-consumable** and powerups as **Consumable**; a consumed unlock cannot be restored. Attach powerups to **no** entitlement. Create the entitlements `world_koi`, `style_collection1` and `levels_full`, and copy only the platform's **public SDK key** into `revenueCatKeys`. Never ship a secret/admin key. Attach `bloomshot.bundle.complete1` to **all three** entitlements. An Android launch can proceed before Apple enrollment; configure the iOS app and key when its account exists.
4. The purchase plugin is already installed: `@revenuecat/purchases-capacitor` 13.7.0 is pinned in `native/package.json` and is part of the Android and iOS projects (it compiled in both cloud builds). It does nothing until a public SDK key is set in step 3, because the store stays off without one. The game finds the plugin as `Capacitor.Plugins.Purchases`, which the native WebView injects, so no bundler is needed (`Capacitor.registerPlugin` only exists when `@capacitor/core` is bundled into the page, so it is only a fallback).
5. `native/scripts/prepare-web.cjs` already tolerates the store script tags: the runtime copy is built from the `sw.js` ASSETS list, which includes `store-config.js`, `store.js` and `store-ui.js`.
6. Build a test version with the platform's public SDK key set and `available: true` for the one product under test, and give it only to testers (TestFlight, or Google Play Internal testing). Test with a sandbox Apple account and Google license testers. Check: buy, cancel, buy again (should say already owned), restore on a second device, refund. For a powerup: buy it twice (two grants), close the app from the app switcher while the store sheet is confirming and reopen (granted once), then Restore (nothing more).
7. Only after those checks pass does a build with that product on sale go to wider testing or the public release. For Google Play the exact order is in `docs/PLAY-LAUNCH.md`, step 8.

## Bundles

A bundle is one store product (`bloomshot.bundle.complete1`, the Complete Garden: levels 5 to 10, the Koi Conservatory and the Keepsake Collection) that grants several entitlements. It replaced the Launch Bundle (Koi and Keepsakes only), which was never created in a console. In `store-config.js` it lists them in an `entitlements` array instead of the single `entitlement` string; everything else about a product is the same, and it stays `available: false` like the others until a sandbox buy and restore work.

Each item in `BloomStore.products()` carries:

| Field | Meaning |
|---|---|
| `entitlements` | Every entitlement the product grants (one element for a single item). `entitlement` is the first, kept for older code. |
| `owned` | The player already has all of them. Owning all three single items counts as owning the bundle. |
| `partial` | The player has some but not all. Do not offer the bundle then; offer the remaining single item instead. |
| `amount`, `currency` | The same price as `price`, as a number and an ISO code: the store's own (`StoreProduct.price` and `currencyCode`) once it has loaded, otherwise parsed from the USD `priceHint`, otherwise `null`. Compare prices only when every amount is finite and the currencies match, for example to say "You save $0.99". |

`purchase()` results always include `entitlements`. Restore (`restore()`) lists the entitlements it brought back in `restored` and their player-facing names in `names`, so the Settings message can say "Restored Koi Conservatory and Keepsake Collection" even when one bundle purchase brought both.

Test mode: the simulated store remembers what the test account bought, so **Restore purchases** works in test mode too. From a browser console on localhost with `?mockstore=1`, `BloomStore.dev.forgetLocal()` simulates a reinstall (the device loses its unlocks, the account keeps its purchases) and `BloomStore.dev.reset()` makes a brand new account.

Pricing rule: the bundle must cost less than its items together, in every storefront. The suggested $6.99 against $2.99 plus $4.99 plus $1.99 ($9.97) is checked by the tests; when final prices are chosen, compare the store price tiers for each currency, because tiers do not always line up.

## Powerups (consumables)

Four powerups are sold: Sunburst, Lullaby, Dandelion and Bee Line. Each comes singly (`bloomshot.power.sunburst`, `.lullaby`, `.dandelion`, `.beeline`) and in a pack of five (`bloomshot.pack.sunburst5`, `.lullaby5`, `.dandelion5`, `.beeline5`), and the 20-powerup Bag (`bloomshot.pack.bag20`) holds five of each. Contents are fixed and always shown; nothing is random. The game designs them and drops them free on regular even waves; the store only sells them. A powerup is bought again and again and is never owned. In `store-config.js` it has `consumable: true` and `kind: 'power'` instead of an entitlement, and either `power` (the game's key) with `count` (how many one purchase gives), or, for a mixed pack, `powers: { sunburst: 5, ... }`. `products()` reports `consumable`, `items` (always a list of `{ power, count }`), `power` (only when there is one kind, else `null`) and `count` (the total), with `owned` and `partial` always false. A pack whose items are not all positive whole counts of a named power is never sold.

The store does not change the player's save. A purchase becomes a **grant** `{ transaction, productId, power, count, items }` (`transaction` is the store's transaction id) that waits in a small ledger (`bloomshot.grants.v1` in local storage) until the game takes it:

- `onConsumable(fn)`: the game's one handler. It gets every waiting grant once the store is ready and every new one as it arrives, before `purchase()` answers. `fn` adds every one of `items` to the save under the grant's one transaction id, writes the save, and returns `true`; only then is the grant marked delivered, so a pack is never half delivered. Anything else (false, a throw) leaves it waiting, and it is offered again at the next launch or when `onConsumable` is called again. The game also keeps the last transaction ids it has applied in its save, so even a replayed grant cannot count twice.
- `purchase(id)` answers `{ ok: true, consumable: true, power, count, items, transaction, delivered }`, `{ ok: false, cancelled: true, reason: 'cancelled' }`, `{ ok: false, pending: true, reason: 'pending' }` (Google Play: a slow payment method; nothing charged yet), or another `reason`. `delivered` is false only if the handler did not take it. A second tap during a buy is refused as `busy`.
- `deliver(fn)` and `pendingGrants()` do the same by hand: take, or just list, the waiting grants.

How it stays exactly-once. RevenueCat finishes (Apple) or consumes (Google) a consumable as soon as it has verified it, before the game sees it, so the app cannot hold the transaction open; the ledger does that job instead. Before opening the store sheet the ledger durably records this install's purchase intent and known transaction IDs. The store's answer turns into a grant at once. If the app is killed before the answer arrives, or payment confirmation fails, the next launch or Restore finds the new transaction in RevenueCat's one-time purchase list (`nonSubscriptionTransactions`) and claims it for that intent. Uncertain confirmation errors preserve the intent without an expiry and prevent opening a second sheet for that product. Cancellation or a definite refusal clears it. Recovery compares transaction IDs rather than the device clock. Transactions bought before a reinstall or on another device are only noted, never granted again. Neither store restores spent consumables, and nor does the game. This recovery still requires the same install's local ledger and actual-device verification.

The powerups a player holds live in the game's save like any other local progress, so they are only as safe as the save (which the native app also backs up to its preferences). Test mode runs the same path: `BloomStore.dev.nextResult('crash')` simulates a charge whose answer never arrives, and `'pending'` a payment that clears by the next launch.

Prices approved by Trevor on October 15, 2026: $0.29 for one, $0.49 for five of a chosen kind, and $1.00 for twenty mixed (five of each). These are USD targets for both stores; verify each actual storefront offer and sandbox purchase before enabling it. Apple lists a $0.29 minimum and supports X.00 price points ([official pricing](https://developer.apple.com/in-app-purchase/)); the initial 10-cent single proposal was superseded by Trevor's explicit choice. Google Play Console must confirm its allowed prices when products are created. The twenty bag has a new SKU; never repurpose the retired bag12 SKU or reinterpret its saved receipts. The game always shows the actual store price string. Selling happens only on the shop shelf, never mid-run or after a loss. All thirteen current products remain available:false.

## Privacy and outstanding store checks

The player-facing unlock card and powerup shelf are built. The Settings test catalog is a development tool. No additional shop screen is a launch prerequisite.

RevenueCat handles receipt validation; no independent receipt-validation server is included. Seeds and progress are local, and neither should be advertised as a server-secured balance. Consumable recovery depends on the local ledger and save and must be tested on actual devices, including storage failures, capacity, pending payment and app termination.

For a RevenueCat-enabled release, follow its current [Google Play Data Safety guide](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety): purchase history is collected, retained rather than ephemeral, required, and used for app functionality and analytics (purchase reporting). Do not declare that the app collects no data simply because it has no login or ads. Advertising identifiers are not collected by this app; identifier declarations depend on the actual SDK configuration and any integrations. Also follow the [Apple App Privacy guide](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy). Make console answers match every version currently distributed and the hosted privacy policy.

Keep all products disabled until the corresponding sandbox test succeeds. Verify permanent purchase, cancellation, duplicate tap, restore on a second install/device, refund and offline access. For bundles, inspect all three entitlements. For consumables, verify repeated buys, exact pack contents, kill/relaunch during confirmation, pending-payment settlement and Restore without repeating old grants. Record store, version code/build number, device, product and results. A passing fake-plugin suite cannot certify any of these store steps. Subscriptions remain outside the launch plan.
