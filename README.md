# Monster Battle — Pactforge Studio

Public game: https://pactforge-studio.github.io/monster-rpg-ver8/

This repository builds a tested runtime snapshot for the new GitHub Pages host. Game development remains in the original source repository; `source-ref.txt` pins the exact source commit. To publish a subsequent game update, update that file through a pull request and wait for the validation workflow. Source history and development tools are not included in the deployed website.

GitHub Pages must use **GitHub Actions** as its publishing source. On the free plan this repository must be public. The repository history and workflow still identify the original GitHub account; this is a branded URL, not a guarantee of anonymity.

The old URL opens a browser-local save transfer screen. New players redirect automatically. Existing players may need one tap to open the new window because browsers block automatic popups. Both save slots, profile metadata, recovery copies and preferences are transferred through origin-checked `postMessage`; save contents are never placed in a URL or sent to a server. Existing saves on the new host are never automatically overwritten. The original game remains available with `?legacy=1` for recovery.

Validation: full source `npm run check`, plus transfer tests for both profiles, metadata, repeat visits, existing destination saves, invalid input and storage rollback. Actual Android popup behaviour requires checking on the player's browser.
