# Premade

Proximity voice chat and game tools for League of Legends. Friends in the same game hear each other louder the closer their champions are, quieter as they move apart, and muffled behind walls and in brush. It opens on your League profile (Riot ID, rank, what you're doing in League right now and your recent games), and brings champ select help, your stats, clips and post-game reports from League's own data on your PC, and games for your group while you wait in queue.

It was called League Proximity Chat before version 1.8.0.

**Get it:** [Windows app](https://rayn16.github.io/Premade/Premade-Setup.exe) or [in your browser](https://rayn16.github.io/Premade/).

## How it works

- **Where everyone is:** each player's app reads their own minimap from the screen, finds their champion's icon and shares that spot with the room. It never reads the game's memory or touches game files.
- **Voice** goes straight between players (WebRTC). Each player's app turns distance into volume by itself.
- **Connecting:** a small Cloudflare Worker in `server/` introduces players to each other (it speaks the PeerJS server protocol). Voice never goes through it.
- **League data:** the Windows app reads the League Client's local API and the Live Client Data API on your own PC: champ select, rank and match history, objective timers and the post-game report. Only what League already shows you; never names Riot hides, enemy cooldowns or anything that hints where enemies are.
- **Riot data:** our server holds a Riot API key (as a Worker secret, never in this code) and passes a few read-only calls through for looking up a profile by Riot ID, under the key's rate limits. It also counts high-elo ranked games (champion, role, items, runes, skill order and result, no players) for popular builds and matchups.

## What's here

| Folder | What it is |
|---|---|
| `site/` | The web app (`index.html`), the phone remote, the shared profile page, the in-game overlay and the minimap tracker. Plain static files, hosted on Netlify. |
| `client/` | The Windows app (Electron). It loads the live site and adds screen capture, the overlay, League's local data, shortcuts that work in game and self-updates. |
| `server/` | The connection server: a Cloudflare Worker with one Durable Object per room, a daily count of rooms and players for Settings > Our server, and the Riot data object (profile lookups and the high-elo game count). |
| `*.test.js`, `*.e2e.js`, `fixtures/` | Tests. |

## Working on it

- **Site:** serve `site/` with any static server (`npx serve site`). Add `?peer=127.0.0.1:9000` to the address to use a local PeerJS server instead of ours.
- **Tests:** `npm install`, `npx playwright install chromium`, then `npm test`. The Windows app's test: `cd client && npm ci && xvfb-run -a npx electron --no-sandbox --use-fake-device-for-media-stream --proxy-server=127.0.0.1:9 client.test.js` (the dead proxy keeps it offline). The server's tests: `cd server && node stats.test.js && node riot.test.js` (they start `wrangler dev`; set `WRANGLER` to wrangler's path if it isn't on your PATH).
- **Windows app:** `cd client && npm ci && npm run build` makes `dist/Premade-Setup.exe`, its `.blockmap` and `latest.yml`. GitHub Actions builds the same files: Actions tab, "Build the Windows app". Installed apps update themselves from `latest.yml` on the site, so the three files go up together.
- **Server:** `cd server && npx wrangler@4 deploy` (the free Cloudflare plan is enough). For Riot data, add your key with `npx wrangler@4 secret put RIOT_KEY`.

## License

MIT, see [LICENSE](LICENSE). Code from others in `site/vendor/`: noise removal from web-noise-suppressor and RNNoise ([licenses](site/vendor/rnnoise/LICENSE.txt)) and QR Code Generator by Kazuhiko Arase (MIT). PeerJS (MIT) is loaded from jsDelivr.

Premade isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
