import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TelegramService } from "../src/main/services/telegramService";

class FakeSettingsService {
  constructor(private readonly root: string) {}

  async ensureLibrary() {
    await fs.mkdir(path.join(this.root, "packs"), { recursive: true });
  }

  getLibraryRoot() {
    return this.root;
  }
}

async function createTelegramService() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-telegram-"));
  const telegramService = new TelegramService(
    new FakeSettingsService(root) as never,
  );
  return { root, telegramService };
}

describe("TelegramService", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanup
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it("creates a default disconnected TDLib state", async () => {
    const { root, telegramService } = await createTelegramService();
    cleanup.push(root);

    const state = await telegramService.getState();

    expect(state.backend).toBe("tdlib");
    expect(state.status).toBe("disconnected");
    expect(state.selectedMode).toBeNull();
    expect(state.recommendedMode).toBe("user");
  });

  it("persists the selected auth mode and guidance message", async () => {
    const { root, telegramService } = await createTelegramService();
    cleanup.push(root);

    const selected = await telegramService.selectAuthMode({ mode: "user" });
    const reloaded = await telegramService.getState();

    expect(selected.status).toBe("awaiting_credentials");
    expect(selected.selectedMode).toBe("user");
    expect(selected.message).toContain("api_id/api_hash");
    expect(reloaded.selectedMode).toBe("user");
  });
});
