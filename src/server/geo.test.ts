import { describe, expect, it } from "vitest";
import { bangladeshSearchQueries, geocodeResultZoom, insideBangladeshServiceArea } from "./geo";

describe("Bangladesh geographic coverage", () => {
  it("accepts representative locations across every division and the southern islands", () => {
    const locations = [
      [23.8103, 90.4125], // Dhaka
      [22.3569, 91.7832], // Chattogram
      [24.8949, 91.8687], // Sylhet
      [22.8456, 89.5403], // Khulna
      [24.3745, 88.6042], // Rajshahi
      [25.7439, 89.2752], // Rangpur
      [22.7010, 90.3535], // Barishal
      [20.6265, 92.3226], // Saint Martin's Island
    ];
    for (const [lat, lng] of locations) expect(insideBangladeshServiceArea(lat, lng)).toBe(true);
  });

  it("rejects coordinates outside the configured national map extent", () => {
    expect(insideBangladeshServiceArea(27.70, 90.40)).toBe(false);
    expect(insideBangladeshServiceArea(18.50, 91.00)).toBe(false);
    expect(insideBangladeshServiceArea(23.00, 95.00)).toBe(false);
  });

  it("normalizes road-number searches and chooses a close road zoom", () => {
    expect(bangladeshSearchQueries("Road #12, Dhanmondi, Dhaka")).toEqual([
      "Road #12, Dhanmondi, Dhaka, Bangladesh",
      "Road No. 12, Dhanmondi, Dhaka, Bangladesh",
      "Road 12, Dhanmondi, Dhaka, Bangladesh",
    ]);
    expect(geocodeResultZoom("residential", "road")).toBe(17);
    expect(geocodeResultZoom("city", "city")).toBe(13);
  });
});
