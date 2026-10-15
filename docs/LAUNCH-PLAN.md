# Bloomshot: current handoff and launch gates

Updated October 14, 2026. Trevor owns the project, account decisions, pricing, public release and merges. The current work prioritizes game quality and a thorough bug audit before store enrollment. bloomshot/CLAUDE-HANDOFF.md remains the older technical map; this page supersedes its next-step list.

## Current work

The codex/launch-ready-assets change reconstructs all ten named bosses from the recovered written design, adds their telegraphed abilities, tunes the campaign with reproducible practice-player measurements, makes timely aimed hits feed the four-seed pod, and fills the viewport with painted scenes and restrained ambient life. It also refreshes the six deeper-level previews and ordinary projectile illustration, and addresses save, receipt and boss-collider bugs discovered during the audit. Artwork remains Canvas/CSS/SVG code; see bloomshot/ART-PROVENANCE.md.

Use the current pull request's validation record and bloomshot/WEB-RELEASE.json to distinguish checked source from a deployed build. The private playtest is [Bloomshot](https://bloomshot-meadow.trevor-owens1996.chatgpt.site). Web-only ?alllevels separates review progress from the regular save; adding &bosses starts each selected level directly at its boss. These switches do not unlock paid content in native apps.

The separate [PR #30](https://github.com/VexNo1r/Bloomshot/pull/30) prepares iOS archive/export and hardens Android signing workflows. Its cloud checks passed, including an Android release bundle signed with a throwaway key. It does not establish real iOS signing, store upload or physical-device testing. Trevor merges it independently; game pull requests target main rather than that branch.

## Next, in order

1. Finish the recorded automated and browser checks, then refresh the existing owner-private build without changing its audience.
2. Trevor playtests on his iPhone, especially aiming versus repeated tapping, the first two bosses, later armor/weakspot encounters, compact-screen controls, sound and background motion. Record the actual device/browser and any unfair, slow or confusing moments.
3. Resolve reported defects and repeat checks appropriate to those changes. Trevor approves the game before any public Pages site or production release.
4. Merge reviewed source changes. Recheck current store requirements when enrollment begins, then complete developer accounts, signing and testing through PLAY-LAUNCH.md and MOBILE-RELEASE.md.
5. Configure RevenueCat and enable products one at a time only after real sandbox buy/cancel/restore/refund checks on a phone. No configuration is considered proof of a completed purchase.
6. Retake release screenshots/video from the exact approved build and complete store declarations for that binary. Local web captures are labelled as such; an unlisted Play video upload still requires Trevor's explicit authorization.
7. After launch, plan store leaderboards for the first update. Commission a human illustrator only after the game earns, as Trevor requested.

## Confirmed decisions and limits

- Player-facing name: **Bloomshot**. Application identifier: dev.bloomshot.game.
- Privacy policy: **October 14, 2026**, **hello@harborlineleadrecovery.com**. The in-app offline policy and public build derive from the same source.
- Trevor currently has an **iPhone only**. No physical-device test or native sandbox purchase has been verified. Desktop Chromium emulation is not an iPhone test.
- No developer/RevenueCat account or real upload key is configured. Every product stays available:false, with empty public SDK keys. Prices remain exactly as approved in store-config.js.
- No ads, tracking, paid randomness, fake scarcity, mid-run sales or loss-screen sales. The game is not positioned in a kids category. Saves remain additive and must not reset.
- GitHub Pages and public store publication remain owner actions after playtest approval. A private hosted web build is useful for iPhone testing; it is not an App Store installation or a public marketing link.
- Automated players establish repeatability and executable routes, not human difficulty, retention, popularity or revenue. Those require player evidence after testing and release.

## Working rules

Branch from fresh main as codex/...; open every pull request against main, never stack them, never force-push main. Trevor merges. Before a game handoff, run every bloomshot/qa/test-*.cjs, then qa/check-moon-pointer.cjs; in native/, run npm ci, npm run sync, and npm run check. Commit only affected result files. Follow the Storybook rules, preserve art provenance, and describe exactly what was checked without claiming a phone, purchase or signing test that did not happen. Do not touch VexNo1r/harborline.
