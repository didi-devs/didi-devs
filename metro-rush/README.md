# Metro Rush

A fast, original 3D endless runner for the browser. Dash through a
stylized elevated-metro city, dodge trains and barriers, chain a coin
combo, and push your best score as far as you can. Built with
Three.js, TypeScript and Vite — no game engine, no React, just a
clean modular game loop.

Metro Rush is an original production: its character, world, art
direction, audio and UI are all built from scratch for this project
and are not affiliated with, based on, or copied from any existing
commercial runner game.

## Technology

- **Three.js** for rendering (WebGL)
- **TypeScript** in strict mode, no `any` outside justified pooling casts
- **Vite** for dev server + production bundling
- **Web Audio API** for fully procedural sound (no audio files to license)
- **localStorage** for save data (high score, best distance, settings)
- Plain HTML/CSS for menus and HUD — the game loop itself never touches the DOM

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens a hot-reloading dev server (default `http://localhost:5173`).

## Production build

```bash
npm run build
```

Type-checks with `tsc` and bundles with Vite into `dist/`. Preview the
production build locally with:

```bash
npm run preview
```

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move left | `←` / `A` | Swipe left |
| Move right | `→` / `D` | Swipe right |
| Jump | `↑` / `W` / `Space` | Swipe up |
| Slide | `↓` / `S` | Swipe down |
| Pause | `Esc` | Pause button |

## Architecture

```
src/
  main.ts                  Entry point
  game/
    config/GameConfig.ts    All tunable gameplay constants
    types/Types.ts          Shared enums/interfaces
    core/                   Game orchestrator, loop, state machine, quality, collisions
    player/                 PlayerController, PlayerStateMachine, procedural character model
    camera/                 Third-person chase camera
    world/                  Ground, scenery, biomes, lighting, fog
    generation/              DifficultyDirector, PatternLibrary, ChunkManager (level director)
    obstacles/                Obstacle kinds + pooled ObstacleManager
    collectibles/            CoinManager
    powerups/                 PowerUpManager
    effects/                  Pooled GPU particle system
    audio/                    Procedural AudioManager (Web Audio synthesis)
    input/                    Unified keyboard + touch InputManager
    progression/               SaveManager, ScoreManager
    ui/                        UIManager + style.css (all DOM/HUD/menu logic)
    utils/                     ObjectPool, math helpers
```

Every major system is a standalone class with a narrow interface;
`Game.ts` is the only class that wires them all together. This keeps
individual systems (say, the coin manager or the level generator)
testable and replaceable in isolation.

### Key systems

- **PlayerStateMachine** — explicit `RUNNING / LANE_CHANGING / JUMPING / FALLING / SLIDING / STUMBLING / DEAD` states with a validated transition table, so impossible combinations (e.g. sliding mid-air) can't happen.
- **DifficultyDirector** — smoothly ramps forward speed toward `SPEED.MAX` and computes a 0–1 "difficulty budget" with a gentle sinusoidal pacing wave layered on top, so intensity breathes instead of climbing forever.
- **ChunkManager + PatternLibrary** — hand-authored, difficulty-rated obstacle/coin/power-up chunks. `validatePattern()` rejects any chunk where all three lanes are simultaneously blocked by a lane-change-mandatory obstacle at the same z-slice, guaranteeing a survivable path.
- **CollisionSystem** — lane-aware broad phase + forgiving AABB-vs-capsule style hitboxes (smaller than the visual mesh) so players are never hit by something they visually cleared. Also detects near-misses for bonus score/feedback.
- **ObjectPool** — generic pool used by every spawner (ground tiles, obstacles, coins, power-ups, scenery, particles) to keep the game GC-free during long runs.
- **ParticleManager** — a single `THREE.Points` draw call with a custom shader (per-particle size + additive blending) serving every visual effect (dust, sparkle, impact, speed lines).
- **AudioManager** — every sound effect and the background music loop are synthesized at runtime via the Web Audio API (oscillators, noise bursts, filters) — see "Asset replacement" below for swapping in real audio.

## Configuration

Nearly every gameplay-affecting number (speeds, jump force, gravity,
lane width, spawn/despawn distances, coin value, power-up durations,
camera framing, difficulty curve, quality presets) lives in
`src/game/config/GameConfig.ts`. Tune the game there without hunting
through the rest of the codebase.

## Asset replacement

The project is intentionally built on procedural geometry and
synthesized audio so it never blocks on missing art. To upgrade:

- **Character model**: `src/game/player/PlayerModel.ts` builds the
  runner from primitives and returns named limb groups. Swap this for
  a GLTF loader that returns the same named-group shape (or refactor
  `PlayerController` to drive an `AnimationMixer`) without touching
  movement/state logic.
- **Obstacles/scenery**: `buildMesh()` factories in
  `src/game/obstacles/ObstacleTypes.ts` and `WorldManager`'s
  `buildLamp/buildPillar/buildBuilding` can be swapped for GLTF loads;
  only the returned `Object3D` and hitbox definition matter to the
  rest of the game.
- **Audio**: `AudioManager.playSfx()` and `startMusic()` currently
  synthesize everything. Replace with `AudioBufferSourceNode` playback
  of loaded files while keeping the same public method signatures.

## Deployment

`npm run build` produces a static `dist/` folder — deploy it to any
static host (Vercel, Netlify, GitHub Pages, S3 + CloudFront, etc.)
with no server-side requirements.

## Known future expansion points

- Swap the procedural character/obstacles for real GLTF art (architecture already supports it, see above).
- Real recorded SFX/music in place of the synthesized placeholders.
- Daily-challenge / mission system (SaveManager's `unlocks` array is ready to extend).
- Grind rails, ramps, and alternate elevated routes as an additional obstacle family.
- Leaderboards via a small backend swapped in behind `SaveManager`'s interface.
