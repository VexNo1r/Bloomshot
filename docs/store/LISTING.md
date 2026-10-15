# Store listing draft

Status: updated October 12, 2026 for the current campaign. Nothing here has been entered in a console. The name is **Bloomshot**, as Trevor confirmed. Check field limits against the console when pasting. The production description below assumes the named products passed sandbox checks and were enabled. For the first testing build, use the substitutions immediately below it; that build has no purchases.

**Name check (October 10, 2026):** web searches of Google Play and the App Store found no app called "Bloomshot" or "Bloomshot: Flower Shooter". The nearest names are "Bloom Shooter!" on Google Play and a few "Bloom ..." puzzle games. A search cannot prove a name is free: App Store Connect refuses a name another developer already uses when the app record is created, so that is the real check (Google Play does not require unique names). If Apple refuses it, "Bloomshot: Bloom Shooter" and "Bloomshot - Flower Pop" are the fallbacks. The home-screen name stays "Bloomshot" either way.

## Names and short text

| Field | Text | Limit |
|---|---|---|
| App name (both stores) | Bloomshot | 30 (9 used) |
| Apple subtitle | Aim, bounce, bloom. 10 levels. | 30 (30 used) |
| Google short description | A flower bubble shooter with 10 levels. No ads. No timers. Plays offline. | 80 (73 used) |
| Apple keywords | bubble,pop,puzzle,garden,blossom,relaxing,cozy,offline,casual,arcade,physics,zen,family,brain,blast | 100 (99 used) |
| Apple promotional text | Ten levels, from a sunny meadow down to the glowing Starseed Core. Levels 1 to 4 are free. No ads, no timers, and it plays offline. | 170 (131 used) |
| Category | Games, then Puzzle (Apple) / Puzzle (Google) | |

Apple searches the name, subtitle and keywords together. Keep prices out of those fields and the description: they differ by country and the stores show them beside each purchase.

## Full description (Apple and Google)

Aim a seed, bounce it off the walls and watch the flowers bloom. Ten illustrated levels take you from a sunny meadow down through roots, caves and a glowworm lake to the glowing Starseed Core.

No ads. No timers. Plays offline. No account needed.

If you like bubble shooters, you'll feel at home: drag to aim, release, and bank your shot off the walls to reach the flowers that are hard to hit. Clear the field before the flowers drift past the line.

Ten levels, ten waves each
Every wave is a new layout and a new little puzzle, not just a faster one.
1 Sunny Meadow: learn the ropes
2 Root Tunnels: bank around rocks
3 Mushroom Grotto: cups and puffcaps
4 Crystal Caves: everything at once
5 Glowworm Lake: ride the currents
6 Fossil Beds: turning shells
7 Ember Hollows: tunnels
8 Geode Mine: geodes and gems
9 Briar Vault: briars grow back
10 Starseed Core: the final test
Levels 1 to 4 are free. Levels 5 to 10 are one purchase that is yours forever.

Powerups
Sunburst blooms everything around the flower it hits. Dandelion splits your shot into three seeds. Bee Line flies straight through flowers, cups and shells. Lullaby stops the flowers falling for six seconds. Gift bubbles in the waves sometimes hold one for free, and you can buy them in small packs whose contents are always shown. Paid packs always have fixed contents.

Daily garden
A new layout every day, the same for everyone. Share your result with friends.

More to play
Meadow Rush: endless waves. How far can you go?
Garden puzzles: eighteen three-shot puzzles.
Moon Garden: six trials with gates that carry your seed across the board.
Koi Conservatory: eight pools with currents that bend your shots. The first two are free.
Keepsakes: three seed styles that change how your seed looks, never how it plays.

Your meadow
Every star you earn becomes seeds. Plant them in six flower patches and watch each one grow. It never makes the game easier. It is simply yours.

Fair play
Prices are shown before you buy, there are no subscriptions, and "Restore purchases" is always in Settings. Your progress stays on your device.

