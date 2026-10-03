# The web version (GitHub Pages)

The game is published as a website so testers can open it by link on any phone while the store accounts are not paid for yet. Android Chrome can install it from the menu; iPhone and iPad use Safari, Share, Add to Home Screen.

Address once live: `https://vexno1r.github.io/Bloomshot/` (GitHub lowercases the account name; confirm the exact link on the repo's Settings, Pages screen after the first deploy).

## One setting to switch on

Repo Settings, then Pages, then Source: **GitHub Actions**. Until that is set, `.github/workflows/pages.yml` still builds the site on every push as a check and finishes green with a notice saying how to turn Pages on, so `main` never goes red over it. After it is set, every push to `main` publishes, and so does Run workflow on `main`.

## What gets published

- Only the files listed in `bloomshot/sw.js` ASSETS, plus `sw.js` itself. QA files, screenshots, docs and `server.cjs` are not published. A new game file must be added to that list or it will not ship, on the web or in the native app.
- The service worker's cache version is replaced at build time by a hash of what is shipped (`.github/scripts/build-pages.cjs`), so a deploy that changes any file changes the cache name and returning players get the update. The hand-set `VERSION` in `sw.js` is not used for the website.
- The privacy policy page at `/privacy/` is built from `docs/store/PRIVACY-POLICY.md`, but only once its two bold `[bracketed]` blanks (date and contact email) are filled in. Until then the page does not exist, so a half-finished policy never goes live.

## What the web version does not do

It sells nothing. `store.js` only goes live inside the native app (or on localhost in the developer test mode), so the website shows no Purchases section and `owns()` is always false there. Paid content stays locked on the web.

## Checked

Served under a `/Bloomshot/` subpath in Chromium: the service worker registers with that scope, the manifest's `start_url`, `scope` and icons resolve under the subpath, the precache fills, and the game reloads offline. Not checked on a real phone, and not checked against GitHub Pages itself until the first deploy.

## If the repo goes private

GitHub Pages on a private repository needs a paid GitHub plan. If the repo is made private later, move the web copy to another free static host; `build-pages.cjs` already produces the whole site in `_site/`.
