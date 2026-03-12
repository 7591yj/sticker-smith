import fs from "node:fs/promises";
import path from "node:path";

import type {
  TelegramAuthMode,
  TelegramState,
} from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";

function createDefaultState(): TelegramState {
  return {
    backend: "tdlib",
    status: "disconnected",
    selectedMode: null,
    recommendedMode: "user",
    message:
      "User login is recommended because Telegram sticker ownership and remote pack discovery require a user session. Bot mode can only manage sticker sets tied to that bot token.",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(
  state: Partial<TelegramState> | null | undefined,
): TelegramState {
  const defaults = createDefaultState();

  return {
    backend: "tdlib",
    status: state?.status ?? defaults.status,
    selectedMode: state?.selectedMode ?? defaults.selectedMode,
    recommendedMode: "user",
    message: state?.message ?? defaults.message,
    updatedAt: state?.updatedAt ?? defaults.updatedAt,
  };
}

function messageForMode(mode: TelegramAuthMode) {
  if (mode === "user") {
    return "TDLib user login needs Telegram api_id/api_hash plus phone verification. This is the path required to enumerate sticker packs created from your account.";
  }

  return "Bot mode needs a bot token. It can update sticker sets for that bot, but it cannot enumerate sticker packs created by your personal Telegram user account.";
}

export class TelegramService {
  private readonly statePath: string;

  constructor(private readonly settingsService: SettingsService) {
    this.statePath = path.join(
      this.settingsService.getLibraryRoot(),
      "telegram.json",
    );
  }

  private async writeState(state: TelegramState) {
    await fs.mkdir(this.settingsService.getLibraryRoot(), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  async getState(): Promise<TelegramState> {
    await this.settingsService.ensureLibrary();

    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      return normalizeState(JSON.parse(raw) as Partial<TelegramState>);
    } catch {
      const state = createDefaultState();
      await this.writeState(state);
      return state;
    }
  }

  async selectAuthMode(input: { mode: TelegramAuthMode }): Promise<TelegramState> {
    const state = normalizeState(await this.getState());
    const nextState: TelegramState = {
      ...state,
      status: "awaiting_credentials",
      selectedMode: input.mode,
      message: messageForMode(input.mode),
      updatedAt: new Date().toISOString(),
    };

    await this.writeState(nextState);
    return nextState;
  }

  async disconnect(): Promise<TelegramState> {
    const nextState = createDefaultState();
    await this.writeState(nextState);
    return nextState;
  }
}
