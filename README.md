# Apex Ridge

A 60fps sunlit alpine canyon 3D time-trial racing game built with Three.js, React, TypeScript, and procedural Web Audio. Choose between a snap-drift arcade GT car and an anti-gravity hovercraft across three handcrafted mountain courses (playable in both Forward and Reverse directions) while racing your own holographic personal-best ghost.

## Features

- **Three Alpine Courses (Forward & Reverse)**:
  - **Pine Ridge Circuit** *(Beginner)* — Flowing timberland sweepers.
  - **Switchback Pass** *(Intermediate)* — Tight banked canyon hairpins and an elevated gorge bridge.
  - **Skyway Summit** *(Expert)* — Narrow alpine ridge run with a crest jump and rapid chicanes.
- **Two Distinct Vehicle Classes**:
  - **Alpine Drift GT** — Arcade drift car with rear-slip traction, tire skid marks, sparks, and a 3-tier turbo boost release.
  - **Valkyrie AG-01** — High-speed anti-gravity hovercraft with hovering suspension, aerodynamic banking, and flaring airbrake drifts.
- **Personal-Best Ghost Replays & Live Split Deltas**:
  - Records 30 Hz vehicle pose, track progress (`trackT`), and real wheel speed.
  - Persists your fastest run per `(track, direction, vehicle)` in browser `localStorage` under the `apex-ridge:pb:v1:` prefix.
  - Renders a translucent holographic cyan ghost alongside exact time-at-progress live deltas and sub-millisecond checkpoint splits.
- **100% Procedural Assets & Web Audio**:
  - Faceted alpine canyon terrain, ~650 instanced pine trees, instanced boulders, procedural asphalt/curb textures, and real-time synthesized engine/turbine, drift screech, boost surge, countdown, and checkpoint chime audio.

## Controls

| Action | Keyboard | Touch (`pointer: coarse`) |
| --- | --- | --- |
| Drive / Accelerate | `W` or `↑` | **Gas** button |
| Brake / Reverse | `S` or `↓` | **Brake** button |
| Steer | `A` / `D` or `←` / `→` | **◀ / ▶** buttons |
| Drift & Charge Boost | `Space` or `Shift` | **Drift** button |
| Respawn at Checkpoint | `C` or `Backspace` | Control Dock → **Respawn CP** |
| Instant Lap Restart | `R` | Control Dock → **Restart** |
| Cycle Camera (`Chase`/`Far`/`Hood`) | `V` | Control Dock → **Cam** |
| Toggle Ghost | `G` | Control Dock → **Ghost** |
| Mute Audio | `M` | Control Dock → **Audio** |
| Collapse Control Dock | `H` | Dock tab (**Hide/Show Controls**) |
| Return to Tracks & Garage | `Esc` | Control Dock → **Tracks & Garage** |

## Development

```bash
npm install
npm run dev      # Start local dev server on port 3000
npm run lint     # TypeScript type-check (tsc --noEmit)
npm test         # Run physics, track lookup, wall clearance, and ghost verification suite
npm run build    # Build production bundle (with split Three.js chunk)
```
