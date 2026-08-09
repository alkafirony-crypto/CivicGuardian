import { describe, expect, it } from "vitest";
import type { CivicIssue } from "../types";
import { rankDuplicateCandidates, textSimilarity } from "./duplicates";

const issue: CivicIssue = {
  id: "CG-DUP",
  title: "Large pothole on Mirpur Road",
  description: "A deep pothole is blocking the left traffic lane.",
  imageUrl: "data:image/jpeg;base64,AA==",
  status: "under_review",
  category: "Road Infrastructure",
  address: "Mirpur Road, Dhaka",
  createdAt: "2026-08-08T00:00:00.000Z",
  upvotes: 0,
  verifiedByCount: 0,
  lat: 23.8001,
  lng: 90.4001,
  timeline: [],
};

describe("smart duplicate matching", () => {
  it("recognizes related descriptions without auto-merging", () => {
    expect(textSimilarity("deep pothole blocking road", "large pothole in road lane")).toBeGreaterThan(0.2);
    const matches = rankDuplicateCandidates({
      lat: 23.8,
      lng: 90.4,
      category: "Road Infrastructure",
      description: "There is a deep pothole blocking the road lane",
    }, [issue], new Date("2026-08-09T00:00:00.000Z").getTime());
    expect(matches).toHaveLength(1);
    expect(matches[0].reasons).toContain("Same category");
    expect(matches[0].similarityScore).toBeGreaterThanOrEqual(35);
  });

  it("does not suggest resolved reports", () => {
    expect(rankDuplicateCandidates({ lat: 23.8, lng: 90.4, category: issue.category }, [{ ...issue, status: "resolved" }])).toEqual([]);
  });
});
