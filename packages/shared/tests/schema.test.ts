import { describe, expect, it } from "vitest";

import { createPackSchema, conversionJobRequestSchema } from "../src/schema";

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
});
