# Store listing draft

Status: updated October 15, 2026. Nothing here has been entered in a console. Trevor chose Individual/personal publishing under his legal name, **Free** downloads on both stores, and **Bloomshot** as the game name. Check field limits in the actual console. The production description below assumes its optional products passed sandbox checks and were enabled. For the first no-purchases build, use the separate copy in NO-PURCHASES-LISTING.md; do not promise unavailable purchases.

**Name check (October 10, 2026):** web searches of Google Play and the App Store found no app called "Bloomshot" or "Bloomshot: Flower Shooter". The nearest names are "Bloom Shooter!" on Google Play and a few "Bloom ..." puzzle games. A search cannot prove a name is free: App Store Connect refuses a name another developer already uses when the app record is created, so that is the real check (Google Play does not require unique names). If Apple refuses it, "Bloomshot: Bloom Shooter" and "Bloomshot - Flower Pop" are the fallbacks. The home-screen name stays "Bloomshot" either way.

## Names and short text

| Field | Text | Limit |
|---|---|---|
| App name (both stores) | Bloomshot | 30 characters (9 used) |
| Apple subtitle | Aim, bounce and bloom | 30 characters (21 used) |
| Google short description | Aim seeds, bank shots and meet ten guardians. No ads. Plays offline. | 80 characters (68 used) |
| Apple keywords | seed,shooter,bloom,puzzle,garden,blossom,bounce,offline,casual,arcade,physics,cozy,ricochet | 100 bytes (91 ASCII bytes used) |
| Apple promotional text | Aim seeds, master bank shots and grow your meadow. Four campaign levels are free, with more gardens and endless Meadow Rush. | 170 characters (124 used) |
| Category | Games, then Puzzle (Apple) / Puzzle (Google) | |

Apple searches the name, subtitle and keywords together. Keep prices out of those fields and the description: they differ by country and the stores show them beside each purchase.

Field lengths checked October 15, 2026 against Apple's [name/subtitle limits](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/), [promotional text and keyword limits](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/), and [Google's listing limits](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en). The no-purchases copy separately fits: name 9, subtitle 21, short description 70, promotional text 125 characters, keywords 91 ASCII bytes. These checks do not reserve the app name or populate either console.

## Full description (Apple and Google)

Aim a seed, bounce it off the walls and watch the flowers bloom. Ten illustrated levels take you from a sunny meadow down through roots, caves and a glowworm lake to the glowing Starseed Core.

Free to download. No ads. Gameplay works offline. No player account needed.

If you like bubble shooters, you'll feel at home: drag to aim, release, and bank your shot off the walls to reach the flowers that are hard to hit. Clear the field before the flowers drift past the line.

Ten levels, ten waves each
Authored layouts introduce new ways to aim, bounce and bloom. Each level ends with a distinct guardian whose warned moves change the falling flowers: swells, shrinking buds, spore veils, turning shells and more.
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
Levels 1 to 4 are free. Clear level 4 to sample the first three waves of level 5. One optional purchase unlocks levels 5 to 10 permanently.

Powerups
Sunburst blooms everything around the flower it hits. Dandelion splits your shot into three seeds. Bee Line flies through flowers, cups and shells. Lullaby stops the flowers falling for six seconds. Catch free gift bubbles on regular even waves. Optional purchases offer one powerup, five of a chosen kind, or twenty mixed. Their contents and localized price are shown before purchase; nothing is random.

Daily garden
A new layout every day, the same for everyone on that calendar date.

More to play
Meadow Rush: endless waves. How far can you go?
Garden puzzles: eighteen three-shot puzzles.
Moon Garden: six trials with gates that carry your seed across the board.
Koi Conservatory: eight pools with currents that bend your shots. The first two are free.
Keepsakes: three seed styles that change how your seed looks, never how it plays.

Your meadow
Every star you earn becomes seeds. Plant them in six flower patches and watch each one grow. It never makes the game easier. It is simply yours.

Fair play
Prices and contents are shown before you buy. There are no subscriptions or ads. Restore eligible permanent purchases in Settings; spent powerups and local progress are separate. Your game progress stays on your device. Purchases and restoration need a connection.

## Substitutions for the first testing build (purchases disabled)

Use the complete copy in [NO-PURCHASES-LISTING.md](NO-PURCHASES-LISTING.md), including its first-build review notes. Download price stays **Free**.

The native no-purchases build offers the four free campaign levels, the level-5 taste after clearing level 4, endless Rush, Garden and Moon, and the two free Koi pools. The six deeper levels, other Koi pools, paid Keepsakes and paid powers remain unavailable. Review shortcuts and fake ownership are never enabled in the submitted native app.

