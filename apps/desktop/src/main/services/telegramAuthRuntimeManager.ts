import fs from "node:fs/promises";
import path from "node:path";

import type { TelegramSecretsService } from "./telegramSecretsService";
import type { TelegramTdlibService } from "./telegramTdlibService";
import {
  createTdlibDatabaseEncryptionKey,
  getRuntimeStatePatch,
  INVALID_TDLIB_CREDENTIALS_MESSAGE,
  isTdlibBytesString,
  normalizeTdlibCredential,
  parseTdlibParameters,
  shouldSyncRuntimeState,
  type StoredTelegramState,
  type TdlibCredentialResult,
} from "./telegramAuthState";
import { TELEGRAM_ACCOUNT_KEY as ACCOUNT_KEY } from "../config/constants";
import { nowIso } from "../utils/timeUtils";

type UpdateState = (
  mutate: (current: StoredTelegramState) => StoredTelegramState,
) => Promise<StoredTelegramState>;

export class TelegramAuthRuntimeManager {
  constructor(
    private readonly telegramRoot: string,
    private readonly secretsService: TelegramSecretsService,
    private readonly tdlibService: TelegramTdlibService,
    private readonly readState: () => Promise<StoredTelegramState>,
    private readonly updateState: UpdateState,
  ) {}

  private async markApiHashUnavailable(message: string) {
    return this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: "wait_tdlib_parameters",
      tdlib: { ...current.tdlib, apiHashConfigured: false },
      message,
      lastError: message,
      updatedAt: nowIso(),
    }));
  }

  private async markInvalidTdlibCredentials() {
    await this.secretsService.deleteSecret(ACCOUNT_KEY, "api_hash");
    return this.updateState((current) => {
      const normalizedApiId = normalizeTdlibCredential(
        current.tdlib.apiId ?? "",
      );
      return {
        ...current,
        status: "awaiting_credentials",
        authStep: "wait_tdlib_parameters",
        tdlib: {
          apiId: /^\d+$/.test(normalizedApiId) ? normalizedApiId : null,
          apiHashConfigured: false,
        },
        message: INVALID_TDLIB_CREDENTIALS_MESSAGE,
        lastError: INVALID_TDLIB_CREDENTIALS_MESSAGE,
        updatedAt: nowIso(),
      };
    });
  }

  private async readTdlibCredentials(
    state: StoredTelegramState,
  ): Promise<TdlibCredentialResult> {
    let apiHash: string | null;
    try {
      apiHash = await this.secretsService.getSecret(ACCOUNT_KEY, "api_hash");
    } catch (error) {
      const message =
        (error as Error)?.message ?? INVALID_TDLIB_CREDENTIALS_MESSAGE;
      return { state: await this.markApiHashUnavailable(message) };
    }

    if (!apiHash) {
      const message =
        "Telegram api_hash is missing. Enter your TDLib credentials again.";
      return { state: await this.markApiHashUnavailable(message) };
    }

    try {
      const normalized = parseTdlibParameters({
        apiId: state.tdlib.apiId ?? "",
        apiHash,
      });
      return { credentials: { ...normalized, originalApiHash: apiHash } };
    } catch {
      return { state: await this.markInvalidTdlibCredentials() };
    }
  }

  private async persistNormalizedTdlibCredentials(input: {
    state: StoredTelegramState;
    apiId: string;
    apiHash: string;
    originalApiHash: string;
  }) {
    if (
      input.apiId === input.state.tdlib.apiId &&
      input.apiHash === input.originalApiHash
    ) {
      return;
    }

    await this.secretsService.setSecret(ACCOUNT_KEY, "api_hash", input.apiHash);
    await this.updateState((current) => ({
      ...current,
      tdlib: { ...current.tdlib, apiId: input.apiId },
      updatedAt: nowIso(),
    }));
  }

  private async ensureDatabaseEncryptionKey(accountRoot: string) {
    let databaseEncryptionKey = await this.secretsService.getSecret(
      ACCOUNT_KEY,
      "database_encryption_key",
    );
    if (!databaseEncryptionKey || !isTdlibBytesString(databaseEncryptionKey)) {
      await fs.rm(accountRoot, { recursive: true, force: true });
      databaseEncryptionKey = createTdlibDatabaseEncryptionKey();
      await this.secretsService.setSecret(
        ACCOUNT_KEY,
        "database_encryption_key",
        databaseEncryptionKey,
      );
    }
    return databaseEncryptionKey;
  }

  private async markTdlibStartupParameterError(message: string) {
    await this.secretsService.deleteSecret(ACCOUNT_KEY, "api_hash");
    const detailedMessage = [
      "Telegram rejected the saved TDLib parameters.",
      "TDLib reported:",
      message,
    ].join(" ");
    return this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: "wait_tdlib_parameters",
      tdlib: { apiId: null, apiHashConfigured: false },
      user: { phoneNumber: null },
      sessionUser: null,
      message: detailedMessage,
      lastError: detailedMessage,
      updatedAt: nowIso(),
    }));
  }

  private async startTdlibRuntime(input: {
    accountRoot: string;
    apiId: string;
    apiHash: string;
    phoneNumber: string | null;
    databaseEncryptionKey: string;
  }) {
    try {
      await this.tdlibService.ensureStarted({
        apiId: Number(input.apiId),
        apiHash: input.apiHash,
        phoneNumber: input.phoneNumber,
        databaseDirectory: path.join(input.accountRoot, "db"),
        filesDirectory: path.join(input.accountRoot, "files"),
        databaseEncryptionKey: input.databaseEncryptionKey,
      });
      return null;
    } catch (error) {
      const message = (error as Error)?.message ?? "Telegram startup failed.";
      if (
        /Failed to parse JSON object as TDLib request|Wrong character in the string/i.test(
          message,
        )
      ) {
        return this.markTdlibStartupParameterError(message);
      }
      throw error;
    }
  }

  private async syncStateFromRuntime(state: StoredTelegramState) {
    const runtimeState = this.tdlibService.getCurrentAuthState();
    const patch = getRuntimeStatePatch(runtimeState);

    if (!shouldSyncRuntimeState(state, patch)) return state;
    return this.updateState((current) => ({
      ...current,
      ...patch,
      lastError: patch.authStep === "ready" ? null : current.lastError,
      updatedAt: nowIso(),
    }));
  }

  async ensureRuntimeStarted() {
    const state = await this.readState();
    if (!state.tdlib.apiId || !state.tdlib.apiHashConfigured) return state;

    const credentialResult = await this.readTdlibCredentials(state);
    if (credentialResult.state) return credentialResult.state;

    const { apiId, apiHash, originalApiHash } = credentialResult.credentials;
    await this.persistNormalizedTdlibCredentials({
      state,
      apiId,
      apiHash,
      originalApiHash,
    });

    const accountRoot = path.join(this.telegramRoot, "tdlib", ACCOUNT_KEY);
    const databaseEncryptionKey =
      await this.ensureDatabaseEncryptionKey(accountRoot);
    const startupErrorState = await this.startTdlibRuntime({
      accountRoot,
      apiId,
      apiHash,
      phoneNumber: state.user.phoneNumber,
      databaseEncryptionKey,
    });
    return startupErrorState ?? this.syncStateFromRuntime(state);
  }
}
