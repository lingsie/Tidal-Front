# Contributing to Tidal Front

**English** · [简体中文](CONTRIBUTING.zh-CN.md) · [日本語](CONTRIBUTING.ja.md)

## Run locally

Follow the [installation instructions](README.md#installation), clone the source and run `./install.sh`. You need Linux, Bash, g++ with C++17 support, and a browser with WebGL2 / Ogg support. The default address is `http://127.0.0.1:8787`; stop the server with Ctrl+C.

Use Node.js 22 or newer for development checks. There are no npm package dependencies. Run the existing rule, UI / WebGL, weapon, level-image and release regression checks with:

```bash
npm test
```

For audio changes, install FFmpeg / ffprobe and run `npm run test:audio`. For economy, combat or NPC rule changes, use `npm run test:simulate -- 1000` to inspect batch results. Also check affected interactions, visuals and sound in a real browser; the lightweight DOM / WebGL checks do not replace browser verification.

## Change conventions

- Game rules and save migrations are mainly in `src/core.js`; UI and input are in `src/main.js`, rendering in `src/render.js`, and language handling in `src/i18n.js`.
- When changing combat rules, check that historical battle reports still replay under their original rules. When changing saves, verify migration from older formats and preservation of resources and troops.
- Check new UI text in English, Simplified Chinese and Japanese. New level thumbnails should remain distinct PNGs with alpha transparency, matching the paths in `src/previews.js`.
- Maintain source and attribution notes when adding or replacing music, sound effects or images. Existing music credits are in `CREDITS.md`.
- Keep the compiled `tidal-front-server`, ZIP files, logs and caches local. Commit source files and the original assets required to play.

## Report a problem or submit a change

In [GitHub Issues](https://github.com/lingsie/Tidal-Front/issues), include the game version, operating system, browser version, steps to reproduce, actual result and expected result. Screenshots or short videos help with visual or audio problems.

Describe the problem your pull request fixes, the behavior it changes and the checks you ran. Use meaningful existing checks for the affected area; prose-only changes do not need new tests.
