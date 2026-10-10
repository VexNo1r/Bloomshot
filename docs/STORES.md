# Purchases: how the store layer works

Added in the mobile-release pass, October 3 2026. Status: written and unit-tested; **not yet run against a real store**, because no developer or RevenueCat account exists yet.

## What exists

| File | Job |
|---|---|
| `bloomshot/store-config.js` | The catalog (product ids, entitlement ids, test prices) and the RevenueCat public keys. Edit this file to change what is sold. |
| `bloomshot/store.js` | `BloomStore`: init, `products()`, `owns(entitlement)`, `purchase(productId)`, `restore()`, `subscribe(fn)`, and for powerups `onConsumable(fn)`, `deliver(fn)` and `pendingGrants()`. |
| `bloomshot/store-ui.js` | A "Purchases" section in Settings with **Restore purchases**. It stays hidden unless a store is live. |
| `bloomshot/qa/test-store.cjs` | 44 checks with a fake store plugin, including the bundle, powerups and mixed packs (crash, pending payment, reinstall, the game's handler) and a consistency check of the shipped catalog. |

The Koi Conservatory is the first gated content: `app.js` opens pools 3 to 8 only when `BloomStore.owns('world_koi')` is true, and its unlock panel calls `BloomStore.purchase('bloomshot.world.koi')` only when the store is live and the product is `available`.

## Three modes, chosen at startup

- **native**: inside the Capacitor app. The store (through RevenueCat) is the only source of truth. Owned items are cached locally only so the first screen paints; the store's answer replaces the cache on every launch, so refunds take effect. If the app is offline, the last known answer is kept.
- **mock**: simulated purchases for development. Only on `localhost`, or on a hostname listed in `mockHosts`, and only with `?mockstore=1`. The public website can never enter this mode.
- **web**: the website sells nothing. `owns()` is always false, whatever is in storage.

## Rules the code enforces

1. A product with `available: false` cannot be purchased. Flip it to `true` only when the content it unlocks is playable.
2. If no RevenueCat key is set for the platform, the store stays off and sells nothing.
3. A second tap during a purchase is refused, so a player cannot be charged twice.
4. Cancel and failure never grant anything, and the player is told nothing was charged.
5. The 'Restore purchases' button is always present once a store is live (Apple requires it).
6. A bundle is never sold to someone who already owns part of it. `purchase()` answers `{ ok: false, reason: 'partly-owned', owned: [...] }` before the store is opened, so nobody pays full price for something they have.
7. A bundle must grant everything it lists. If the store reports success but an entitlement is missing (the product was not attached to all of them in RevenueCat), `purchase()` answers `{ ok: false, reason: 'not-granted', missing: [...] }` rather than pretending.
8. A paid powerup is handed to the game exactly once: not lost if the app closes mid-purchase, never repeated by a relaunch, a Restore or a reinstall. See "Powerups" below.

## Setting it up when the accounts exist

1. Create the app in App Store Connect and Google Play Console with the final app id (the placeholder `dev.bloomshot.game` is not claimed anywhere; the first upload to any track, even internal testing, claims it for good).
2. Create each unlock as a **non-consumable** (Apple) / **one-time in-app product** (Google), and each powerup as a **consumable** (Apple) / **one-time in-app product** (Google), with the ids in `store-config.js`.
3. In RevenueCat (free under its revenue threshold): add both apps and the products. Set every Google Play unlock's product type to **Non-consumable** and every powerup's to **Consumable**: RevenueCat treats a Google Play product it is not told about as consumable and uses it up after purchase, and a used-up unlock cannot be restored on a new phone. Attach powerups to **no** entitlement. Create one **entitlement per single item** (`world_koi`, `style_collection1`, `levels_full`) using the ids from the config, and copy each platform's **public SDK key** into `revenueCatKeys`. Public keys are designed to ship in the app; never put a secret key in the game. For the bundle, attach its **one** product to **both** entitlements; RevenueCat allows one product on several entitlements. The game never needs to know a bundle was bought: it only asks `owns('world_koi')` and `owns('style_collection1')`.
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
| `owned` | The player already has all of them. Owning both single items counts as owning the bundle. |
| `partial` | The player has some but not all. Do not offer the bundle then; offer the remaining single item instead. |
| `amount`, `currency` | The same price as `price`, as a number and an ISO code: the store's own (`StoreProduct.price` and `currencyCode`) once it has loaded, otherwise parsed from the USD `priceHint`, otherwise `null`. Compare prices only when every amount is finite and the currencies match, for example to say "You save $0.99". |

`purchase()` results always include `entitlements`. Restore (`restore()`) lists the entitlements it brought back in `restored` and their player-facing names in `names`, so the Settings message can say "Restored Koi Conservatory and Keepsake Collection" even when one bundle purchase brought both.

Test mode: the simulated store remembers what the test account bought, so **Restore purchases** works in test mode too. From a browser console on localhost with `?mockstore=1`, `BloomStore.dev.forgetLocal()` simulates a reinstall (the device loses its unlocks, the account keeps its purchases) and `BloomStore.dev.reset()` makes a brand new account.

Pricing rule: the bundle must cost less than its items together, in every storefront. The suggested $6.99 against $2.99 plus $4.99 plus $1.99 ($9.97) is checked by the tests; when final prices are chosen, compare the store price tiers for each currency, because tiers do not always line up.

## Powerups (consumables)

Four powerups are sold: Sunburst, Lullaby, Dandelion and Bee Line. Each comes singly (`bloomshot.power.sunburst`, `.lullaby`, `.dandelion`, `.beeline`) and in a pack of five (`bloomshot.pack.sunburst5`, `.lullaby5`, `.dandelion5`, `.beeline5`), and the Powerup Bag (`bloomshot.pack.bag12`) holds three of each. Contents are fixed and always shown; nothing is random. The game designs them and drops them for free now and then; the store only sells them. A powerup is bought again and again and is never owned. In `store-config.js` it has `consumable: true` and `kind: 'power'` instead of an entitlement, and either `power` (the game's key) with `count` (how many one purchase gives), or, for a mixed pack, `powers: { sunburst: 3, ... }`. `products()` reports `consumable`, `items` (always a list of `{ power, count }`), `power` (only when there is one kind, else `null`) and `count` (the total), with `owned` and `partial` always false. A pack whose items are not all positive whole counts of a named power is never sold.

The store does not change the player's save. A purchase becomes a **grant** `{ transaction, productId, power, count, items }` (`transaction` is the store's transaction id) that waits in a small ledger (`bloomshot.grants.v1` in local storage) until the game takes it:

- `onConsumable(fn)`: the game's one handler. It gets every waiting grant once the store is ready and every new one as it arrives, before `purchase()` answers. `fn` adds every one of `items` to the save under the grant's one transaction id, writes the save, and returns `true`; only then is the grant marked delivered, so a pack is never half delivered. Anything else (false, a throw) leaves it waiting, and it is offered again at the next launch or when `onConsumable` is called again. The game also keeps the last transaction ids it has applied in its save, so even a replayed grant cannot count twice.
- `purchase(id)` answers `{ ok: true, consumable: true, power, count, items, transaction, delivered }`, `{ ok: false, cancelled: true, reason: 'cancelled' }`, `{ ok: false, pending: true, reason: 'pending' }` (Google Play: a slow payment method; nothing charged yet), or another `reason`. `delivered` is false only if the handler did not take it. A second tap during a buy is refused as `busy`.
- `deliver(fn)` and `pendingGrants()` do the same by hand: take, or just list, the waiting grants.

How it stays exactly-once. RevenueCat finishes (Apple) or consumes (Google) a consumable as soon as it has verified it, before the game sees it, so the app cannot hold the transaction open; the ledger does that job instead. Before opening the store sheet the ledger records that this install started buying that product. The store's answer turns into a grant at once. If the app is killed before the answer arrives, or the payment was pending, the next launch (or Restore) finds the new transaction in RevenueCat's list of one-time purchases (`nonSubscriptionTransactions`) and claims it for that started purchase. Any transaction the ledger has not seen and did not start (bought before a reinstall, on another device, or brought back by Restore) is only noted, never granted, so old powerups are not paid out again. A started purchase that never shows up is dropped after 7 days. Neither store restores consumables, and nor does the game.

The powerups a player holds live in the game's save like any other local progress, so they are only as safe as the save (which the native app also backs up to its preferences). Test mode runs the same path: `BloomStore.dev.nextResult('crash')` simulates a charge whose answer never arrives, and `'pending'` a payment that clears by the next launch.

Prices: Trevor asked for $0.25 a powerup. Apple's lowest price point is $0.29, so the App Store price is $0.29. The growth review suggested $0.99 for a pack of five and $1.99 for the bag of twelve; the tests check that a pack always costs less than its powerups bought one at a time. Set $0.25 in Play Console if it accepts it for the United States; Play Console shows the allowed range when the product is created. The game always shows the store's own price string, so the two stores can differ. Selling is only ever on the shop's powerup shelf: never offered mid-run or after a loss.

## Not built yet (and why)

- **A shop screen.** The test-mode list in Settings is a developer tool. The real shop design belongs with the monetization plan and the finished paid content.
- **Server-side receipt validation.** RevenueCat validates receipts for us, and a powerup is only granted from a transaction RevenueCat reports. Never sell seeds or other local balances for money (the seed balance is local and unsecured); a paid powerup is granted only through `deliver`.
- **Subscriptions.** The plan does not need them. RevenueCat supports them when needed.