## Substitutions for the first testing build (purchases disabled)

Use short description: **Aim, bounce and bloom through four free levels. No ads. Plays offline.**

Replace the opening paragraph with: "Aim a seed, bounce it off the walls and watch the flowers bloom. Play four illustrated levels from Sunny Meadow to Crystal Caves. Six deeper levels are planned as an optional one-time unlock."

Replace "Levels 5 to 10 are one purchase that is yours forever" with "Levels 5 to 10 are not on sale yet." Replace the paid powerup-pack sentence with "Gift bubbles in the waves sometimes hold a free powerup. Purchases are not available in this testing build." Replace the Fair play paragraph with "No ads or subscriptions. Your progress stays on your device." Do not promise a working purchase or Restore button until that build actually includes it.

## Purchase listings (create these in each store)

| Product | Id | Type | Price | Status |
|---|---|---|---|---|
| Koi Conservatory | `bloomshot.world.koi` | Non-consumable (Apple) / one-time in-app product (Google) | test value $4.99; final price is the owner's call | Create only after the Koi content is final |
| Keepsake Collection | `bloomshot.style.collection1` | Non-consumable (Apple) / one-time in-app product (Google) | test value $1.99; final price is the owner's call | Three seed styles (Sakura Breeze, Firefly Night, Gilded Leaf) that change how a seed looks, never how it plays. Create only after the content is final |
| Levels 5 to 10 | `bloomshot.levels.full` | Non-consumable (Apple) / one-time in-app product (Google) | $2.99 (set by the owner) | The campaign has ten levels of ten waves each. Levels 1 to 4 are free; this opens levels 5 to 10, forever. Create only after those levels are playable |
| Complete Garden | `bloomshot.bundle.complete1` | Non-consumable (Apple) / one-time in-app product (Google) | $6.99 (growth review suggestion; must stay below the three items together in every storefront, $9.97 in the US) | Levels 5 to 10, the Koi Conservatory and the Keepsake Collection in one purchase. In RevenueCat attach this one product to all three entitlements (levels_full, world_koi, style_collection1). Replaces the Launch Bundle, which was never created. Create only after all three are final |
| Sunburst | `bloomshot.power.sunburst` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.25 on Google Play; $0.29 on the App Store (Apple's lowest price) | One powerup: "Your next shot bursts on the first flower it hits and blooms the flowers around it." Create once the powerups are in the game |
| Lullaby | `bloomshot.power.lullaby` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.25 on Google Play; $0.29 on the App Store | One powerup: "Flowers stop falling for 6 seconds." Create once the powerups are in the game |
| Dandelion | `bloomshot.power.dandelion` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.25 on Google Play; $0.29 on the App Store | One powerup: "Your next shot spreads into three seeds." Create once the powerups are in the game |
| Bee Line | `bloomshot.power.beeline` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.25 on Google Play; $0.29 on the App Store | One powerup: "Your next shot flies straight through flowers, cups and shells." Create once the powerups are in the game |
| 5 Sunbursts | `bloomshot.pack.sunburst5` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.99 | Five Sunburst powerups in one purchase. Create with the singles |
| 5 Lullabies | `bloomshot.pack.lullaby5` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.99 | Five Lullaby powerups in one purchase |
| 5 Dandelions | `bloomshot.pack.dandelion5` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.99 | Five Dandelion powerups in one purchase |
| 5 Bee Lines | `bloomshot.pack.beeline5` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.99 | Five Bee Line powerups in one purchase |
| Powerup Bag | `bloomshot.pack.bag12` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $1.99 | Three of each powerup, twelve in all, always the same contents |

Each product needs a display name, a description and a review screenshot of the unlock screen in Apple's console. Write the description as what the player gets: "Opens pools 3 to 8 of the Koi Conservatory, forever." or "Opens levels 5 to 10 of the campaign, forever." For a powerup, say it is one use: "One Sunburst powerup, used up when you play it." For a pack, list exactly what is inside: "Five Sunburst powerups." or "Three each of Sunburst, Dandelion, Bee Line and Lullaby, twelve powerups in all." For the Complete Garden: "Opens levels 5 to 10, all eight Koi pools and the three Keepsake seed styles, forever."

## Age rating and content questions

Expected from the questionnaires, which the stores decide: Apple 4+, Google (IARC) Everyone. The answers that matter are: no violence, no gambling or simulated gambling, no user-generated content, no chat, no web browsing, no ads, no data collected by the app itself. In-app purchases are disclosed separately and shown automatically.

The README states that code and art are AI-assisted (`bloomshot/ART-PROVENANCE.md` has details). Answer any AI or generated-content question in a console truthfully from that file, and have the owner read it once.

## Privacy and data forms

For the first build with empty RevenueCat keys, the purchase service is inactive. Before enabling it, update both stores' forms for the submitted binary. RevenueCat's [Google Play guide](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety) declares purchase history as collected, required, not ephemeral, for app functionality and analytics (purchase reporting). Its device/other ID declaration is tied to advertising-ID integrations, which Bloomshot does not enable. Follow its [Apple privacy guide](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy) and check the actual SDK/configuration rather than assuming no data is collected.

Bloomshot has no ads, gameplay analytics or advertising tracking. Google Play's Advertising ID answer is **No**; the Android build removes that permission and the release workflow checks it. A privacy policy is required in the app and in the listing: see `PRIVACY-POLICY.md`. The public contact is **hello@harborlineleadrecovery.com**.

## Graphics checklist

| Asset | Notes |
|---|---|
| App icon | Already generated from `bloomshot/icons/icon.svg`: 1024 px opaque for Apple, adaptive icon for Android. Google also wants a 512 x 512 store icon. |
| iPhone screenshots | Ten current 1290 × 2796 opaque RGB gameplay captures, one per campaign level, are in `docs/store/graphics/apple/iphone-1290/`. They were regenerated and validated October 14, 2026. These are browser captures; native-device testing and App Store Connect slot validation remain. |
| iPad screenshots | Required if the app supports iPad, which it currently does. No final iPad set is included; confirm the pixel size in App Store Connect and capture that device class before submission. Earlier drafts are preserved outside the repository. |
| Google Play graphics | In `docs/store/graphics/google-play/`: `icon-512.png` (512 × 512), `feature-graphic.png` (1024 × 500), and eight current 1080 × 1920 opaque RGB phone images, in filename order. `feature-graphic-for-video.png` is the same unlettered rendered scene. Six phone images are direct gameplay screenshots; two pair clearly framed gameplay crops with only the real level names. No prices or fabricated game objects are added. |
| Screenshot content | The final eight-image Play set and ten-image iPhone set both cover all ten levels. They show actual launched seeds, the new environments and boss encounters. `CAPTURE-MANIFEST.json` files record source and image hashes; `validate-store-media.cjs` checks current-source agreement, dimensions and coverage. Owner review and the public-release gates still apply. |
| Preview video | A current 27.9872-second H.264/AAC clip of real play in levels 1, 4, 7 and 10 is preserved with its source/decoding manifest in the workspace's `outputs/bloomshot-store-final/` folder. It uses original game music/effects and has no added captions. It is a general/Play promotional asset, 1080 × 1440; a Play listing still needs an authorized YouTube upload/link. Apple needs a separate device-size app preview if one is submitted. |

## Review notes to paste for the reviewer

First testing build: the app has no login and no purchases. Play opens the level map; levels 1 to 4 are free, and the deeper unlock card says it is not on sale. Powerups are earned from gift bubbles. Gameplay runs offline.

Once the sandbox-tested purchase build is submitted: open Play, scroll past level 4 to the "Levels 5 to 10" card, and choose the unlock. Only products enabled in that binary can be tested. The Complete Garden and paid Powerups appear when enabled. Restore purchases is in Settings once the native store is active. Gameplay runs offline; purchases and restoration need a connection.
