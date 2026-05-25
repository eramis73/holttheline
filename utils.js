export function segsIntersect(a, b, c, d) {
  const dx1 = b.x - a.x, dz1 = b.z - a.z, dx2 = d.x - c.x, dz2 = d.z - c.z;
  const denom = dx1 * dz2 - dz1 * dx2;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((c.x - a.x) * dz2 - (c.z - a.z) * dx2) / denom;
  const u = ((c.x - a.x) * dz1 - (c.z - a.z) * dx1) / denom;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

export function isPointInPolygon(point, vs) {
  let x = point.x, y = point.z;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].z;
    let xj = vs[j].x, yj = vs[j].z;
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function _seedRng(seed) {
  let s = seed | 0;
  return function () {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
