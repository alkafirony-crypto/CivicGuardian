import { describe, expect, it } from "vitest";
import { takeSelectedImageFile } from "./ImageUploader";

describe("ImageUploader file selection", () => {
  it("resets the browser input so the same photo can be selected again", () => {
    const file = { name: "evidence.jpg", type: "image/jpeg" } as File;
    const input = { files: [file] as unknown as FileList, value: "C:\\fakepath\\evidence.jpg" };

    expect(takeSelectedImageFile(input)).toBe(file);
    expect(input.value).toBe("");

    input.value = "C:\\fakepath\\evidence.jpg";
    expect(takeSelectedImageFile(input)).toBe(file);
    expect(input.value).toBe("");
  });
});