Do not enter the monetized description above for a binary that cannot sell those products. Neither RevenueCat configuration nor draft screenshots prove a purchase passed. Use the submitted build's actual inventory, access, offline and privacy behavior in the store forms.

## Purchase listings (create these in each store)

| Product | Id | Type | Price | Status |
|---|---|---|---|---|
| Koi Conservatory | `bloomshot.world.koi` | Non-consumable (Apple) / one-time in-app product (Google) | test value $4.99; final price is the owner's call | Create only after the Koi content is final |
| Keepsake Collection | `bloomshot.style.collection1` | Non-consumable (Apple) / one-time in-app product (Google) | test value $1.99; final price is the owner's call | Three seed styles (Sakura Breeze, Firefly Night, Gilded Leaf) that change how a seed looks, never how it plays. Create only after the content is final |
| Levels 5 to 10 | `bloomshot.levels.full` | Non-consumable (Apple) / one-time in-app product (Google) | $2.99 (set by the owner) | The campaign has ten levels of ten waves each. Levels 1 to 4 are free; this opens levels 5 to 10, forever. Create only after those levels are playable |
| Complete Garden | `bloomshot.bundle.complete1` | Non-consumable (Apple) / one-time in-app product (Google) | $6.99 (growth review suggestion; must stay below the three items together in every storefront, $9.97 in the US) | Levels 5 to 10, the Koi Conservatory and the Keepsake Collection in one purchase. In RevenueCat attach this one product to all three entitlements (levels_full, world_koi, style_collection1). Replaces the Launch Bundle, which was never created. Create only after all three are final |
| Sunburst | `bloomshot.power.sunburst` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.29 (owner-approved USD target) | One powerup: "Your next shot bursts on the first flower it hits and blooms the flowers around it." Create once the powerups are in the game |
| Lullaby | `bloomshot.power.lullaby` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.29 (owner-approved USD target) | One powerup: "Flowers stop falling for 6 seconds." Create once the powerups are in the game |
| Dandelion | `bloomshot.power.dandelion` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.29 (owner-approved USD target) | One powerup: "Your next shot spreads into three seeds." Create once the powerups are in the game |
| Bee Line | `bloomshot.power.beeline` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.29 (owner-approved USD target) | One powerup: "Your next shot flies straight through flowers, cups and shells." Create once the powerups are in the game |
| 5 Sunbursts | `bloomshot.pack.sunburst5` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.49 | Five Sunburst powerups in one purchase. Create with the singles |
| 5 Lullabies | `bloomshot.pack.lullaby5` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.49 | Five Lullaby powerups in one purchase |
| 5 Dandelions | `bloomshot.pack.dandelion5` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.49 | Five Dandelion powerups in one purchase |
| 5 Bee Lines | `bloomshot.pack.beeline5` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $0.49 | Five Bee Line powerups in one purchase |
| 20-powerup Bag | `bloomshot.pack.bag20` | Consumable (Apple) / one-time in-app product (Google); Consumable in RevenueCat, no entitlement | $1.00 | Five of each powerup, twenty in all, always the same contents |

Each product needs a display name, a description and a review screenshot of the unlock screen in Apple's console. Write the description as what the player gets: "Opens pools 3 to 8 of the Koi Conservatory, forever." or "Opens levels 5 to 10 of the campaign, forever." For a powerup, say it is one use: "One Sunburst powerup, used up when you play it." For a pack, list exactly what is inside: "Five Sunburst powerups." or "Five each of Sunburst, Dandelion, Bee Line and Lullaby, twenty powerups in all." The current mixed bag's owner-approved USD target is $1.00; the localized store price belongs on the purchase screen. For the Complete Garden: "Opens levels 5 to 10, all eight Koi pools and the three Keepsake seed styles, forever."

## Age rating and content questions

Rating is unassigned. Trevor must complete [Apple's current age-rating questionnaire](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/) and [Google Play's IARC questionnaire](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en) for the exact submitted binary, then record the assigned regional ratings before publication. Assess seed hits, guardian attacks, flames, briars and any frightening effects against each form's definitions; the flower theme alone does not establish a "no violence" answer. Reassess when content changes. Target-audience declarations are separate: Bloomshot is not aimed primarily at children and is not being submitted in Apple's Kids category. Purchase disclosures and data/privacy forms must likewise describe the submitted build.

The README states that code and art are AI-assisted (`bloomshot/ART-PROVENANCE.md` has details). Answer any AI or generated-content question in a console truthfully from that file, and have the owner read it once.

