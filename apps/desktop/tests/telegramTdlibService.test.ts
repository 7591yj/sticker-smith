import { describe, expect, it } from "vitest";

import { TelegramTdlibService } from "../src/main/services/telegramTdlibService";

describe("TelegramTdlibService", () => {
  it("rejects occupied Telegram sticker set names", async () => {
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
      };
    };

    service.client = {
      invoke: async () => ({ _: "checkStickerSetNameResultNameOccupied" }),
    };

    await expect(service.checkStickerSetName("sample_pack")).rejects.toThrow(
      "A Telegram sticker set with that short name already exists.",
    );
  });

  it("rejects invalid Telegram sticker set names", async () => {
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
      };
    };

    service.client = {
      invoke: async () => ({ _: "checkStickerSetNameResultNameInvalid" }),
    };

    await expect(service.checkStickerSetName("bad")).rejects.toThrow(
      "The Telegram sticker short name is invalid.",
    );
  });
});
