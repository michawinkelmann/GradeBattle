// Mulberry32 - small seedable PRNG, deterministic across browsers
export function createRng(seed) {
  let s = (seed | 0) || 1;
  return {
    next() {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) { return min + (max - min) * this.next(); },
    int(min, max) { return Math.floor(this.range(min, max + 1)); },
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  };
}

export function randomSeed() {
  return (Math.random() * 0x7fffffff) | 0;
}
