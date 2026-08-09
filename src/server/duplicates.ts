import type { CivicIssue, DuplicateCandidate } from "../types";

const TERMINAL_STATUSES = new Set(["resolved", "rejected", "duplicate"]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(word => word.length > 2),
  );
}

export function textSimilarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function distanceMeters(latA: number, lngA: number, latB: number, lngB: number): number {
  const toRad = (value: number) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankDuplicateCandidates(input: {
  lat: number;
  lng: number;
  category: string;
  title?: string;
  description?: string;
}, issues: CivicIssue[], now = Date.now()): DuplicateCandidate[] {
  const incomingText = `${input.title || ""} ${input.description || ""}`.trim();

  return issues
    .filter(issue => issue.lat !== undefined && issue.lng !== undefined && !TERMINAL_STATUSES.has(issue.status))
    .map(issue => {
      const distance = Math.round(distanceMeters(input.lat, input.lng, issue.lat!, issue.lng!));
      const similarity = textSimilarity(incomingText, `${issue.title} ${issue.description}`);
      const ageDays = Math.max(0, (now - new Date(issue.createdAt).getTime()) / 86_400_000);
      const sameCategory = issue.category === input.category;
      const distanceScore = Math.max(0, 1 - distance / 600);
      const recencyScore = Math.max(0, 1 - ageDays / 90);
      const score = (sameCategory ? 0.42 : 0) + distanceScore * 0.28 + similarity * 0.22 + recencyScore * 0.08;
      const reasons: string[] = [];
      if (sameCategory) reasons.push("Same category");
      reasons.push(`${distance} metres away`);
      if (ageDays < 1) reasons.push("Reported today");
      else reasons.push(`Reported ${Math.max(1, Math.round(ageDays))} day${Math.round(ageDays) === 1 ? "" : "s"} ago`);
      if (similarity >= 0.25) reasons.push("Similar description");
      return { issue, distanceMeters: distance, similarityScore: Math.round(score * 100), reasons };
    })
    .filter(candidate => candidate.distanceMeters <= 600 && candidate.similarityScore >= 35)
    .sort((a, b) => b.similarityScore - a.similarityScore || a.distanceMeters - b.distanceMeters)
    .slice(0, 5);
}
