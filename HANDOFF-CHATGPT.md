# Premade: handoff for a new assistant

Written 2026-10-22 13:30 UTC. Everything here is standalone; you don't need any other project access. The owner is **Rayan** (GitHub `Rayn16`), on Windows, Riot ID `Rayan1000RR#KING` (EUW).

## 1. What Premade is

Proximity voice chat for League of Legends, grown into a full companion app. Friends in the same game hear each other louder the closer their champions are (full volume up to ~900 units, silent at the hearing range, default 1,200, slider 600 to 3,000), muffled behind walls, river and brush. Around that sit Porofessor/DPM.LOL-style tools: profile and rank, champ select help, builds/runes/matchups, in-game overlay, timers, post-game reports, TFT and ARAM Mayhem helpers, clips and match videos with an in-app editor, friends, room chat and screen share.

- **Position comes only from the minimap on screen.** Each player's app reads its own minimap from a screen capture, finds their champion icon (falls back to the white camera box) and shares that spot with the room 5 times a second. Code: `site/camera-box.js`.
- **Voice is peer to peer** (WebRTC via PeerJS 1.5.4). Each client computes its own volumes. Our server only introduces peers.
- **League data** comes from the League Client's local API (LCU) and the Live Client Data API on the user's own PC, plus a Riot API key held by our server.

## 2. Repo and layout

https://github.com/Rayn16/Premade (public, MIT).

| Path | What |
|---|---|
| `site/index.html` | The whole web app (one big file): voice rooms, profile, stats, clips, settings, What's new (`NEWS`), and the `FEATURES` array. |
| `site/overlay.html`, `remote.html`, `profile.html`, `tracker.html`, `who.html` | In-game overlay, phone remote, shared profile, minimap test page, "who has Premade" page. |
| `site/camera-box.js`, `site/terrain.js` | Minimap detector; wall/river/brush grid. |
| `client/` | Electron 37 Windows app. Loads the live site and adds screen capture, overlay, League local data, global shortcuts, recording, self-update. |
| `server/` | Cloudflare Worker (`worker.js`, `wrangler.toml`): PeerJS-protocol signalling (one Durable Object per room) plus the Riot data object. |
| `*.test.js`, `*.e2e.js`, `fixtures/` | Tests (Playwright headless Chromium). |

**Branches:** `claude/voice-clips-6a9va7` is the live branch; every push to it publishes. `main` is reached only through PRs, and only when Rayan says "merge it" for those specific PRs. PR #7 (server) stays open until Rayan says merge.

## 3. Current state (2026-10-22)

