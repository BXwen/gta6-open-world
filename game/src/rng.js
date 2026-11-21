// Repeatable random streams for world generation and lightweight game choices.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let bits = Math.imul(state ^ (state >>> 15), 1 | state);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), 61 | bits);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const draw = mulberry32(seed);
  const between = (low, high) => low + draw() * (high - low);
  return {
    next: draw,
    range: between,
    int: (low, high) => Math.floor(between(low, high + 1)),
    pick: (items) => items[Math.floor(draw() * items.length)],
    chance: (probability) => draw() < probability,
  };
}
