export const BANGLADESH_SERVICE_BOUNDS = {
  minLat: 20.55,
  maxLat: 26.70,
  minLng: 88.00,
  maxLng: 92.75,
} as const;

export function insideBangladeshServiceArea(lat: number, lng: number) {
  const bounds = BANGLADESH_SERVICE_BOUNDS;
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= bounds.minLat
    && lat <= bounds.maxLat
    && lng >= bounds.minLng
    && lng <= bounds.maxLng;
}

export function bangladeshSearchQueries(value: string) {
  const query = value.replace(/\s+/g, " ").trim().replace(/,?\s*bangladesh\s*$/i, "");
  const variants = new Set([query]);
  const roadPattern = /\b(?:road|rd)\s*(?:(?:no\.?|number)|#)?\s*[-:]?\s*(\d+[a-z]?)\b/i;
  const match = query.match(roadPattern);
  if (match) {
    variants.add(query.replace(roadPattern, `Road No. ${match[1]}`));
    variants.add(query.replace(roadPattern, `Road ${match[1]}`));
  }
  return [...variants].filter(Boolean).map(item => `${item}, Bangladesh`);
}

export function geocodeResultZoom(type = "", addressType = "") {
  const kind = `${type} ${addressType}`.toLowerCase();
  if (/house|building|amenity|shop|office|tourism/.test(kind)) return 18;
  if (/road|street|highway|residential|tertiary|secondary|primary/.test(kind)) return 17;
  if (/neighbourhood|suburb|quarter|village/.test(kind)) return 15;
  if (/town|city|municipality/.test(kind)) return 13;
  if (/district|county|state|administrative/.test(kind)) return 10;
  return 15;
}
