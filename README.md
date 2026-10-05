# Tidal Front v0.6.8.5

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

<img src="assets/app-icon-512.png" alt="Tidal Front app icon" width="128">

An offline 3D island strategy game with base building, resource production and combat against NPC bases. Build your defenses, train troops, organize landing craft and support beach assaults with your gunboat.

The game runs in the browser with WebGL2 and JavaScript. A small C++17 server serves the files on your own computer. The repository includes the source code, images, music and sound effects; after downloading them, you can play offline without an account, ads or in-app purchases.

[Installation](#installation) · [Gameplay](#gameplay) · [Controls](#controls) · [Development](#development) · [Contributing](CONTRIBUTING.md) · [Music credits](CREDITS.md)

## Features

- **Build an island base:** produce gold, wood and steel, expand storage, upgrade your headquarters and unlock seven defense types.
- **Assemble a landing force:** field riflemen, heavy gunners, rocketeers, tanks and medics. Each landing craft carries one troop type; higher HQ levels unlock up to eight craft.
- **Support assaults from the sea:** aim gunboat weapons, land craft on the beach and let troops advance and fight under the game's combat rules.
- **Explore a changing island:** a complete day lasts 12 real minutes, with morning, noon, afternoon and night lighting, combat effects and adaptive music.
- **Inspect equipment:** Equipment Island shows the actual Lv.1–10 models and live-fire demonstrations. Eighteen structure and craft types have 180 distinct level thumbnails.
- **Keep progress locally:** browser saves, NPC defense events and deterministic battle replays are part of local play.
- **Choose a language:** English, Simplified Chinese and Japanese. The first launch uses a supported browser language, falling back to English; a manually saved choice takes priority.

## What's new in v0.6.8.5

- Drone models progress through four eras, from rough early equipment to futuristic designs. Late models have four hollow rotor guards, with additional Lv.10 details.
- Drone sorties ease through startup, takeoff, hover, flight, return, landing and shutdown. Each sortie drops one grenade; a lost target causes a return and a new target is selected for the next sortie.
- The current battle ruleset is **30**. Replays recorded under ruleset 29 or earlier retain their historical drone behavior.
- All 180 individual level thumbnails are integrated into construction, inspection and upgrade previews. Initial language selection follows browser preferences.

## Installation

### Requirements

- Linux and Bash.
- g++ with C++17 support.
- A browser with WebGL2 and Ogg audio support.

Node.js is used for development checks, not for playing the game.

On Ubuntu / Debian, install the compiler and Git if needed:

```bash
sudo apt-get install g++ git
```

### Clone and start

```bash
git clone https://github.com/lingsie/Tidal-Front.git
cd Tidal-Front
./install.sh
```

Alternatively, choose **Code → Download ZIP**, or [download the main branch](https://github.com/lingsie/Tidal-Front/archive/refs/heads/main.zip). Extract it, open the `Tidal-Front-main` directory and run:

```bash
bash install.sh
```

If you already have the Linux release archive, run the same command inside its `tidal-front-3d` directory. All images and audio are included. The script builds `tidal-front-server` from source and opens:

**http://127.0.0.1:8787/?v=0.6.8.5**

Open that address yourself if the browser does not launch automatically. Use **Ctrl+C** in the terminal to stop the game server. If another application uses the default port, choose a different one:

```bash
TIDAL_PORT=8788 ./install.sh
```

Use the ♫ button in the game to enable audio. Volume and audio compatibility settings are available in the settings panel.

## Saves and updates

Save format **5** is stored in the browser's `localStorage` for the game's address. Keep using the same browser, hostname and port to continue your save. Changing any of them selects a different storage location; copying the project folder does not copy browser saves. Clearing this site's browser data removes its save.

For a Git installation, stop the server with Ctrl+C, then update from the project directory and restart:

```bash
git pull --ff-only
./install.sh
```

For a ZIP installation, download and extract the newer version, then start it at the same address. Supported older saves are migrated when loaded. Saves from the old single-file `file://` version belong to another browser origin and are not transferred automatically.

## Gameplay

A new base starts with its headquarters. Open the construction shop to build a gold mine, sawmill, steelworks and defenses. Collect resources from production sites into storage, and develop the base to qualify for the next HQ level.

Building construction and building/craft upgrades share **one engineering slot**. Troop and gunboat weapon upgrades share a separate **training slot**; the two slots can work simultaneously. Training raises a troop type's level. Refill missing troops or change troop types on the specific landing craft that carries them.

### Defense unlocks

| HQ level | Newly unlocked defense |
| ---: | --- |
| 1 | Sniper Tower |
| 2 | Heavy Machine Gun |
| 3 | Mortar |
| 4 | Cannon |
| 5 | Rocket Launcher |
| 6 | Anti-Tank Missile Rack |
| 7 | Drone Pad |

The maximum HQ level is **10**. Building, troop and craft upgrades are capped by HQ level; gunboat weapons are also capped by gunboat level. Each base can have one Drone Pad and one Vault.

Scout an NPC base, inspect its defenses and clock, then attack. Landing craft deploy one boatload at a time from the beach; gunboat skills provide support using energy. Battles must finish within one complete game day. Battle reports retain the rules and commands needed for deterministic replays.

## Controls

| Input | Action |
| --- | --- |
| Left-click a building or docked craft | Open its information and actions |
| Right-drag | Rotate the view |
| Middle-drag or Shift + right-drag | Pan the view |
| Mouse wheel | Zoom in ordinary scenes; Equipment Island uses a fixed close-up view |
| Left-click while moving a building | Confirm a valid position |
| Right-click, X or Esc while moving | Cancel the move |
| Number keys 1–8 or craft cards | Select an available landing craft during battle |
| Click the beach with a craft selected | Deploy that craft |
| Space | Pause |

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html`, `src/style.css` | Page structure and layout |
| `src/main.js` | UI, input and game flow |
| `src/core.js` | Economy, combat, NPCs, saves and replay rules |
| `src/render.js` | WebGL2 rendering, models and animation |
| `src/previews.js` | Preview paths and level routing |
| `src/i18n.js` | In-game language handling |
| `assets/` | Images, music, sound effects and generation scripts |
| `server.cpp`, `install.sh` | Local file server and launcher |
| `tests/`, `package.json` | Development checks and npm commands |
| `CREDITS.md` | Music sources, attribution and editing notes |

Compiled programs, ZIP files, logs and local caches are excluded by `.gitignore`. The images and audio required to play are tracked with the source.

## Development

Use **Node.js 22 or newer**. There are no npm package dependencies, so no `npm install` step is needed. `package.json` declares ES modules and provides a single command for the existing checks:

```bash
npm test
```

The checks cover game rules, UI / WebGL call paths, launcher mechanisms, weapons, all 180 level thumbnails and v0.6.8.4 / v0.6.8.5 regressions. UI checks use lightweight DOM / WebGL stand-ins; also verify affected visuals, input and sound in a real browser.

Audio checks need **FFmpeg and ffprobe**. Batch combat simulation can be run separately:

```bash
npm run test:audio
npm run test:simulate -- 1000
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions and bug reports.

## Music and project status

Kevin MacLeod's music is credited in [CREDITS.md](CREDITS.md), including source links, CC BY 4.0 attribution and loop-editing notes. The in-game settings panel also carries these credits.

This version is a playable Linux prototype focused on local base building and NPC combat. In-game models use programmatically generated 3D geometry, with separate illustrated preview images. Report problems or suggest improvements through [GitHub Issues](https://github.com/lingsie/Tidal-Front/issues).
