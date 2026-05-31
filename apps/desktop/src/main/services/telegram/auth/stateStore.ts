import fs from "node:fs/promises";

import type { TelegramEvent } from "@sticker-smith/shared";

import type { SettingsService } from "../../settingsService";
import type { TelegramSecretsService } from "../secrets/service";
import {
  createDefaultState,
  getSanitizedAuthState,
  getSanitizedPersistedInputs,
  hasInlineSecret,
  hasSanitizedStateChanged,
  normalizeLegacyState,
  normalizeState,
  toPublicState,
  type LegacyState,
  type PersistedTelegramState,
  type SanitizedPersistedState,
  type StoredTelegramState,
} from "./state";
import { TELEGRAM_ACCOUNT_KEY as ACCOUNT_KEY } from "../../../config/constants";
import { nowIso } from "../../../utils/timeUtils";

export class TelegramAuthStateStore {
  constructor(
    private readonly paths: {
      telegramRoot: string;
      statePath: string;
      legacyStatePath: string;
    },
    private readonly settingsService: SettingsService,
    private readonly secretsService: TelegramSecretsService,
    private readonly emit: (event: TelegramEvent) => void,
  ) {}

  async ensureTelegramRoot() {
    await fs.mkdir(this.paths.telegramRoot, { recursive: true });
  }

  private async sanitizePersistedState(
    state: PersistedTelegramState,
  ): Promise<SanitizedPersistedState> {
    const input = getSanitizedPersistedInputs(state);
    const { inlineApiHash, inlineBotToken } = input;

    if (hasInlineSecret(inlineApiHash)) {
      await this.secretsService.setSecret(
        ACCOUNT_KEY,
        "api_hash",
        inlineApiHash,
      );
    }
    if (hasInlineSecret(inlineBotToken)) {
      await this.secretsService.setSecret(
        ACCOUNT_KEY,
        "bot_token",
        inlineBotToken,
      );
    }

    const auth = getSanitizedAuthState(state, input);
    const nextState = normalizeState({
      ...state,
      status: auth.status,
      authStep: auth.authStep,
      tdlib: { apiId: input.apiId, apiHashConfigured: auth.apiHashConfigured },
      user: { phoneNumber: input.phoneNumber },
    });

    return {
      state: nextState,
      changed: hasSanitizedStateChanged(state, nextState, input),
    };
  }

  private async migrateLegacyState() {
    try {
      const raw = await fs.readFile(this.paths.legacyStatePath, "utf8");
      const legacy = JSON.parse(raw) as LegacyState;
      const nextState = normalizeLegacyState(legacy);

      if (legacy.credentials?.apiHash) {
        await this.secretsService.setSecret(
          ACCOUNT_KEY,
          "api_hash",
          legacy.credentials.apiHash,
        );
      }
      await this.writeState(nextState);
      await fs.rm(this.paths.legacyStatePath, { force: true });
    } catch {
      // No legacy state to migrate.
    }
  }

  async readState(): Promise<StoredTelegramState> {
    await this.settingsService.ensureLibrary();
    await this.ensureTelegramRoot();

    try {
      return await this.readPersistedState();
    } catch {
      await this.migrateLegacyState();
      try {
        return await this.readPersistedState();
      } catch {
        const nextState = createDefaultState();
        await this.writeState(nextState);
        return nextState;
      }
    }
  }

  private async readPersistedState() {
    const raw = await fs.readFile(this.paths.statePath, "utf8");
    const persisted = JSON.parse(raw) as PersistedTelegramState;
    const next = await this.sanitizePersistedState(persisted);
    if (next.changed) {
      await this.writeState(next.state);
    }
    return next.state;
  }

  async writeState(state: StoredTelegramState) {
    await this.ensureTelegramRoot();
    state.updatedAt = nowIso();
    await fs.writeFile(this.paths.statePath, JSON.stringify(state, null, 2));
  }

  async updateState(
    mutate: (current: StoredTelegramState) => StoredTelegramState,
  ) {
    const current = await this.readState();
    const next = mutate(current);
    await this.writeState(next);
    this.emit({
      type: "auth_state_changed",
      state: toPublicState(next),
    });
    return next;
  }
}
