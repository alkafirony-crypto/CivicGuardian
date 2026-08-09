export const CIVIC_CATEGORIES = [
  "Fire & Smoke",
  "Gas Leakage",
  "Road Damage",
  "Flooding & Drainage",
  "Water & Sewer",
  "Electrical Hazard",
  "Waste & Sanitation",
  "Public Safety",
  "Public Property Damage",
  "Other",
  "Uncertain",
] as const;

export type CivicCategory = (typeof CIVIC_CATEGORIES)[number];

export function categoryOptions(existing: string[] = []) {
  const known = new Set<string>(CIVIC_CATEGORIES);
  const legacy = existing.filter(category => category && !known.has(category));
  return ["All", ...CIVIC_CATEGORIES, ...Array.from(new Set(legacy)).sort()];
}
