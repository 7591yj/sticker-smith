import { describe, expect, it } from "vitest";

import {
  createPackSchema,
  conversionJobRequestSchema,
  reorderAssetSchema,
  setPackTelegramShortNameSchema,
  setTelegramPhoneNumberSchema,
  setTelegramTdlibParametersSchema,
  setAssetEmojisSchema,
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

  it("rejects non-emoji telegram sticker keywords", () => {
    expect(() =>
      setAssetEmojisSchema.parse({
        packId: "pack-1",
        assetId: "asset-1",
        emojis: ["smile"],
      }),
    ).toThrow("Expected a Telegram-compatible emoji.");
  });

  it("accepts telegram emoji sequences such as keycaps and flags", () => {
    expect(
      setAssetEmojisSchema.parse({
        packId: "pack-1",
        assetId: "asset-1",
        emojis: ["1️⃣", "🇺🇸"],
      }).emojis,
    ).toEqual(["1️⃣", "🇺🇸"]);
  });

  it("rejects emoji strings that are not a single Unicode RGI emoji", () => {
    expect(() =>
      setAssetEmojisSchema.parse({
        packId: "pack-1",
        assetId: "asset-1",
        emojis: ["😀😀"],
      }),
    ).toThrow("Expected a Telegram-compatible emoji.");
  });

  it("allows clearing local emoji edits to an empty list", () => {
    expect(
      setAssetEmojisSchema.parse({
        packId: "pack-1",
        assetId: "asset-1",
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

  it("validates asset reorder inputs", () => {
    expect(
      reorderAssetSchema.parse({
        packId: "pack-1",
        assetId: "asset-1",
        beforeAssetId: null,
      }).beforeAssetId,
    ).toBeNull();
  });
});
