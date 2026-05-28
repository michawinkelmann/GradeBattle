// Fixed-timestep simulation, decoupled rendering.
const STEP = 1 / 60;
const MAX_FRAME = 0.25;

export function createLoop({ update, render }) {
  let last = 0;
  let acc = 0;
  let running = false;
  let rafId = 0;

  function tick(ts) {
    if (!running) return;
    if (last === 0) last = ts;
    let delta = (ts - last) / 1000;
    last = ts;
    if (delta > MAX_FRAME) delta = MAX_FRAME;
    acc += delta;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render(acc / STEP);
    rafId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    get running() { return running; }
  };
}
