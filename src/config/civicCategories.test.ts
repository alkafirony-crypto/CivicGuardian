import { describe, expect, it } from "vitest";
import { CIVIC_CATEGORIES, categoryOptions } from "./civicCategories";

describe("shared civic issue categories", () => {
  it("always exposes the expected modern civic hazards even with an empty report list", () => {
    expect(CIVIC_CATEGORIES.length).toBeGreaterThanOrEqual(9);
    expect(CIVIC_CATEGORIES).toEqual(expect.arrayContaining([
      "Fire & Smoke",
      "Gas Leakage",
      "Road Damage",
      "Flooding & Drainage",
      "Water & Sewer",
      "Electrical Hazard",
      "Waste & Sanitation",
      "Public Safety",
    ]));
    expect(categoryOptions([])).toEqual(["All", ...CIVIC_CATEGORIES]);
  });

  it("keeps a legacy category visible when an older production report uses it", () => {
    const options = categoryOptions(["Road Damage", "Road Infrastructure"]);
    expect(options.filter(item => item === "Road Damage")).toHaveLength(1);
    expect(options).toContain("Road Infrastructure");
  });
});
