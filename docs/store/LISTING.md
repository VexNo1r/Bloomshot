# Store listing draft

Status: draft written October 3, 2026, for the day the Apple and Google developer accounts exist. Nothing here has been entered anywhere. Field limits are the ones I last knew; check each against the console when pasting. The game text matches what the game does once the Koi Conservatory pull request is merged (Meadow Rush, 18 Garden puzzles, six Moon trials, the persistent meadow, and the Koi Conservatory with its first two pools free). The Keepsake Collection is not described in the store text yet because it is not built. Update it if the game changes.

Not checked: whether the name "Bloomshot" is free in either store. Search both before creating the app records.

## Names and short text

| Field | Text | Limit |
|---|---|---|
| App name | Bloomshot | 30 characters (Apple), 30 (Google) |
| Apple subtitle | A botanical arcade garden | 30 (25 used) |
| Google short description | Aim, bounce and bloom. A calm botanical arcade game that grows your own meadow. | 80 (79 used) |
| Apple keywords | bubble,shooter,garden,flowers,puzzle,relaxing,arcade,physics,meadow,zen,offline,casual | 100 (86 used) |
| Apple promotional text | New: the Koi Conservatory, eight pools of drifting currents. The first two are free. | 170 |
| Category | Games, then Puzzle (Apple) / Puzzle (Google) | |

## Full description (Apple and Google)

Aim a single seed, bounce it through a field of flowers, and watch the meadow bloom.

Bloomshot is a calm, hand-illustrated arcade puzzle game you can play in short bursts.

MEADOW RUSH
Drag to aim and release. Flowers drift down the field after your first shot, and three breaches end the run. Gold relay flowers spark their neighbours, six direct hits charge a Split that adds two more seeds, and a turning leaf lets you redirect a shot at the right moment.

GARDEN PUZZLES
Eighteen three-shot puzzles. Plan the bounce, clear the board, earn stars.

MOON GARDEN
Six trials with paired gates that carry a seed across the board and turn its direction. You get five single seeds and no hints, so every shot counts.

KOI CONSERVATORY
Eight pools with slow currents that bend your shots. The first two pools are free. The full Conservatory is a one-time purchase, with no subscription and nothing to renew.

YOUR MEADOW
Every star you earn becomes seeds. Plant them in six permanent flower patches and watch each one grow through three stages. Growing the meadow never makes shooting easier. It is simply yours.

- Plays offline, with no account.
- No ads.
- No timers that push you to pay, and nothing random to buy. Prices are shown before you buy, and "Restore purchases" is always in Settings.
- Your progress is stored on your device only.

## Purchase listings (create these in each store)

| Product | Id | Type | Price | Status |
|---|---|---|---|---|
| Koi Conservatory | `bloomshot.world.koi` | Non-consumable (Apple) / one-time in-app product (Google) | test value $4.99; final price is the owner's call | Create only after the Koi content is final |
| Keepsake Collection | `bloomshot.style.collection1` | Non-consumable (Apple) / one-time in-app product (Google) | test value $1.99; final price is the owner's call | Three seed styles (Sakura Breeze, Firefly Night, Gilded Leaf) that change how a seed looks, never how it plays. Create only after the content is final |
| Levels 5 to 10 | `bloomshot.levels.full` | Non-consumable (Apple) / one-time in-app product (Google) | $2.99 (set by the owner) | The campaign has ten levels of ten waves each. Levels 1 to 4 are free; this opens levels 5 to 10, forever. Create only after those levels are playable |
| Launch Bundle | `bloomshot.bundle.launch1` | Non-consumable (Apple) / one-time in-app product (Google) | test value $5.99; must be cheaper than the two items together in every storefront | Koi Conservatory and Keepsake Collection in one purchase. In RevenueCat attach this one product to both entitlements. Create only after both items are final |

Each product needs a display name, a description and a review screenshot of the unlock screen in Apple's console. Write the description as what the player gets: "Opens pools 3 to 8 of the Koi Conservatory, forever." or "Opens levels 5 to 10 of the campaign, forever."

## Age rating and content questions

Expected from the questionnaires, which the stores decide: Apple 4+, Google (IARC) Everyone. The answers that matter are: no violence, no gambling or simulated gambling, no user-generated content, no chat, no web browsing, no ads, no data collected by the app itself. In-app purchases are disclosed separately and shown automatically.

The README states that code and art are AI-assisted (`bloomshot/ART-PROVENANCE.md` has details). Answer any AI or generated-content question in a console truthfully from that file, and have the owner read it once.

## Privacy and data forms

Both stores ask what data the app collects. The app itself collects none. Once purchases are live, the RevenueCat SDK sends an anonymous installation id, purchase receipts and basic device details. Declare that as purchase history and device or other identifiers, used for app functionality only, not for advertising or tracking. RevenueCat publishes guidance for filling these forms in; follow it and check the console's current wording. A privacy policy link is required by both stores: see `PRIVACY-POLICY.md`.

## Graphics checklist

| Asset | Notes |
|---|---|
| App icon | Already generated from `bloomshot/icons/icon.svg`: 1024 px opaque for Apple, adaptive icon for Android. Google also wants a 512 x 512 store icon. |
| iPhone screenshots | Apple asks for the largest iPhone size class. Confirm the exact pixel size in App Store Connect. |
| iPad screenshots | Required if the app supports iPad, which it currently does. Confirm the pixel size in App Store Connect. |
| Android screenshots | At least two phone screenshots; a 1024 x 500 feature graphic. |
| Screenshot content | Use the final art. Show Meadow Rush mid-shot, a Garden puzzle, a Moon gate, the meadow, the Koi pool and its honest unlock panel. Take them after the visual polish passes settle, not before. |

## Review notes to paste for the reviewer

The app has no login. To test the purchase: open the Koi Conservatory, tap a locked pool (3 to 8), and choose the unlock. "Restore purchases" is in Settings. The app runs entirely offline except for the store itself.
