# Solmar Bay

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun)
[![rank](https://make.fun/badge/gta6-01/BXwen/gta6-open-world/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/gta6-01/BXwen/gta6-open-world/reward.svg)](https://make.fun)

A sun-soaked 3D open-world crime game for the make.fun **gta6-01** bounty
("Make GTA 6"), built with three.js (vendored, runs fully offline in desktop
Chrome — no network requests).

**Port Solmar. Danny Cole drives for whoever pays.** Fixer Vera Kline owns his
debt — $5,000, and she collects in jobs. Three jobs tonight. Finish them, and
the slate is clean.

## The three jobs

1. **First Pickup** — collect a package at the pier, bring it back to Vera's
   garage. $300.
2. **Hot Wheels** — steal the yellow Comet GT from the central lot and deliver
   it. $600. Stealing it puts a star on you.
3. **The Getaway** — grab the briefcase at the plaza with the cops already
   rolling (3 stars, Rook's crew on your tail), lose the heat, reach the
   marina hideout. $1,200.

## What's in the city

- A drivable coastal city: street grid, beach and sea, pier, plaza with
  fountain, parking lot, marina boatyard, Vera's garage, lamps, palms,
  billboards, clouds and sun.
- **On foot**: walk, sprint, jump, punch (F), pistol (left click) with
  tracers and damage numbers.
- **Driving**: arcade handling with acceleration, braking, reverse, handbrake
  drift and skid marks. Steal any traffic car with E (that's a crime).
- **Traffic and pedestrians**: 14 cars cruising the grid, 22 pedestrians who
  flee crimes.
- **Wanted level and police**: 0–5 stars. Stealing, hitting or killing
  pedestrians raises heat; it decays when you stay clean. Police cars spawn,
  chase, ram and flash their light bars, and pull away when the heat is off.
  Get caught on foot and you're busted.
- **HUD and live minimap**: health, money, wanted stars, objective with
  distance, speedometer, and a minimap showing streets, you, traffic,
  pedestrians, police and the pulsing mission marker.
- **Start screen, pause (Esc/P), and save**: progress (money, jobs done,
  health) saves to localStorage; Continue picks up where you left off.
- **Sound, synthesized**: engine, sirens, gunshots, crashes, UI blips and
  mission jingles — all WebAudio, no audio files.

## How to play

```sh
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse drag (click canvas to lock) | Look around |
| Shift | Sprint |
| Space | Jump / handbrake while driving |
| E | Enter or exit a car / pick up / deliver |
| F | Punch |
| Left click | Fire pistol |
| R | Restart current mission |
| M | Mute sound |
| Esc / P | Pause |
