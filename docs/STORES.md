# Purchases: how the store layer works

Added in the mobile-release pass, October 3 2026. Status: written and unit-tested; **not yet run against a real store**, because no developer or RevenueCat account exists yet.

## What exists

| File | Job |
|---|---|
| `bloomshot/store-config.js` | The catalog (product ids, entitlement ids, test prices) and the RevenueCat public keys. Edit this file to change what is sold. |
| `bloomshot/store.js` | `BloomStore`: init, `products()`, `owns(entitlement)`, `purchase(productId)`, `restore()`, `subscribe(fn)`. |
| `bloomshot/store-ui.js` | A "Purchases" section in Settings with **Restore purchases**. It stays hidden unless a store is live. |
| `bloomshot/qa/test-store.cjs` | 14 checks with a fake store plugin. |

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

## Setting it up when the accounts exist

1. Create the app in App Store Connect and Google Play Console with the final app id (the placeholder `dev.bloomshot.game` is not claimed anywhere; the id cannot change after publishing).
2. Create each product as a **non-consumable** (Apple) / **one-time in-app product** (Google) with the ids in `store-config.js`.
3. In RevenueCat (free under its revenue threshold): add both apps, add the products, create one **entitlement per product** using the `entitlement` ids from the config, and copy each platform's **public SDK key** into `revenueCatKeys`. Public keys are designed to ship in the app; never put a secret key in the game.
4. In `native/`: `npm i @revenuecat/purchases-capacitor` (peer: Capacitor 8, matches the pinned 8.5.2), then `npm run sync`. The game talks to the plugin through `Capacitor.registerPlugin('Purchases')`, so no bundler is needed.
5. Add `store-config.js`, `store.js` and `store-ui.js` to the native copy script's allowlist. It is derived from `sw.js` ASSETS, which already lists them, but the native `prepare-web` script also edits `index.html`; confirm it tolerates the three new script tags.
6. Test with a sandbox Apple account and Google license testers. Check: buy, cancel, buy again (should say already owned), restore on a second device, refund.
7. Only then flip `available` to `true` for finished content.

## Not built yet (and why)

- **A shop screen.** The test-mode list in Settings is a developer tool. The real shop design belongs with the monetization plan and the finished paid content.
- **Server-side receipt validation.** RevenueCat validates receipts for us. Do not add real-money value to local balances (the seed balance is local and unsecured).
- **Consumables and subscriptions.** The plan only needs one-time purchases right now. RevenueCat supports both when needed.
