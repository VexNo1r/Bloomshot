# Store listing draft

Status: rewritten October 10, 2026 around the 10-level campaign, following the growth review Trevor approved. Nothing here has been entered in a console yet. Field limits are the ones I last knew; check each against the console when pasting. The text describes the game once the share button and Wordle-style daily result are in (the game-visuals thread is building them); until then, leave out the sentence "Share your result with friends."

**Name check (October 10, 2026):** web searches of Google Play and the App Store found no app called "Bloomshot" or "Bloomshot: Flower Shooter". The nearest names are "Bloom Shooter!" on Google Play and a few "Bloom ..." puzzle games. A search cannot prove a name is free: App Store Connect refuses a name another developer already uses when the app record is created, so that is the real check (Google Play does not require unique names). If Apple refuses it, "Bloomshot: Bloom Shooter" and "Bloomshot - Flower Pop" are the fallbacks. The home-screen name stays "Bloomshot" either way.

## Names and short text

| Field | Text | Limit |
|---|---|---|
| App name (both stores) | Bloomshot: Flower Shooter | 30 (25 used) |
| Apple subtitle | Aim, bounce, bloom. 10 levels. | 30 (30 used) |
| Google short description | A flower bubble shooter with 10 levels. No ads. No timers. Plays offline. | 80 (73 used) |
| Apple keywords | bubble,pop,puzzle,garden,blossom,relaxing,cozy,offline,casual,arcade,physics,zen,family,brain,blast | 100 (99 used) |
| Apple promotional text | Ten levels, from a sunny meadow down to the glowing Starseed Core. Levels 1 to 4 are free. No ads, no timers, and it plays offline. | 170 (131 used) |
| Category | Games, then Puzzle (Apple) / Puzzle (Google) | |

Apple already searches the words in the name and subtitle, so the keywords leave out "flower", "shooter", "aim", "bounce", "bloom" and "levels" and do not repeat each other. "bubble" in the keywords plus "Shooter" in the name is what matches a search for "bubble shooter". Keep prices out of the name, subtitle, keywords and description: they differ by country and the stores show them anyway.

## Full description (Apple and Google)

Aim a seed, bounce it off the walls and watch the flowers bloom. Ten illustrated levels take you from a sunny meadow down through roots, caves and a glowworm lake to the glowing Starseed Core.

No ads. No timers. Plays offline. No account needed.

If you like bubble shooters, you'll feel at home: drag to aim, release, and bank your shot off the walls to reach the flowers that are hard to hit. Clear the field before the flowers drift past the line.

10 LEVELS, 10 WAVES EACH
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

POWERUPS
Sunburst blooms everything around the flower it hits. Dandelion splits your shot into three seeds. Bee Line flies straight through flowers, cups and shells. Lullaby stops the flowers falling for six seconds. Gift bubbles in the waves sometimes hold one for free, and you can buy them in small packs whose contents are always shown. Nothing is random.

DAILY GARDEN
A new layout every day, the same for everyone. Share your result with friends.

MORE TO PLAY
Meadow Rush: endless waves. How far can you go?
Garden puzzles: eighteen three-shot puzzles.
Moon Garden: six trials with gates that carry your seed across the board.
Koi Conservatory: eight pools with currents that bend your shots. The first two are free.
Keepsakes: three seed styles that change how your seed looks, never how it plays.

YOUR MEADOW
Every star you earn becomes seeds. Plant them in six flower patches and watch each one grow. It never makes the game easier. It is simply yours.

FAIR PLAY
Prices are shown before you buy, there are no subscriptions, and "Restore purchases" is always in Settings. Your progress stays on your device.

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

Both stores ask what data the app collects. The app itself collects none. Once purchases are live, the RevenueCat SDK sends an anonymous installation id, purchase receipts and basic device details. Declare that as purchase history and device or other identifiers, used for app functionality only, not for advertising or tracking. Google Play also asks separately whether the app uses the advertising ID: answer **No**. The Android build removes that permission (a purchases library would otherwise add it), and the release workflow fails if it ever comes back. RevenueCat publishes guidance for filling these forms in; follow it and check the console's current wording. A privacy policy link is required by both stores: see `PRIVACY-POLICY.md`.

## Graphics checklist

| Asset | Notes |
|---|---|
| App icon | Already generated from `bloomshot/icons/icon.svg`: 1024 px opaque for Apple, adaptive icon for Android. Google also wants a 512 x 512 store icon. |
| iPhone screenshots | Apple asks for the largest iPhone size class. Confirm the exact pixel size in App Store Connect. |
| iPad screenshots | Required if the app supports iPad, which it currently does. Confirm the pixel size in App Store Connect. |
| Google Play graphics | Ready in `docs/store/graphics/google-play/`: `icon-512.png` (512 x 512 store icon), `feature-graphic.png` (1024 x 500), and four 1080 x 1920 phone screenshots (`phone-1-rush.png` to `phone-4-moon.png`). `feature-graphic-for-video.png` is the same banner with the logo raised, for use only if a promo video is added later. All are drawn from the game's own art code or captured from real play, with no text or prices added. |
| Screenshot content | Lead with the levels: the level map going underground, then three or four level scenes mid-shot (Sunny Meadow, Glowworm Lake, Crystal Caves, Starseed Core), a powerup in action, and the unlock card with its honest wording. The first screenshot carries the most weight. The game-visuals thread retakes all of them after the background redo; the current ones show the game before the campaign and are only for the testing tracks. |
| Preview video | 15 to 30 seconds of real level play, built by the game-visuals thread from level clips after the background redo. Google takes a YouTube link; Apple takes an app preview file per device size. Optional, but it raises installs from the listing page. |

## Review notes to paste for the reviewer

The app has no login. To test the main purchase: open Play, scroll the level map past level 4 to the "Levels 5 to 10" card, and choose the unlock. The Complete Garden is offered on the same card. Powerups are on the Powerups shelf under the level map. "Restore purchases" is in Settings. The app runs entirely offline except for the store itself.
