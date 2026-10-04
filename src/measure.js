export const METRES_PER_UNIT = 1_000_000;

export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function nearestBody(position, bodies) {
  return bodies.reduce((best, body) => {
    const centre = distance(position, body.position);
    const surface = body.radius == null ? null : centre - body.radius;
    // A position inside a planet belongs to that planet; otherwise compare surface distances.
    const proximity = surface == null ? centre : Math.max(0, surface);
    return !best || proximity < best.proximity ? { body, centre, surface, proximity } : best;
  }, null);
}

export function parseGps(distanceText, longitudeText, latitudeText) {
  const values = [distanceText, longitudeText, latitudeText].map(text => text.trim() ? Number(text) : NaN);
  const [radius, longitude, latitude] = values;
  if (!values.every(Number.isFinite) || radius < 0 || radius > 1e12 ||
      longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error('Enter distance 0–1 trillion m, longitude −180° to 180°, and latitude −90° to 90°.');
  }
  return values;
}

// The game's Sun-centred Space GPS uses BurstUtility spherical coordinates:
// longitude = atan2(z, x), latitude = asin(y / distance), angles in degrees.
export function sphericalToCartesian(radius, longitude, latitude) {
  const lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
  const horizontal = radius * Math.cos(lat);
  return [horizontal * Math.cos(lon), radius * Math.sin(lat), horizontal * Math.sin(lon)];
}

export function cartesianToSpherical([x, y, z]) {
  const radius = Math.hypot(x, y, z);
  return [radius, radius ? Math.atan2(z, x) * 180 / Math.PI : 0,
    radius ? Math.asin(Math.max(-1, Math.min(1, y / radius))) * 180 / Math.PI : 0];
}

export function formatMetres(value) {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e9) return `${(value / 1e9).toFixed(3)} Gm`;
  if (magnitude >= 1e6) return `${(value / 1e6).toFixed(3)} Mm`;
  if (magnitude >= 1e3) return `${(value / 1e3).toFixed(2)} km`;
  return `${value.toFixed(1)} m`;
}
