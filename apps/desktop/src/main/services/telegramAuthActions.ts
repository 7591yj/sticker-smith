import fs from "node:fs/promises";
import path from "node:path";

import type { TelegramEvent, TelegramState } from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import type { TelegramSecretsService } from "./telegramSecretsService";
import type { TelegramTdlibService } from "./telegramTdlibService";
import {
  createDefaultState,
  describeTdlibError,
  normalizeTelegramPhoneNumber,
  parseTdlibParameters,
  toPublicState,
  type StoredTelegramState,
} from "./telegramAuthState";
import { TELEGRAM_ACCOUNT_KEY as ACCOUNT_KEY } from "../config/constants";
import { nowIso } from "../utils/timeUtils";

type ReadState = () => Promise<StoredTelegramState>;
type WriteState = (state: StoredTelegramState) => Promise<void>;
type UpdateState = (
  mutate: (current: StoredTelegramState) => StoredTelegramState,
) => Promise<StoredTelegramState>;
type EnsureRuntimeStarted = () => Promise<StoredTelegramState>;

export class TelegramAuthActions {
  constructor(
    private readonly telegramRoot: string,
    private readonly libraryService: LibraryService,
    private readonly secretsService: TelegramSecretsService,
    private readonly tdlibService: TelegramTdlibService,
    private readonly emit: (event: TelegramEvent) => void,
    private readonly getLastRuntimeUpdate: () => Promise<unknown>,
    private readonly readState: ReadState,
    private readonly writeState: WriteState,
    private readonly updateState: UpdateState,
    private readonly ensureRuntimeStarted: EnsureRuntimeStarted,
  ) {}

  async submitTdlibParameters(input: {
    apiId: string;
    apiHash: string;
  }): Promise<TelegramState> {
    const normalized = parseTdlibParameters(input);
    await this.secretsService.setSecret(
      ACCOUNT_KEY,
      "api_hash",
      normalized.apiHash,
    );
    const next = await this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: current.user.phoneNumber ? "wait_code" : "wait_phone_number",
      tdlib: { apiId: normalized.apiId, apiHashConfigured: true },
      message: current.user.phoneNumber
        ? "TDLib credentials saved. If Telegram prompts for a code, enter it to finish login."
        : "TDLib credentials saved. Enter the phone number for your Telegram account.",
      lastError: null,
      updatedAt: nowIso(),
    }));
    await this.ensureRuntimeStarted();
    return toPublicState(next);
  }

  async submitPhoneNumber(input: {
    phoneNumber: string;
  }): Promise<TelegramState> {
    const phoneNumber = normalizeTelegramPhoneNumber(input.phoneNumber);
    await this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: "wait_phone_number",
      user: { phoneNumber },
      message: "Submitting your phone number to Telegram.",
      lastError: null,
      updatedAt: nowIso(),
    }));

    try {
      await this.ensureRuntimeStarted();
      await this.getLastRuntimeUpdate();
      const state = await this.readState();
      if (state.authStep === "wait_phone_number") {
        await this.tdlibService.submitPhoneNumber(phoneNumber);
        await this.getLastRuntimeUpdate();
      }
    } catch (error) {
      await this.failAuthStep("wait_phone_number", error);
    }

    return toPublicState(await this.readState());
  }

  async submitCode(input: { code: string }): Promise<TelegramState> {
    try {
      await this.ensureRuntimeStarted();
      await this.tdlibService.submitCode(input.code.trim());
      await this.getLastRuntimeUpdate();
    } catch (error) {
      await this.failAuthStep("wait_code", error);
    }
    return toPublicState(await this.readState());
  }

  async submitPassword(input: { password: string }): Promise<TelegramState> {
    try {
      await this.ensureRuntimeStarted();
      await this.tdlibService.submitPassword(input.password);
      await this.getLastRuntimeUpdate();
    } catch (error) {
      await this.failAuthStep("wait_password", error);
    }
    return toPublicState(await this.readState());
  }

  async logout(): Promise<TelegramState> {
    try {
      await this.tdlibService.logout();
    } catch {
      // Best-effort logout before local reset.
    }

    await this.tdlibService.close();
    await this.secretsService.clearAccount(ACCOUNT_KEY);
    await fs.rm(path.join(this.telegramRoot, "tdlib", ACCOUNT_KEY), {
      recursive: true,
      force: true,
    });
    const telegramPacks = (await this.libraryService.listPacks()).filter(
      (pack) => pack.source === "telegram",
    );
    await Promise.all(
      telegramPacks.map((pack) =>
        this.libraryService.deletePack({ packId: pack.id }),
      ),
    );
    const next = createDefaultState();
    await this.writeState(next);
    this.emit({ type: "auth_state_changed", state: toPublicState(next) });
    return toPublicState(next);
  }

  private async failAuthStep(
    authStep: StoredTelegramState["authStep"],
    error: unknown,
  ) {
    const message = describeTdlibError(error);
    return this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep,
      lastError: message,
      message,
      updatedAt: nowIso(),
    }));
  }
}