## Privacy and data forms

For the first build with empty RevenueCat keys, the purchase service is inactive. Before enabling it, update both stores' forms for the submitted binary. RevenueCat's [Google Play guide](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety) declares purchase history as collected, required, not ephemeral, for app functionality and analytics (purchase reporting). Its device/other ID declaration is tied to advertising-ID integrations, which Bloomshot does not enable. Follow its [Apple privacy guide](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy) and check the actual SDK/configuration rather than assuming no data is collected.

Bloomshot has no ads, gameplay analytics or advertising tracking. Google Play's Advertising ID answer is **No**; the Android build removes that permission and the release workflow checks it. A privacy policy is required in the app and in the listing: see `PRIVACY-POLICY.md`. The public contact is **hello@harborlineleadrecovery.com**.

## Graphics checklist

| Asset | Notes |
|---|---|
| App icon | Already generated from `bloomshot/icons/icon.svg`: 1024 px opaque for Apple, adaptive icon for Android. Google also wants a 512 x 512 store icon. |
| iPhone screenshots | Repository images under `docs/store/graphics/apple/iphone-1290/` are historical October 14 captures. Fresh local drafts of game commit `2bbfe89321338f49f3d5cdbb17e8cf34b3bdf472` are under the workspace's `outputs/bloomshot-launch-drafts/apple/`: ten 1290 × 2796 large-iPhone frames covering all levels, plus three 1206 × 2622 medium-class frames of levels 1, 4 and 10. All are opaque RGB browser captures. The medium class is currently required; owner approval and native-device verification remain outstanding. |
| iPad screenshots | The native project supports iPad. Three current local 2064 × 2752 opaque RGB browser drafts of levels 1, 4 and 10 are under `outputs/bloomshot-launch-drafts/apple/ipad-13/`, using the actual tablet viewport. This covers Apple's required 13-inch size class as a draft; it does not prove a native iPad layout or submission acceptance. |
| Google Play graphics | Repository images under `docs/store/graphics/google-play/` are historical October 14 captures. Fresh local drafts are under `outputs/bloomshot-launch-drafts/google-play/`: eight 1080 × 1920 opaque RGB phone images, current 1024 × 500 feature graphic and matching video-banner copy, plus the unchanged 512 × 512 icon. Six phone images are direct gameplay screenshots; two pair framed gameplay crops with only the real level names. Original full-screen crop sources are preserved separately. No prices or fabricated game objects are added. |
| Screenshot content | The 24 local drafts comprise 8 Play, 10 large iPhone, 3 medium iPhone and 3 iPad images. The first two sets each cover all ten levels. Exact source/image hashes, format checks and visual-review evidence are in their manifests and `STORE-MEDIA-RESULTS.json`/`VISUAL-REVIEW.json`. These all-level review drafts include paid scenes unavailable in the first no-purchases binary: use only accessible content for that launch listing, or recapture once the submitted build genuinely offers the depicted content. None is owner-approved or evidence of working purchases. Later source changes do not change the recorded capture commit. |
| Preview video | The new local draft under `outputs/bloomshot-launch-drafts/video/` is a 27.966625-second, 1080 × 1440 H.264/AAC recording of levels 1, 4, 7 and 10 from game commit `2bbfe893…`, with original synthesized music/effects. The existing October 14 clip under `outputs/bloomshot-store-final/` is historical. The new original manifest and independent decoded-frame review preserve exact fingerprints; no new-source relabeling or owner/device approval is implied. It is a general/Play promotional draft, not an Apple device-size app preview. Deeper-level footage is unsuitable for the first no-purchases listing; a Play listing also needs an authorized YouTube upload/link. |

Apple's [current screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), checked October 15, 2026, require at least one Dynamic Island medium screenshot for iPhone and one 13-inch screenshot when iPadOS is supported. The dimensions above are accepted formats, not approval to upload browser drafts as verified device output. Review the exact submitted build and the actual console slots before submission.

## Review notes to paste for the reviewer

First testing build: the app has no login and no purchases. Play opens the level map; levels 1 to 4 are free, and the deeper unlock card says it is not on sale. Powerups are earned from gift bubbles. Gameplay runs offline.

Once the sandbox-tested purchase build is submitted: open Play, scroll past level 4 to the "Levels 5 to 10" card, and choose the unlock. Only products enabled in that binary can be tested. The Complete Garden and paid Powerups appear when enabled. Restore purchases is in Settings once the native store is active. Gameplay runs offline; purchases and restoration need a connection.
