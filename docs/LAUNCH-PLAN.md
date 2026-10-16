# Bloomshot: current handoff and launch gates

Updated October 15, 2026. Trevor owns the project, account decisions, pricing, public release and merges. The current work prioritizes game quality and a thorough bug audit before store enrollment. bloomshot/CLAUDE-HANDOFF.md remains the older technical map; this page supersedes its next-step list.

## Current work

The codex/launch-ready-assets change reconstructs all ten named bosses from the recovered written design, adds their telegraphed abilities, tunes the campaign with reproducible practice-player measurements, makes timely aimed hits feed the four-seed pod, and fills the viewport with painted scenes and restrained ambient life. It also refreshes the six deeper-level previews and ordinary projectile illustration, and addresses save, receipt and boss-collider bugs discovered during the audit. Artwork remains Canvas/CSS/SVG code; see bloomshot/ART-PROVENANCE.md.

The October 15 follow-up addresses Trevor's desktop feedback: Sunny's volley now becomes a real five-second threat after its warning; Level 2's ordinary flowers fall about 10% slower; regular free gifts appear on waves 2, 4, 6 and 8 rather than a rare one-per-run roll. Every guardian also changes a small set of falling flowers in its own way. Level 3 introduces fewer cups at a gentler pace; all four powerup buttons sit above Split. Trevor approved USD targets of $0.29 for one, $0.49 for five and $1.00 for twenty; purchases remain disabled. The exact mechanics and current verification are recorded in docs/PLAYTEST-2026-10-15.md. The October 14 corpus and media retain their original source fingerprints; they do not prove the changed encounters or depict the newly added spell cues.

Use the current pull request's validation record and bloomshot/WEB-RELEASE.json to distinguish checked source from a deployed build. The private playtest address is shared with Trevor in the project chat. Web-only ?alllevels separates review progress from the regular save; adding &bosses starts each selected level directly at its boss. These switches do not unlock paid content in native apps.

The separate [PR #30](https://github.com/VexNo1r/Bloomshot/pull/30) prepares iOS archive/export and hardens Android signing workflows. Its cloud checks passed, including an Android release bundle signed with a throwaway key. It does not establish real iOS signing, store upload or physical-device testing. Trevor merges it independently; game pull requests target main rather than that branch.

## Next, in order

1. The October 15 automated/browser checks and owner-private refresh are complete; exact sources and deployment are recorded in bloomshot/qa/playtest-feedback-results.json and bloomshot/WEB-RELEASE.json. Complete the new release-preparation fixes and checked media drafts while account setup proceeds.
2. Trevor opens the private game directly in Safari on his iPhone, using the QR handoff in the project chat; the Codex chat is not needed on the phone. Check aiming versus repeated tapping, Sunny's volley, Level 2's ordinary waves, all ten flower-changing spells, compact-screen controls, sound and background motion. Record the actual device/browser and any unfair, slow or confusing moments. Trevor's reported October 15 difficulty feedback was desktop play, not an iPhone test.
3. Resolve reported defects and repeat checks appropriate to those changes. Trevor approves the game before any public Pages site or production release.
4. Follow OWNER-START-HERE.md for exact owner steps. Trevor chose Individual/personal enrollment under his legal name and free downloads on both platforms. Merge the updated, green native release PR #30 first; merge game PR #31 only after Trevor's playtest approval and passing current checks. Recheck the second PR after the first merge. Build signing/testing releases from main only after both are merged. Account setup can proceed in parallel through PLAY-LAUNCH.md and the iOS guide supplied by PR #30.
5. Configure RevenueCat and enable products one at a time only after real sandbox buy/cancel/restore/refund checks on a phone. No configuration is considered proof of a completed purchase.
6. Trevor explicitly requested refreshed screenshot/video preparation now. Prepare source-fingerprinted review drafts, including required iPhone and iPad classes, then review/retake as needed for the final approved build and complete declarations for that binary. Browser captures are labelled as such; an unlisted Play video upload still requires Trevor's explicit authorization.
7. After launch, plan store leaderboards for the first update. Commission a human illustrator only after the game earns, as Trevor requested.

## Confirmed decisions and limits

- Player-facing name: **Bloomshot**. Application identifier: dev.bloomshot.game.
- Publisher route confirmed October 15: Trevor's personal legal name, Individual on Apple and Personal on Google. Both app downloads are Free; existing optional-purchase prices and disabled-product safeguards remain.
- Privacy policy: **October 14, 2026**, **hello@harborlineleadrecovery.com**. The in-app offline policy and public build derive from the same source.
- Trevor currently has an **iPhone only**. No physical-device test or native sandbox purchase has been verified. Desktop Chromium emulation is not an iPhone test.
- No developer/RevenueCat account or real upload key is configured. Every product stays available:false, with empty public SDK keys. Prices remain exactly as approved in store-config.js.
- No ads, tracking, paid randomness, fake scarcity, mid-run sales or loss-screen sales. The game is not positioned in a kids category. Saves remain additive and must not reset.
- GitHub Pages and public store publication remain owner actions after playtest approval. A private hosted web build is useful for iPhone testing; it is not an App Store installation or a public marketing link.
- Automated players establish repeatability and executable routes, not human difficulty, retention, popularity or revenue. Those require player evidence after testing and release.

## Working rules

Branch from fresh main as codex/...; open every pull request against main, never stack them, never force-push main. Trevor merges. Before a game handoff, run every bloomshot/qa/test-*.cjs, then qa/check-moon-pointer.cjs; in native/, run npm ci, npm run sync, and npm run check. Commit only affected result files. Follow the Storybook rules, preserve art provenance, and describe exactly what was checked without claiming a phone, purchase or signing test that did not happen. Do not touch VexNo1r/harborline.
