import { describe, expect, it } from "vitest";

import {
  createPackSchema,
  conversionJobRequestSchema,
  setAssetEmojisSchema,
} from "../src/schema";

describe("shared schemas", () => {
  it("validates pack creation", () => {
    expect(createPackSchema.parse({ name: "Cats" }).name).toBe("Cats");
  });

  it("validates conversion requests", () => {
    expect(
      conversionJobRequestSchema.parse({
        jobId: "job",
        outputRoot: "/tmp/out",
        tasks: [{ assetId: "a", sourcePath: "/tmp/a.png", mode: "icon" }],
      }).tasks,
    ).toHaveLength(1);
  });

  it("validates telegram-compliant emoji lists", () => {
    expect(
      setAssetEmojisSchema.parse({
        packId: "pack-1",
        assetId: "asset-1",
        emojis: ["🙂", "✨"],
      }).emojis,
    ).toEqual(["🙂", "✨"]);
  });
});
