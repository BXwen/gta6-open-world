// Shared tuning and content for Solmar Bay: an original sun-soaked coastal
// city, its story, its missions and every number the systems below use.

export const CONFIG = {
  seed: 1,
  // City layout: a street grid with a beach and sea on the south edge.
  cityHalf: 220, // playable ground runs -220..220 on x and z
  blockSize: 48, // building block side
  streetWidth: 14, // road surface width
  streetStep: 62, // block + street pitch
  beachZ: 196, // sand starts here
  waterZ: 232, // sea starts here
  // Player
  walkSpeed: 6.5,
  sprintSpeed: 10.5,
  jumpSpeed: 8.5,
  playerHealth: 100,
  // Cars
  carAccel: 16,
  carBrake: 34,
  carReverse: 9,
  carMaxSpeed: 40,
  carMaxReverse: 12,
  carHealth: 100,
  // Wanted
  maxWanted: 5,
  wantedDecayDelay: 20, // seconds with no crime before stars start falling
  wantedDecayInterval: 12, // seconds per star lost while clean
  // Combat
  punchDamage: 25,
  punchRange: 2.4,
  pistolDamage: 34,
  pistolRange: 70,
  pistolRate: 0.28, // seconds between shots
  // Money
  startMoney: 250,
  bustedFine: 150,
  wastedFine: 200,
  thugDrop: 50,
};

export const PALETTE = {
  sky: 0x7fb2dd,
  fog: 0x9eb7d6,
  sand: 0xe8d5a2,
  sea: 0x2e7f9e,
  seaDeep: 0x1d5a75,
  asphalt: 0x3a3f46,
  asphaltLine: 0xfff3d6,
  sidewalk: 0x8b8f92,
  grass: 0x6f9e5a,
  building: [0xf4e2be, 0xd7e6ee, 0x83b7d5, 0xe7a9b7, 0xeab477, 0xcf835f, 0xbda6ca, 0xe2cb9d, 0x75bab9, 0x85b69a],
  roof: [0x6b5a48, 0x7a6a58, 0x5a5a62, 0x8a7a68, 0x8b7478],
  windowLit: 0xffe9a8,
  windowDark: 0x2c3a48,
  palmTrunk: 0x8a6a48,
  palmLeaf: 0x3f8f4f,
  lamp: 0x2e3238,
  pier: 0x8a6a42,
};

export const CAR_COLORS = [
  0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xd8d8d8, 0x22242a,
  0x7a4fb5, 0xe07b28, 0x4fb5b0, 0xb03a5e, 0x8a8f96, 0x3a3f46,
];

// The story: Danny Cole, a wheelman who owes the fixer Vera Kline.
// Three jobs pay the debt down. Names, places and cars are all invented.
export const STORY = {
  title: 'SOLMAR BAY',
  tagline: 'A sun-soaked open city. One driver. Three jobs. No way out but through.',
  intro: [
    'Port Solmar. Danny Cole drives for whoever pays.',
    'Fixer Vera Kline owns his debt — $5,000, and she collects in jobs.',
    'Three jobs tonight. Finish them, and the slate is clean.',
  ],
  outro: [
    'Debt cleared. The bay is yours, Danny.',
    'Vera keeps her word. Solmar Bay keeps its secrets.',
  ],
};

export const MISSIONS = [
  {
    id: 1,
    name: 'First Pickup',
    client: 'Vera Kline',
    briefing: 'A package waits at the end of the south pier. Walk or drive there, grab it, and bring it back to my garage. No trouble — unless you make some.',
    objective: 'Pick up the package at the pier',
    returnObjective: 'Return the package to Vera\u2019s garage',
    reward: 300,
    pickup: { x: 30, z: 218, label: 'Pier package' },
    dropoff: { x: -186, z: -186, label: 'Vera\u2019s garage' },
    wantedOnStart: 0,
  },
  {
    id: 2,
    name: 'Hot Wheels',
    client: 'Vera Kline',
    briefing: 'A yellow Comet GT is parked in the central lot. Take it — the owner will object, the law will notice — and deliver it to my garage in one piece.',
    objective: 'Steal the yellow Comet GT',
    returnObjective: 'Deliver the Comet GT to Vera\u2019s garage',
    reward: 600,
    targetCar: { x: 62, z: 62, color: 0xe8c832, model: 'Comet GT' },
    dropoff: { x: -186, z: -186, label: 'Vera\u2019s garage' },
    wantedOnStart: 0,
    wantedOnSteal: 1,
    thugs: 0,
  },
  {
    id: 3,
    name: 'The Getaway',
    client: 'Vera Kline',
    briefing: 'The deal went wrong. Cops are already rolling and Rook\u2019s crew is at the plaza. Grab the briefcase, lose the heat, and reach the east marina hideout.',
    objective: 'Grab the briefcase at the plaza',
    returnObjective: 'Lose the cops, then reach the marina hideout',
    reward: 1200,
    pickup: { x: 0, z: 0, label: 'Briefcase' },
    dropoff: { x: 186, z: 150, label: 'Marina hideout' },
    wantedOnStart: 3,
    thugs: 3,
  },
];

export const CONTROLS = [
  ['W A S D', 'Move / drive'],
  ['Mouse drag', 'Look around (click canvas to lock)'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump / handbrake while driving'],
  ['E', 'Enter or exit a car / pick up'],
  ['F', 'Punch'],
  ['Left click', 'Fire pistol'],
  ['R', 'Restart current mission'],
  ['M', 'Mute sound'],
  ['Esc / P', 'Pause'],
];

export const SAVE_KEY = 'solmar-bay-save-v1';
