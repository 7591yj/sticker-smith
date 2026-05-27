import path from "node:path";

import type { TelegramEvent, TelegramState } from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import type { SettingsService } from "./settingsService";
import { TelegramSecretsService } from "./telegramSecretsService";
import { TelegramTdlibService } from "./telegramTdlibService";
import { toPublicState, type StoredTelegramState } from "./telegramAuthState";
import { TelegramAuthActions } from "./telegramAuthActions";
import { TelegramAuthRuntimeManager } from "./telegramAuthRuntimeManager";
import { TelegramAuthStateStore } from "./telegramAuthStateStore";
import { TELEGRAM_ACCOUNT_KEY as ACCOUNT_KEY } from "../config/constants";
import { nowIso } from "../utils/timeUtils";

export {
  createDefaultState,
  describeTdlibError,
  describeUnsupportedStickerSet,
  extractInlineApiId,
  extractInlinePhoneNumber,
  extractInlineSecret,
  INVALID_TDLIB_CREDENTIALS_MESSAGE,
  normalizeState,
  normalizeTdlibCredential,
  normalizeTelegramAuthStep,
  normalizeTelegramPhoneNumber,
  normalizeTelegramStatus,
  parseTdlibParameters,
  toPublicState,
  type LegacyTelegramCredentialsState,
  type PersistedTelegramState,
  type StoredTelegramState,
} from "./telegramAuthState";

export class TelegramAuthService {
  readonly telegramRoot: string;
  readonly statePath: string;
  private readonly legacyStatePath: string;
  readonly secretsService: TelegramSecretsService;
  readonly tdlibService: TelegramTdlibService;
  private readonly stateStore: TelegramAuthStateStore;
  private readonly runtimeManager: TelegramAuthRuntimeManager;
  private readonly actions: TelegramAuthActions;
  lastRuntimeUpdate: Promise<unknown> = Promise.resolve();
  private emit: (event: TelegramEvent) => void;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly libraryService: LibraryService,
    services: {
      secretsService: TelegramSecretsService;
      tdlibService: TelegramTdlibService;
      emit: (event: TelegramEvent) => void;
    },
  ) {
    this.telegramRoot = path.join(
      this.settingsService.getLibraryRoot(),
      "telegram",
    );
    this.statePath = path.join(this.telegramRoot, "state.json");
    this.legacyStatePath = path.join(
      this.settingsService.getLibraryRoot(),
      "telegram.json",
    );
    this.secretsService = services.secretsService;
    this.tdlibService = services.tdlibService;
    this.emit = services.emit;
    this.stateStore = new TelegramAuthStateStore(
      {
        telegramRoot: this.telegramRoot,
        statePath: this.statePath,
        legacyStatePath: this.legacyStatePath,
      },
      this.settingsService,
      this.secretsService,
      this.emit,
    );
    this.runtimeManager = new TelegramAuthRuntimeManager(
      this.telegramRoot,
      this.secretsService,
      this.tdlibService,
      () => this.readState(),
      (mutate) => this.updateState(mutate),
    );
    this.actions = new TelegramAuthActions(
      this.telegramRoot,
      this.libraryService,
      this.secretsService,
      this.tdlibService,
      this.emit,
      () => this.lastRuntimeUpdate,
      () => this.readState(),
      (state) => this.writeState(state),
      (mutate) => this.updateState(mutate),
      () => this.ensureRuntimeStarted(),
    );
  }

  async ensureTelegramRoot() {
    return this.stateStore.ensureTelegramRoot();
  }

  async readState(): Promise<StoredTelegramState> {
    return this.stateStore.readState();
  }

  async writeState(state: StoredTelegramState) {
    return this.stateStore.writeState(state);
  }

  async updateState(
    mutate: (current: StoredTelegramState) => StoredTelegramState,
  ) {
    return this.stateStore.updateState(mutate);
  }

  async handleRuntimeUpdate(payload: {
    authStep:
      | "wait_tdlib_parameters"
      | "wait_phone_number"
      | "wait_code"
      | "wait_password"
      | "ready"
      | "logged_out";
    message: string;
    sessionUser?: TelegramState["sessionUser"];
    lastError?: string | null;
  }) {
    const next = await this.updateState((current) => ({
      ...current,
      status:
        payload.authStep === "ready"
          ? "connected"
          : current.tdlib.apiId && current.tdlib.apiHashConfigured
            ? "awaiting_credentials"
            : "disconnected",
      authStep: payload.authStep,
      message: payload.message,
      sessionUser:
        payload.authStep === "ready" ? (payload.sessionUser ?? null) : null,
      lastError: payload.lastError ?? null,
      updatedAt: nowIso(),
    }));

    return toPublicState(next);
  }

  async ensureRuntimeStarted() {
    return this.runtimeManager.ensureRuntimeStarted();
  }

  async requireConnectedState() {
    await this.ensureRuntimeStarted();
    const fresh = await this.readState();
    const runtimeState = this.tdlibService.getCurrentAuthState();
    if (
      !this.tdlibService.isStarted() ||
      fresh.status !== "connected" ||
      fresh.authStep !== "ready" ||
      runtimeState.authStep !== "ready"
    ) {
      throw new Error("Telegram is not connected.");
    }
    return fresh;
  }

  async getState(): Promise<TelegramState> {
    const state = await this.readState();
    if (state.tdlib.apiId && state.tdlib.apiHashConfigured) {
      await this.ensureRuntimeStarted();
      return toPublicState(await this.readState());
    }
    return toPublicState(state);
  }

  async submitTdlibParameters(input: {
    apiId: string;
    apiHash: string;
  }): Promise<TelegramState> {
    return this.actions.submitTdlibParameters(input);
  }

  async submitPhoneNumber(input: {
    phoneNumber: string;
  }): Promise<TelegramState> {
    return this.actions.submitPhoneNumber(input);
  }

  async submitCode(input: { code: string }): Promise<TelegramState> {
    return this.actions.submitCode(input);
  }

  async submitPassword(input: { password: string }): Promise<TelegramState> {
    return this.actions.submitPassword(input);
  }

  async logout(): Promise<TelegramState> {
    return this.actions.logout();
  }

  async reset(): Promise<TelegramState> {
    return this.logout();
  }
}
