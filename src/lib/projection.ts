/**
 * Map projection — Lane A, BUILD.md "projection.ts (verbatim xy()/dist()
 * port)". Ported VERBATIM from `mp-headroom-app.html` lines 285-286 (the
 * `var P={...}`, `function xy`, `function dist` block). Pure functions, no
 * DOM. `tests/projection.test.ts` pins these against values computed
 * directly from the legacy app's own node coordinates — do not "improve"
 * the math to be more geographically correct; a faithful port is the
 * point, since `src/data/geometry.ts`'s outline and node positions were
 * drawn against exactly this projection.
 */

/** Projection constants, verbatim from `mp-headroom-app.html:285`. */
export const P = {
  lon0: 73.887086,
  lat1: 27.018841,
  sx: 120.67837814186875,
  k: 0.9135454576426009,
} as const;

/**
 * Project a lat/lng pair onto the map's local SVG coordinate space.
 * Verbatim port of `mp-headroom-app.html:286`:
 *   function xy(lat,lng){return [(lng-P.lon0)*P.k*P.sx,(P.lat1-lat)*P.sx];}
 */
export function xy(lat: number, lng: number): [number, number] {
  return [(lng - P.lon0) * P.k * P.sx, (P.lat1 - lat) * P.sx];
}

/**
 * Haversine great-circle distance in kilometres between two lat/lng
 * points. Verbatim port of `mp-headroom-app.html:334`:
 *   function dist(a,b,c,d){var R=6371,r=Math.PI/180,x=(c-a)*r,y=(d-b)*r;
 *     var h=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;
 *     return 2*R*Math.asin(Math.sqrt(h));}
 *
 * Signature is (lat1, lng1, lat2, lng2), matching the legacy call sites.
 */
export function dist(a: number, b: number, c: number, d: number): number {
  const R = 6371;
  const r = Math.PI / 180;
  const x = (c - a) * r;
  const y = (d - b) * r;
  const h =
    Math.sin(x / 2) ** 2 +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