- Live site: https://rayn16.github.io/Premade/ (installer: `/Premade-Setup.exe`, unsigned, Windows warns: More info > Run anyway).
- `.github/live` = `db098693c3b342513d2f6acb61e17b968031e133` (What's new 63). Branch head `e4c306d`.
- App version **1.21.0** (`client/package.json`).
- **Next free What's new number: 64.**
- Recent: 62 in-app clip editor + K/D/A on clip cards + full screen fix (app 1.21.0); 63 screen share sound + auto share on joining a room (page only; echo cancellation of Premade's own voices in the loopback is **not verified on Windows**).

## 4. How publishing works

`.github/workflows/pages.yml` runs on every push to `claude/voice-clips-6a9va7`:
- **Root (everyone)** = `site/` of the commit named in `.github/live`, plus the Windows app CI builds from that commit's `client/` (`Premade-Setup.exe`, `.blockmap`, `latest.yml`).
- **`test/`** = `site/` of the branch head. Users opt in via Settings > App > "Use the test version". No installer is built for test/, so app (client/) changes get their first real run only once live.

Steps for a change:
1. Commit on the branch, run `npm test` (12 suites; `npm install` first) and, for client changes, the client test under xvfb (see README). Push. That updates test/ only.
2. Ask Rayan before anything reaches everyone.
3. On Rayan's go: put the new full SHA in `.github/live`, commit "Live: What's new N (...)", push. Wait for Pages, then check the served `latest.yml` and the installer's sha512 match.

Rules for each change:
- Add a `NEWS` entry (next number) in `site/index.html`; update the newest-title regex in `league.e2e.js`. When merging, keep NEWS in number order and keep every side's `optDone` handlers.
- Any change to `client/main.js` or `client/preload.js` needs a version bump in `client/package.json`. Installed apps self-update from `latest.yml` on the site.
- The page must keep working with older installed apps (check `client.version` before using new IPC).
- Known flaky test: `league.e2e.js` clips-by-voice (Vosk wait under load).

Old host: Netlify (`league-proxchat.netlify.app`). Apps installed before the move still update from there. Planned: one last Netlify deploy around 2026-11-13 (when its free credits reset) with the then-live site and installer files, no redirect, so old apps move over.

## 5. Coding rules (from CLAUDE.md)

- Think first, state assumptions, ask when unclear. Minimum code that solves the ask, no speculative features or abstractions. Surgical diffs: touch only what the ask needs, match existing style.
- Width breakpoints in `site/index.html` use `@container app (max-width: …)`, never `@media`, and any `vh`/`vw` is divided by `var(--zoom, 1)` (Settings > Look size slider goes 70% to 200%).
- Every new or changed feature gets its line in the `FEATURES` array in `site/index.html`; `league.e2e.js` checks each "Show me" selector.
- `client/main.js` or `client/preload.js` changes need an app version bump.

## 6. The server

- https://league-proxchat.league-proxchat-server.workers.dev, Worker `league-proxchat` on Rayan's free Cloudflare account.
- **Only Rayan deploys it**, from their PC: `Documents\league-proxchat-server`, `npx wrangler@4 deploy`. Give him the changed files and ask them to deploy; never deploy it yourself. Keep a backup of the old `worker.js` (they keep `worker.oldN.js`).
- Free plan limit: 100k Durable Object rows written per day; past that, everything (voice rooms too) stops until 00:00 UTC. Watch row writes in any server change. Augment POSTs are capped 200/h per address and 400 new games/day.
- It counts a year of high-elo Riot matches in small saved steps (builds, runes, skill orders, matchups, ranks, draft pairs, ladder places, squads, esports; pro players from Leaguepedia's export). `/riot/mayhem` is unused and can be dropped.
- Server tests: `cd server && node stats.test.js && node riot.test.js` (they start `wrangler dev`).

## 7. Hard rules (never break these)

- **No memory reading, no game file changes, nothing Vanguard could flag.** Position comes from the on-screen minimap only. League data only from Riot's official local APIs and the Riot API.
- Never show what Riot hides (enemy cooldowns, hidden names in ranked champ select, anything hinting where enemies are).
- **No secrets in files, commits or chat.** `RIOT_KEY` is a Worker secret (`npx wrangler@4 secret put RIOT_KEY`); `OWNER_KEY` is Rayan's password for owner pages. Never ask for them or write them anywhere.
- Never: reverse-engineer other apps' files; account switching or saving the Riot Client sign-in; reading other players' match histories through League's client to collect their games ("follow other players" for Mayhem, declined repeatedly); copying U.GG/OP.GG-type data (their terms).
- No paid services, credits, trials or sign-ups.
- Riot's policy calls are Rayan's: don't drop features over them yourself; they decide.
- Ask Rayan before anything goes live or public.

## 8. Open items waiting on Rayan

- Code signing (SignPath, free for open source).
- Discord Application ID (app named "Premade") for Discord status.
- Riot production API key and the TFT key (TFT top-player numbers and pick rates need it). Terms and Privacy pages are live for the application.
- A screenshot of their real loading screen (overlay ranks), and one with the minimap on the left side.
- A real try of: Borderless window switch, Alt+V key reading, recording, Change folder, Start with League, 1440p/120 fps recording, H.264 hardware encode, screen share sound without echo (63).
- The custom-game test with friends (proximity voice end to end) is still not done.
- A fresh ARAM Mayhem tier sheet each patch (builds `site/mayhem-champ.json`; data from arammayhem.com, CC BY 4.0, credited on the Overlay page).
- PR #7 (server) merge to main when they say so.
- Last Netlify deploy ~2026-11-13 (see section 4).

## 9. Working with Rayan

They drop short requests and check back later. Lead with the answer, keep replies short and plain. Each finished feature: a NEWS entry, a FEATURES line, tests passing, pushed to test/, then ask for the go to make it live.
