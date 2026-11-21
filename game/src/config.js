export const CONFIG = {
  seed: 1, cityHalf: 220, blockSize: 48, streetWidth: 14, streetStep: 62,
  beachZ: 196, waterZ: 232, walkSpeed: 6.5, sprintSpeed: 10.5, jumpSpeed: 8.5,
  playerHealth: 100, carAccel: 16, carBrake: 34, carReverse: 9, carMaxSpeed: 40,
  carMaxReverse: 12, carHealth: 100, maxWanted: 5, wantedDecayDelay: 20,
  wantedDecayInterval: 12, punchDamage: 25, punchRange: 2.4, pistolDamage: 34,
  pistolRange: 70, pistolRate: 0.28, startMoney: 250, bustedFine: 150,
  wastedFine: 200, thugDrop: 50
};
export const PALETTE = {
  sky: 8368861, fog: 10401750, sand: 15259042, sea: 3047326, seaDeep: 1923701,
  asphalt: 3817286, asphaltLine: 16774102, sidewalk: 9146258, grass: 7315034,
  windowLit: 16771496, windowDark: 2898504, palmTrunk: 9071176,
  palmLeaf: 4165455, lamp: 3027512, pier: 9071170,
  building: [16048830, 14149358, 8632277, 15182263, 15381623, 13599583, 12429002, 14863261, 7715513, 8763034],
  roof: [7035464, 8022616, 5921378, 9075304, 9139320]
};
export const CAR_COLORS = [12729134, 3043266, 15255602, 3843669, 14211288, 2237482, 8015797, 14711592, 5223856, 11549278, 9080726, 3817286];
export const STORY = {
  title: "SOLMAR BAY",
  tagline: ["A sun-soaked open city.", "One driver.", "Three jobs.", "No way out but through."].join(" "),
  intro: ["", "Port Solmar.", "Danny Cole drives for whoever pays.", "", "Fixer Vera Kline owns his debt —", "$5,000, and she collects in jobs.", "", "Three jobs tonight.", "Finish them, and the slate is clean."],
  outro: ["", "Debt cleared.", "The bay is yours, Danny.", "", "Vera keeps her word.", "Solmar Bay keeps its secrets."]
};
export const MISSIONS = [
  {
    id: 1, name: "First Pickup", client: "Vera Kline",
    briefing: ["A package waits at the end of the south pier.", "Walk or drive there, grab it, and bring it back to my garage.", "No trouble — unless you make some."].join(" "),
    objective: "Pick up the package at the pier", returnObjective: "Return the package to Vera’s garage",
    reward: 300, pickup: { x: 30, z: 218, label: "Pier package" },
    dropoff: { x: -186, z: -186, label: "Vera’s garage" }, wantedOnStart: 0
  },
  {
    id: 2, name: "Hot Wheels", client: "Vera Kline",
    briefing: ["A yellow Comet GT is parked in the central lot.", "Take it — the owner will object, the law will notice —", "and deliver it to my garage in one piece."].join(" "),
    objective: "Steal the yellow Comet GT", returnObjective: "Deliver the Comet GT to Vera’s garage",
    reward: 600, targetCar: { x: 62, z: 62, color: 15255602, model: "Comet GT" },
    dropoff: { x: -186, z: -186, label: "Vera’s garage" }, wantedOnStart: 0, wantedOnSteal: 1, thugs: 0
  },
  {
    id: 3, name: "The Getaway", client: "Vera Kline",
    briefing: ["The deal went wrong.", "Cops are already rolling and Rook’s crew is at the plaza.", "Grab the briefcase, lose the heat, and reach the east marina hideout."].join(" "),
    objective: "Grab the briefcase at the plaza", returnObjective: "Lose the cops, then reach the marina hideout",
    reward: 1200, pickup: { x: 0, z: 0, label: "Briefcase" },
    dropoff: { x: 186, z: 150, label: "Marina hideout" }, wantedOnStart: 3, thugs: 3
  }
];
const controlPair = (keyName, taskName) => [keyName, taskName];
export const CONTROLS = [
  controlPair("W A S D", "Move / drive"), controlPair("Mouse drag", "Look around (click canvas to lock)"),
  controlPair("Shift", "Sprint"), controlPair("Space", "Jump / handbrake while driving"),
  controlPair("E", "Enter or exit a car / pick up"), controlPair("F", "Punch"),
  controlPair("Left click", "Fire pistol"), controlPair("R", "Restart current mission"),
  controlPair("M", "Mute sound"), controlPair("Esc / P", "Pause")
];
export const SAVE_KEY = "solmar-bay-save-v1";
