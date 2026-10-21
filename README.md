# Bloomshot playtest builds

Generated files for playtesting only. Nothing here is merged anywhere, and no pull request uses this branch.

Each commit holds one `index.html`: the game from PR #31 with its styles, scripts, fonts and icons inlined into a single file, so a free file host serves one request instead of about seventy (githack answers bursts with 429 errors, which left the game unstyled or broken). Offline play is switched off in these builds; everything else is unchanged.

Current build: game commit d348a3d6aee2fbd12bb7d1bde36a6be2a4612d97 (branch codex/launch-ready-assets).
