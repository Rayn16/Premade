# Graph Report - premade  (2026-10-25)

## Corpus Check
- 38 files · ~275,738 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .gz 3, .nsh 1)

## Summary
- 782 nodes · 1171 edges · 44 communities (35 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c8160bbe`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Riot
- league.e2e.js
- ingame.e2e.js
- tft.e2e.js
- client/package.json
- group.e2e.js
- steps
- camera-box.test.js
- profile.e2e.js
- client.test.js
- ranks.e2e.js
- customs.e2e.js
- coach.e2e.js
- main.js
- riot.test.js
- camera-box.js
- voice.e2e.js
- Room
- steps
- push.js
- squad.test.js
- ref_fs
- practice.e2e.js
- lock.test.js
- pollLeague
- ref_assert
- manifest.json
- clipDir
- fakeLcu
- ref_http
- CLAUDE.md
- stats.test.js
- recordTick
- Premade
- rpcConnect
- context
- histOf
- electron

## God Nodes (most connected - your core abstractions)
1. `Riot` - 37 edges
2. `playwright` - 12 edges
3. `peer` - 10 edges
4. `Stats` - 9 edges
5. `Room` - 9 edges
6. `steps` - 8 edges
7. `build` - 8 edges
8. `day()` - 8 edges
9. `lockedThenFree()` - 7 edges
10. `fakeLcu()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `player()` --indirect_call--> `mm()`  [INFERRED]
  camera-box.test.js → terrain.test.js

## Import Cycles
- None detected.

## Communities (44 total, 9 thin omitted)

### Community 0 - "Riot"
Cohesion: 0.07
Nodes (23): CORS, day(), fetch(), FREE, gameOf(), helloOf(), LADDER(), LOOKUPS (+15 more)

### Community 1 - "league.e2e.js"
Cohesion: 0.04
Nodes (38): AHRI, BASES, CHAMPS, CLASH_SUMS, COMET, DDATA, ELEC, FIGHTS (+30 more)

### Community 2 - "ingame.e2e.js"
Cohesion: 0.07
Nodes (32): AHRI, BURST, champFull(), CHAMPS, context(), DDATA, EVEN, fakeApp() (+24 more)

### Community 3 - "tft.e2e.js"
Cohesion: 0.06
Nodes (26): allowed(), aug(), cd(), CD_AUGS, CD_ITEMS, CDRAGON, CHERRY, context() (+18 more)

### Community 4 - "client/package.json"
Cohesion: 0.06
Nodes (35): checkUpdates(), fromSite(), author, build, afterPack, appId, files, npmRebuild (+27 more)

### Community 5 - "group.e2e.js"
Cohesion: 0.07
Nodes (26): allowed(), answered, chat, context(), cors, DDATA, discord, EV (+18 more)

### Community 6 - "steps"
Cohesion: 0.06
Nodes (34): runs-on, steps, concurrency, cancel-in-progress, group, environment, needs, runs-on (+26 more)

### Community 7 - "camera-box.test.js"
Cohesion: 0.09
Nodes (29): along(), art, arts, bare, big, bil(), corner, ctx (+21 more)

### Community 8 - "profile.e2e.js"
Cohesion: 0.08
Nodes (26): ACCOUNTS, allowed(), CHAMPS, daysFrom(), DDATA, detail(), DUO_GAMES, DUO_STATS (+18 more)

### Community 9 - "client.test.js"
Cohesion: 0.06
Nodes (26): BIG, binned, discord, discordGot, frame(), G2, GAME, hide (+18 more)

### Community 10 - "ranks.e2e.js"
Cohesion: 0.09
Nodes (21): allowed(), asked, CHAMPS, context(), DDATA, fakeApp(), fakeLcu(), game() (+13 more)

### Community 11 - "customs.e2e.js"
Cohesion: 0.10
Nodes (21): allowed(), champFull(), CHAMPS, DDATA, fakeApp(), fakeLcu(), ITEMS, JG_GAMES (+13 more)

### Community 12 - "coach.e2e.js"
Cohesion: 0.09
Nodes (18): backdrop(), context(), corner, ctx, DDATA, fakeApp(), foesGame(), game() (+10 more)

### Community 13 - "main.js"
Cohesion: 0.11
Nodes (19): chosen(), COMBO, display(), lastBounds(), LCU_OK, linkWaiting, navigated(), overlayState (+11 more)

### Community 14 - "riot.test.js"
Cohesion: 0.11
Nodes (22): calls, counted(), DAYS, EMERALD, env, GAMES, get(), IDS (+14 more)

### Community 15 - "camera-box.js"
Cohesion: 0.15
Nodes (15): closest(), findIcons(), findMinimap(), findVote(), Follower, iconDiff(), iconLook(), locateMinimap() (+7 more)

### Community 16 - "voice.e2e.js"
Cohesion: 0.11
Nodes (17): CHAMPS, contrast(), CORNER, fakeClient(), fakeOutputs(), fakeScreen(), hears(), ITEMS (+9 more)

### Community 17 - "Room"
Cohesion: 0.14
Nodes (11): events(), get(), load(), CORS, esports(), ring(), squad(), state() (+3 more)

### Community 18 - "steps"
Cohesion: 0.11
Nodes (18): defaults, runs-on, steps, run, jobs, build, name, tags (+10 more)

### Community 19 - "push.js"
Cohesion: 0.24
Nodes (15): RFC-8291, b64(), cat(), CORS, DH, EC, epOf(), hkdf() (+7 more)

### Community 20 - "squad.test.js"
Cohesion: 0.16
Nodes (9): asked, b64(), got, hkdf(), persist, phone(), read(), unb64() (+1 more)

### Community 22 - "practice.e2e.js"
Cohesion: 0.18
Nodes (5): context(), DDATA, fakeApp(), PNG1, SITE

### Community 23 - "lock.test.js"
Cohesion: 0.21
Nodes (8): K1, K2, offer(), offers(), persist, reaches(), sleep(), wr

### Community 24 - "pollLeague"
Cohesion: 0.25
Nodes (9): ask(), clientPhase(), getJson(), health(), lcuAuth(), leagueDirs(), moments(), pollLeague() (+1 more)

### Community 25 - "ref_assert"
Cohesion: 0.25
Nodes (5): before, mm(), near, now, px

### Community 26 - "manifest.json"
Cohesion: 0.22
Nodes (8): background_color, description, display, icons, name, short_name, start_url, theme_color

### Community 27 - "clipDir"
Cohesion: 0.32
Nodes (8): appDir(), binClip(), clipAt(), clipDir(), clipList(), clipOk(), picAt(), picDir()

### Community 28 - "fakeLcu"
Cohesion: 0.25
Nodes (8): allowed(), copy5(), fakeLcu(), flatActions(), friendLcu(), ok(), report(), timeline()

### Community 29 - "ref_http"
Cohesion: 0.25
Nodes (3): got, persist, wr

### Community 30 - "CLAUDE.md"
Cohesion: 0.29
Nodes (5): 1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes, 4. Goal-Driven Execution, 5. Premade code rules

### Community 32 - "recordTick"
Cohesion: 0.33
Nodes (6): addFrame(), hider(), recDir(), recordLcu(), recordTick(), saveTake()

### Community 33 - "Premade"
Cohesion: 0.33
Nodes (5): How it works, License, Premade, What's here, Working on it

### Community 34 - "rpcConnect"
Cohesion: 0.67
Nodes (4): frame(), pipe(), rpcConnect(), rpcSend()

### Community 35 - "context"
Cohesion: 0.67
Nodes (3): champFull(), context(), fakeApp()

### Community 36 - "histOf"
Cohesion: 0.67
Nodes (3): hist(), histOf(), rep()

## Knowledge Gaps
- **1 isolated node(s):** `RFC-8291`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 425 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `electron` connect `electron` to `client.test.js`, `client/package.json`, `main.js`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `RFC-8291` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Riot` be split into smaller, more focused modules?**
  _Cohesion score 0.07462686567164178 - nodes in this community are weakly interconnected._
- **Why does `playwright` connect `ingame.e2e.js` to `league.e2e.js`, `tft.e2e.js`, `group.e2e.js`, `profile.e2e.js`, `ranks.e2e.js`, `customs.e2e.js`, `coach.e2e.js`, `voice.e2e.js`, `practice.e2e.js`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Should `league.e2e.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03571428571428571 - nodes in this community are weakly interconnected._
- **Why does `peer` connect `ingame.e2e.js` to `league.e2e.js`, `tft.e2e.js`, `group.e2e.js`, `profile.e2e.js`, `ranks.e2e.js`, `customs.e2e.js`, `voice.e2e.js`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `ingame.e2e.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06685633001422475 - nodes in this community are weakly interconnected._