import { describe, expect, it } from "vitest";

import {
  describeTdlibError,
  normalizeTelegramAuthStep,
  normalizeTelegramPhoneNumber,
  normalizeTelegramStatus,
  parseTdlibParameters,
} from "../src/main/services/telegramAuthService";

const VALID_API_HASH = "0123456789abcdef0123456789abcdef";

describe("telegram auth helpers", () => {
  it("parses tdlib parameters after trimming quotes and invisible characters", () => {
    expect(
      parseTdlibParameters({
        apiId: " 12 345\u200b ",
        apiHash: " '0123456789abcdef0123456789abcdef' ",
      }),
    ).toEqual({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
  });

  it("rejects invalid tdlib credentials", () => {
    expect(() =>
      parseTdlibParameters({
        apiId: "12x45",
        apiHash: VALID_API_HASH,
      }),
    ).toThrow("Telegram api_id should contain only digits.");

    expect(() =>
      parseTdlibParameters({
        apiId: "12345",
        apiHash: "invalid",
      }),
    ).toThrow(
      "Telegram api_hash should be the 32-character hash from my.telegram.org.",
    );
  });

  it("normalizes phone numbers and derives auth state from partial credentials", () => {
    expect(normalizeTelegramPhoneNumber(" 00 82 (10) 1234-5678 ")).toBe(
      "+821012345678",
    );

    expect(
      normalizeTelegramStatus("unknown", {
        apiId: null,
        apiHashConfigured: false,
      }),
    ).toBe("disconnected");
    expect(
      normalizeTelegramStatus("unknown", {
        apiId: "12345",
        apiHashConfigured: true,
      }),
    ).toBe("awaiting_credentials");
    expect(
      normalizeTelegramStatus("connected", {
        apiId: null,
        apiHashConfigured: false,
      }),
    ).toBe("connected");

    expect(
      normalizeTelegramAuthStep("unknown", {
        apiId: null,
        apiHashConfigured: false,
        phoneNumber: null,
        status: "disconnected",
      }),
    ).toBe("wait_tdlib_parameters");
    expect(
      normalizeTelegramAuthStep("unknown", {
        apiId: "12345",
        apiHashConfigured: true,
        phoneNumber: null,
        status: "awaiting_credentials",
      }),
    ).toBe("wait_phone_number");
    expect(
      normalizeTelegramAuthStep("unknown", {
        apiId: "12345",
        apiHashConfigured: true,
        phoneNumber: "+12025550123",
        status: "awaiting_credentials",
      }),
    ).toBe("wait_code");
    expect(
      normalizeTelegramAuthStep("unknown", {
        apiId: "12345",
        apiHashConfigured: true,
        phoneNumber: "+12025550123",
        status: "connected",
      }),
    ).toBe("ready");
  });

  it("maps known tdlib errors to user-facing messages", () => {
    expect(describeTdlibError(new Error("PHONE_CODE_INVALID"))).toBe(
      "The Telegram login code is invalid.",
    );
    expect(describeTdlibError(new Error("PASSWORD_HASH_INVALID"))).toBe(
      "The Telegram password is invalid.",
    );
    expect(describeTdlibError(new Error("FLOOD_WAIT_123"))).toBe(
      "FLOOD_WAIT_123",
    );
    expect(describeTdlibError(new Error("STICKERSET_INVALID"))).toBe(
      "The selected Telegram sticker set is no longer owned by the current account.",
    );
    expect(describeTdlibError(new Error("Something else"))).toBe(
      "Something else",
    );
  });
});
