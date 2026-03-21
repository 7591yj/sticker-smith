import type {
  PublishLocalPackInput,
  TelegramEvent,
  TelegramState,
  UpdateTelegramPackInput,
} from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import type { SettingsService } from "./settingsService";
import {
  TelegramAuthService,
  describeTdlibError,
} from "./telegramAuthService";
import { TelegramMirrorService } from "./telegramMirrorService";
import { TelegramPackMutationService } from "./telegramPackMutationService";
import { TelegramSecretsService } from "./telegramSecretsService";
import { TelegramSyncService } from "./telegramSyncService";
import { TelegramTdlibService } from "./telegramTdlibService";
import { nowIso } from "../utils/timeUtils";

interface TelegramServiceOptions {
  secretsService?: TelegramSecretsService;
  tdlibService?: TelegramTdlibService;
  mirrorService?: TelegramMirrorService;
}

export class TelegramService {
  private readonly listeners = new Set<(event: TelegramEvent) => void>();
  private readonly auth: TelegramAuthService;
  private readonly mirrorService: TelegramMirrorService;
  private readonly syncService: TelegramSyncService;
  private readonly packMutationService: TelegramPackMutationService;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly libraryService: LibraryService,
    options: TelegramServiceOptions = {},
  ) {
    const secretsService =
      options.secretsService ?? new TelegramSecretsService(settingsService);
    const tdlibService = options.tdlibService ?? new TelegramTdlibService();
    this.mirrorService =
      options.mirrorService ?? new TelegramMirrorService(libraryService);

    this.auth = new TelegramAuthService(settingsService, libraryService, {
      secretsService,
      tdlibService,
      emit: (event) => this.emit(event),
    });

    this.syncService = new TelegramSyncService({
      auth: this.auth,
      libraryService,
      mirrorService: this.mirrorService,
      emit: (event) => this.emit(event),
    });
    this.packMutationService = new TelegramPackMutationService({
      auth: this.auth,
      syncService: this.syncService,
      libraryService,
      mirrorService: this.mirrorService,
      emit: (event) => this.emit(event),
    });

    tdlibService.subscribe({
      onAuthStateChanged: (payload) => {
        this.auth.lastRuntimeUpdate = this.auth.handleRuntimeUpdate(payload);
      },
      onRuntimeError: (error) => {
        this.auth.lastRuntimeUpdate = this.auth.updateState((current) => ({
          ...current,
          status:
            current.tdlib.apiId && current.tdlib.apiHashConfigured
              ? "awaiting_credentials"
              : "disconnected",
          lastError: describeTdlibError(error),
          message: describeTdlibError(error),
          updatedAt: nowIso(),
        }));
      },
    });
    this.syncService.attachToTdlib(tdlibService);
  }

  private emit(event: TelegramEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: (event: TelegramEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getState(): Promise<TelegramState> {
    return this.auth.getState();
  }

  async submitTdlibParameters(input: {
    apiId: string;
    apiHash: string;
  }): Promise<TelegramState> {
    return this.auth.submitTdlibParameters(input);
  }

  async submitPhoneNumber(input: { phoneNumber: string }): Promise<TelegramState> {
    return this.auth.submitPhoneNumber(input);
  }

  async submitCode(input: { code: string }): Promise<TelegramState> {
    return this.auth.submitCode(input);
  }

  async submitPassword(input: { password: string }): Promise<TelegramState> {
    return this.auth.submitPassword(input);
  }

  async logout(): Promise<TelegramState> {
    return this.auth.logout();
  }

  async reset(): Promise<TelegramState> {
    return this.auth.reset();
  }

  async syncOwnedPacks(): Promise<void> {
    return this.syncService.syncOwnedPacks();
  }

  async downloadPackMedia(input: { packId: string; force?: boolean }) {
    return this.syncService.downloadPackMedia(input);
  }

  async publishLocalPack(input: PublishLocalPackInput) {
    return this.packMutationService.publishLocalPack(input);
  }

  async updateTelegramPack(input: UpdateTelegramPackInput) {
    return this.packMutationService.updateTelegramPack(input);
  }
}
