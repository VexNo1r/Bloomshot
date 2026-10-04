# Purchases: how the store layer works

Added in the mobile-release pass, October 3 2026. Status: written and unit-tested; **not yet run against a real store**, because no developer or RevenueCat account exists yet.

## What exists

| File | Job |
|---|---|
| `bloomshot/store-config.js` | The catalog (product ids, entitlement ids, test prices) and the RevenueCat public keys. Edit this file to change what is sold. |
| `bloomshot/store.js` | `BloomStore`: init, `products()`, `owns(entitlement)`, `purchase(productId)`, `restore()`, `subscribe(fn)`. |
| `bloomshot/store-ui.js` | A "Purchases" section in Settings with **Restore purchases**. It stays hidden unless a store is live. |
| `bloomshot/qa/test-store.cjs` | 24 checks with a fake store plugin, including the bundle and a consistency check of the shipped catalog. |

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

## Setting it up when the accounts exist

1. Create the app in App Store Connect and Google Play Console with the final app id (the placeholder `dev.bloomshot.game` is not claimed anywhere; the id cannot change after publishing).
2. Create each product as a **non-consumable** (Apple) / **one-time in-app product** (Google) with the ids in `store-config.js`.
3. In RevenueCat (free under its revenue threshold): add both apps, add the products, create one **entitlement per single item** (`world_koi`, `style_collection1`) using the ids from the config, and copy each platform's **public SDK key** into `revenueCatKeys`. Public keys are designed to ship in the app; never put a secret key in the game. For the bundle, attach its **one** product to **both** entitlements; RevenueCat allows one product on several entitlements. The game never needs to know a bundle was bought: it only asks `owns('world_koi')` and `owns('style_collection1')`.
4. The purchase plugin is already installed: `@revenuecat/purchases-capacitor` 13.7.0 is pinned in `native/package.json` and is part of the Android and iOS projects (it compiled in both cloud builds). It does nothing until a public SDK key is set in step 3, because the store stays off without one. The game finds the plugin as `Capacitor.Plugins.Purchases`, which the native WebView injects, so no bundler is needed (`Capacitor.registerPlugin` only exists when `@capacitor/core` is bundled into the page, so it is only a fallback).
5. `native/scripts/prepare-web.cjs` already tolerates the store script tags: the runtime copy is built from the `sw.js` ASSETS list, which includes `store-config.js`, `store.js` and `store-ui.js`.
6. Test with a sandbox Apple account and Google license testers. Check: buy, cancel, buy again (should say already owned), restore on a second device, refund.
7. Only then flip `available` to `true` for finished content.

## Bundles

A bundle is one store product (`bloomshot.bundle.launch1`, the Launch Bundle) that grants several entitlements. In `store-config.js` it lists them in an `entitlements` array instead of the single `entitlement` string; everything else about a product is the same, and it stays `available: false` like the other two until a sandbox buy and restore work.

Each item in `BloomStore.products()` carries:

| Field | Meaning |
|---|---|
| `entitlements` | Every entitlement the product grants (one element for a single item). `entitlement` is the first, kept for older code. |
| `owned` | The player already has all of them. Owning both single items counts as owning the bundle. |
| `partial` | The player has some but not all. Do not offer the bundle then; offer the remaining single item instead. |
| `amount`, `currency` | The same price as `price`, as a number and an ISO code: the store's own (`StoreProduct.price` and `currencyCode`) once it has loaded, otherwise parsed from the USD `priceHint`, otherwise `null`. Compare prices only when every amount is finite and the currencies match, for example to say "You save $0.99". |

`purchase()` results always include `entitlements`. Restore (`restore()`) lists the entitlements it brought back in `restored` and their player-facing names in `names`, so the Settings message can say "Restored Koi Conservatory and Keepsake Collection" even when one bundle purchase brought both.

Test mode: the simulated store remembers what the test account bought, so **Restore purchases** works in test mode too. From a browser console on localhost with `?mockstore=1`, `BloomStore.dev.forgetLocal()` simulates a reinstall (the device loses its unlocks, the account keeps its purchases) and `BloomStore.dev.reset()` makes a brand new account.

Pricing rule: the bundle must cost less than its items together, in every storefront. The test price of $5.99 against $4.99 plus $1.99 is checked by the tests; when final prices are chosen, compare the store price tiers for each currency, because tiers do not always line up.

## Not built yet (and why)

- **A shop screen.** The test-mode list in Settings is a developer tool. The real shop design belongs with the monetization plan and the finished paid content.
- **Server-side receipt validation.** RevenueCat validates receipts for us. Do not add real-money value to local balances (the seed balance is local and unsecured).
- **Consumables and subscriptions.** The plan only needs one-time purchases right now. RevenueCat supports both when needed.
