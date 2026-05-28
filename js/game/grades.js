// Notenpunkte 0..100. 100 = Note 1, 0 = Note 6.
export const MAX_POINTS = 100;

export function pointsToGrade(p) {
  const clamped = Math.max(0, Math.min(MAX_POINTS, p));
  return 1 + (MAX_POINTS - clamped) / MAX_POINTS * 5;
}

export function gradeLabel(p) {
  const g = pointsToGrade(p);
  const whole = Math.round(g);
  const frac = g - whole;
  let tend = '';
  if (frac > 0.2) tend = '-';
  else if (frac < -0.2) tend = '+';
  return `${whole}${tend}`;
}

export function gradeOneDecimal(p) {
  return pointsToGrade(p).toFixed(1);
}

export function isFailed(p) { return p <= 0; }

export function gradeColor(p) {
  const g = pointsToGrade(p);
  // 1 = green, 6 = red
  const t = (g - 1) / 5;
  const r = Math.round(110 + t * 145);
  const gn = Math.round(220 - t * 180);
  const b = Math.round(80 - t * 30);
  return `rgb(${r},${gn},${b})`;
}

export function applyDamage(player, amount) {
  if (player.outOfGame) return 0;
  const before = player.points;
  player.points = Math.max(0, player.points - amount);
  if (player.points <= 0 && !player.outOfGame) {
    player.outOfGame = true;
    player._justFailed = true;
  }
  return before - player.points;
}

export function applyHeal(player, amount) {
  if (player.outOfGame) return 0;
  const before = player.points;
  player.points = Math.min(MAX_POINTS, player.points + amount);
  return player.points - before;
}
