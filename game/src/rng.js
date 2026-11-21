export function mulberry32(seed) {
  let counter = seed >>> 0;
  return function () {
    counter = (1831565813 + counter) >>> 0;
    let word = Math.imul(counter ^ (counter >>> 15), counter | 1);
    word ^= word + Math.imul(word ^ (word >>> 7), word | 61);
    return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeRng(seed) {
  const draw = mulberry32(seed);
  return {
    next: draw,
    range: (minimum, maximum) => minimum + (maximum - minimum) * draw(),
    int: (minimum, maximum) => minimum + Math.floor(draw() * (1 + maximum - minimum)),
    pick: (items) => items[Math.floor(items.length * draw())],
    chance: (probability) => draw() < probability
  };
}
