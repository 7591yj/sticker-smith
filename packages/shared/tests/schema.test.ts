import { describe, expect, it } from "vitest";

import {
  convertSchema,
  createPackSchema,
  conversionJobEventSchema,
  conversionJobRequestSchema,
  importConversionTaskSchema,
  reorderStickerSchema,
  setPackTelegramShortNameSchema,
  setTelegramPhoneNumberSchema,
  setTelegramTdlibParametersSchema,
  setStickerEmojisSchema,
  submitTelegramCodeSchema,
  submitTelegramPasswordSchema,
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
        tasks: [
          {
            stickerId: "a",
            sourcePath: "/tmp/a.png",
            mode: "icon",
            outputPath: "/tmp/out/icon.webm",
          },
        ],
      }).tasks,
    ).toHaveLength(1);

    expect(() =>
      conversionJobRequestSchema.parse({
        jobId: "job",
        outputRoot: "/tmp/out",
        tasks: [
          {
            stickerId: "a",
            sourcePath: "/tmp/a.png",
            mode: "icon",
            outputPath: "/tmp/out/icon.gif",
          },
        ],
      }),
    ).toThrow();
  });

  it("validates sticker-first import conversion tasks", () => {
    expect(
      importConversionTaskSchema.parse({
        sourcePath: "/tmp/cat.mov",
        originalFileName: "cat.mov",
        outputPath: "/tmp/pack/webm/sticker.webm",
      }).originalFileName,
    ).toBe("cat.mov");

    expect(() =>
      importConversionTaskSchema.parse({
        sourcePath: "/tmp/cat.mov",
        originalFileName: "cat.mov",
        outputPath: "/tmp/pack/webm/sticker.mp4",
      }),
    ).toThrow();
  });

  it("rejects empty conversion inputs", () => {
    expect(() =>
      convertSchema.parse({ packId: "pack-1", stickerIds: [] }),
    ).toThrow();
  });

  it("validates conversion job events", () => {
    expect(
      conversionJobEventSchema.parse({
        type: "sticker_completed",
        jobId: "job",
        stickerId: "asset-1",
        mode: "sticker",
        outputPath: "/tmp/out/asset-1.webm",
        sizeBytes: 128,
      }).type,
    ).toBe("sticker_completed");

    expect(() =>
      conversionJobEventSchema.parse({ type: "sticker_started", jobId: "job" }),
    ).toThrow();
  });

  it("validates telegram-compliant emoji lists", () => {
    expect(
      setStickerEmojisSchema.parse({
        packId: "pack-1",
        stickerId: "asset-1",
        emojis: ["🙂", "✨"],
      }).emojis,
    ).toEqual(["🙂", "✨"]);
  });

  it("rejects non-emoji telegram sticker keywords", () => {
    expect(() =>
      setStickerEmojisSchema.parse({
        packId: "pack-1",
        stickerId: "asset-1",
        emojis: ["smile"],
      }),
    ).toThrow("Expected a Telegram-compatible emoji.");
  });

  it("accepts telegram emoji sequences such as keycaps and flags", () => {
    expect(
      setStickerEmojisSchema.parse({
        packId: "pack-1",
        stickerId: "asset-1",
        emojis: ["1️⃣", "🇺🇸"],
      }).emojis,
    ).toEqual(["1️⃣", "🇺🇸"]);
  });

  it("rejects emoji strings that are not a single Unicode RGI emoji", () => {
    expect(() =>
      setStickerEmojisSchema.parse({
        packId: "pack-1",
        stickerId: "asset-1",
        emojis: ["😀😀"],
      }),
    ).toThrow("Expected a Telegram-compatible emoji.");
  });

  it("allows clearing local emoji edits to an empty list", () => {
    expect(
      setStickerEmojisSchema.parse({
        packId: "pack-1",
        stickerId: "asset-1",
        emojis: [],
      }).emojis,
    ).toEqual([]);
  });

  it("validates telegram tdlib setup inputs", () => {
    expect(
      setTelegramTdlibParametersSchema.parse({
        apiId: "12345",
        apiHash: "hash",
      }).apiId,
    ).toBe("12345");
    expect(
      setTelegramPhoneNumberSchema.parse({
        phoneNumber: "+12025550123",
      }).phoneNumber,
    ).toBe("+12025550123");
    expect(
      submitTelegramCodeSchema.parse({
        code: "12345",
      }).code,
    ).toBe("12345");
    expect(
      submitTelegramPasswordSchema.parse({
        password: "correct horse battery staple",
      }).password,
    ).toBe("correct horse battery staple");
  });

  it("validates optional local pack telegram short names", () => {
    expect(
      setPackTelegramShortNameSchema.parse({
        packId: "pack-1",
        shortName: "sample_pack",
      }).shortName,
    ).toBe("sample_pack");
    expect(
      setPackTelegramShortNameSchema.parse({
        packId: "pack-1",
        shortName: null,
      }).shortName,
    ).toBeNull();
  });

  it("validates sticker reorder inputs", () => {
    expect(
      reorderStickerSchema.parse({
        packId: "pack-1",
        stickerId: "sticker-1",
        beforeStickerId: null,
      }).beforeStickerId,
    ).toBeNull();
  });

});
