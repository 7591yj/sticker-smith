import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  TelegramEvent,
  TelegramState,
} from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import type { SettingsService } from "./settingsService";
import { TelegramSecretsService } from "./telegramSecretsService";
import {
  TelegramTdlibService,
} from "./telegramTdlibService";
import { nowIso } from "../utils/timeUtils";
import { describeTelegramAuthStep } from "../utils/telegramUtils";
import { TELEGRAM_ACCOUNT_KEY as ACCOUNT_KEY } from "../config/constants";

export interface StoredTelegramState {
  schemaVersion: 1;
  backend: "tdlib";
  status: TelegramState["status"];
  authStep: TelegramState["authStep"];
  selectedMode: TelegramState["selectedMode"];
  recommendedMode: TelegramState["recommendedMode"];
  message: string;
  tdlib: TelegramState["tdlib"];
  user: TelegramState["user"];
  sessionUser: TelegramState["sessionUser"];
  lastError: string | null;
  updatedAt: string;
}

export interface LegacyTelegramCredentialsState {
  apiId?: string | null;
  apiHash?: string | null;
  phoneNumber?: string | null;
  botToken?: string | null;
}

export interface PersistedTelegramState
  extends Omit<
    Partial<StoredTelegramState>,
    "tdlib" | "user" | "sessionUser" | "lastError"
  > {
  credentials?: LegacyTelegramCredentialsState;
  tdlib?: Partial<StoredTelegramState["tdlib"]> & {
    apiHash?: string | null;
  };
  user?: Partial<StoredTelegramState["user"]>;
  sessionUser?: StoredTelegramState["sessionUser"];
  lastError?: string | null;
}

export function createDefaultState(): StoredTelegramState {
  return {
    schemaVersion: 1,
    backend: "tdlib",
    status: "disconnected",
    authStep: "wait_tdlib_parameters",
    selectedMode: "user",
    recommendedMode: "user",
    message:
      "Enter your Telegram api_id and api_hash to start a user session and sync owned sticker packs.",
    tdlib: {
      apiId: null,
      apiHashConfigured: false,
    },
    user: {
      phoneNumber: null,
    },
    sessionUser: null,
    lastError: null,
    updatedAt: nowIso(),
  };
}

function withDefault<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

function normalizeTdlibState(
  state: Partial<StoredTelegramState> | null | undefined,
  defaults: StoredTelegramState,
): StoredTelegramState["tdlib"] {
  return {
    apiId: withDefault(state?.tdlib?.apiId, defaults.tdlib.apiId),
    apiHashConfigured: withDefault(
      state?.tdlib?.apiHashConfigured,
      defaults.tdlib.apiHashConfigured,
    ),
  };
}

function normalizeUserState(
  state: Partial<StoredTelegramState> | null | undefined,
  defaults: StoredTelegramState,
): StoredTelegramState["user"] {
  return {
    phoneNumber: withDefault(state?.user?.phoneNumber, defaults.user.phoneNumber),
  };
}

export function normalizeState(
  state: Partial<StoredTelegramState> | null | undefined,
): StoredTelegramState {
  const defaults = createDefaultState();

  return {
    schemaVersion: 1,
    backend: "tdlib",
    status: withDefault(state?.status, defaults.status),
    authStep: withDefault(state?.authStep, defaults.authStep),
    selectedMode: "user",
    recommendedMode: "user",
    message: withDefault(state?.message, defaults.message),
    tdlib: normalizeTdlibState(state, defaults),
    user: normalizeUserState(state, defaults),
    sessionUser: withDefault(state?.sessionUser, defaults.sessionUser),
    lastError: withDefault(state?.lastError, defaults.lastError),
    updatedAt: withDefault(state?.updatedAt, defaults.updatedAt),
  };
}

export function normalizeTelegramStatus(
  status: unknown,
  options: {
    apiId: string | null;
    apiHashConfigured: boolean;
  },
): StoredTelegramState["status"] {
  if (
    status === "disconnected" ||
    status === "awaiting_credentials" ||
    status === "connected"
  ) {
    return status;
  }

  if (!options.apiId || !options.apiHashConfigured) {
    return "disconnected";
  }

  return "awaiting_credentials";
}

export function normalizeTelegramAuthStep(
  authStep: unknown,
  options: {
    apiId: string | null;
    apiHashConfigured: boolean;
    phoneNumber: string | null;
    status: StoredTelegramState["status"];
  },
): StoredTelegramState["authStep"] {
  if (
    authStep === "wait_tdlib_parameters" ||
    authStep === "wait_phone_number" ||
    authStep === "wait_code" ||
    authStep === "wait_password" ||
    authStep === "ready" ||
    authStep === "logged_out"
  ) {
    return authStep;
  }

  if (options.status === "connected") {
    return "ready";
  }

  if (!options.apiId || !options.apiHashConfigured) {
    return "wait_tdlib_parameters";
  }

  if (!options.phoneNumber) {
    return "wait_phone_number";
  }

  return "wait_code";
}

export function extractInlineApiId(state: PersistedTelegramState) {
  return state.tdlib?.apiId ?? state.credentials?.apiId ?? null;
}

export function extractInlinePhoneNumber(state: PersistedTelegramState) {
  return state.user?.phoneNumber ?? state.credentials?.phoneNumber ?? null;
}

export function extractInlineSecret(
  state: PersistedTelegramState,
  key: "apiHash" | "botToken",
) {
  if (key === "apiHash") {
    return state.tdlib?.apiHash ?? state.credentials?.apiHash ?? null;
  }

  return state.credentials?.botToken ?? null;
}

export function toPublicState(state: StoredTelegramState): TelegramState {
  return {
    backend: "tdlib",
    status: state.status,
    authStep: state.authStep,
    selectedMode: state.selectedMode,
    recommendedMode: state.recommendedMode,
    message: state.message,
    tdlib: state.tdlib,
    user: state.user,
    sessionUser: state.sessionUser,
    lastError: state.lastError,
    updatedAt: state.updatedAt,
  };
}

export function describeTdlibError(error: unknown) {
  const message = (error as Error)?.message ?? "Telegram request failed.";

  if (/PHONE_CODE_INVALID/i.test(message)) {
    return "The Telegram login code is invalid.";
  }

  if (/PASSWORD_HASH_INVALID/i.test(message)) {
    return "The Telegram password is invalid.";
  }

  if (/FLOOD_WAIT/i.test(message)) {
    return message;
  }

  if (/STICKERSET_INVALID|STICKERSET_OWNER_ANONYMOUS/i.test(message)) {
    return "The selected Telegram sticker set is no longer owned by the current account.";
  }

  return message;
}

export function describeUnsupportedStickerSet(
  stickerSet: Pick<{ title: string; format: string }, "title" | "format">,
) {
  return `Telegram pack "${stickerSet.title}" uses ${stickerSet.format} stickers, and only video sticker packs are supported currently.`;
}

export function normalizeTdlibCredential(value: string) {
  return value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[\s\u200B\u200C\u200D\u2060\uFEFF]+/gu, "");
}

export function parseTdlibParameters(input: { apiId: string; apiHash: string }) {
  const apiId = normalizeTdlibCredential(input.apiId);
  const apiHash = normalizeTdlibCredential(input.apiHash);

  if (!/^\d+$/.test(apiId)) {
    throw new Error("Telegram api_id should contain only digits.");
  }

  if (!/^[0-9a-f]{32}$/i.test(apiHash)) {
    throw new Error(
      "Telegram api_hash should be the 32-character hash from my.telegram.org.",
    );
  }

  return { apiId, apiHash };
}

export function normalizeTelegramPhoneNumber(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/[\s\u00A0\u200B\u200C\u200D\u2060\uFEFF()-]+/gu, "");

  if (normalized.startsWith("00")) {
    return `+${normalized.slice(2)}`;
  }

  return normalized;
}

export const INVALID_TDLIB_CREDENTIALS_MESSAGE =
  "Stored Telegram TDLib credentials are invalid. Enter your api_id and api_hash from my.telegram.org again.";

function isTdlibBytesString(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    return false;
  }

  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}

function createTdlibDatabaseEncryptionKey() {
  return randomBytes(32).toString("base64");
}

type TdlibCredentials = {
  apiId: string;
  apiHash: string;
  originalApiHash: string;
};

type TdlibCredentialResult =
  | { credentials: TdlibCredentials; state?: never }
  | { credentials?: never; state: StoredTelegramState };

type SanitizedPersistedState = {
  state: StoredTelegramState;
  changed: boolean;
};

type SanitizedPersistedInputs = {
  apiId: string | null;
  phoneNumber: string | null;
  inlineApiHash: string | null;
  inlineBotToken: string | null;
};

type LegacyState = {
  credentials?: {
    apiId?: string | null;
    apiHash?: string | null;
    phoneNumber?: string | null;
  };
} & Partial<StoredTelegramState>;

type RuntimeAuthState = ReturnType<TelegramTdlibService["getCurrentAuthState"]>;

function getSanitizedPersistedInputs(
  state: PersistedTelegramState,
): SanitizedPersistedInputs {
  return {
    apiId: extractInlineApiId(state),
    phoneNumber: extractInlinePhoneNumber(state),
    inlineApiHash: extractInlineSecret(state, "apiHash"),
    inlineBotToken: extractInlineSecret(state, "botToken"),
  };
}

function hasInlineSecret(secret: string | null): secret is string {
  return typeof secret === "string" && secret.length > 0;
}

function getSanitizedAuthState(
  state: PersistedTelegramState,
  input: Pick<SanitizedPersistedInputs, "apiId" | "phoneNumber" | "inlineApiHash">,
) {
  const apiHashConfigured =
    Boolean(input.inlineApiHash) || state.tdlib?.apiHashConfigured === true;
  const status = normalizeTelegramStatus(state.status, {
    apiId: input.apiId,
    apiHashConfigured,
  });

  return {
    status,
    authStep: normalizeTelegramAuthStep(state.authStep, {
      apiId: input.apiId,
      apiHashConfigured,
      phoneNumber: input.phoneNumber,
      status,
    }),
    apiHashConfigured,
  };
}

const SANITIZED_STATE_CHANGE_TESTS = [
  (state: PersistedTelegramState, next: StoredTelegramState) =>
    state.credentials !== undefined,
  (state, next) => state.tdlib?.apiId !== next.tdlib.apiId,
  (state, next) =>
    state.tdlib?.apiHashConfigured !== next.tdlib.apiHashConfigured,
  (state, next) => state.user?.phoneNumber !== next.user.phoneNumber,
  (state, next) => state.status !== next.status,
  (state, next) => state.authStep !== next.authStep,
  (state) => state.selectedMode !== "user",
  (state) => state.recommendedMode !== "user",
  (state) => state.schemaVersion !== 1,
] satisfies Array<
  (state: PersistedTelegramState, next: StoredTelegramState) => boolean
>;

function hasSanitizedStateChanged(
  state: PersistedTelegramState,
  next: StoredTelegramState,
  input: Pick<SanitizedPersistedInputs, "inlineApiHash" | "inlineBotToken">,
) {
  return (
    Boolean(input.inlineApiHash) ||
    Boolean(input.inlineBotToken) ||
    SANITIZED_STATE_CHANGE_TESTS.some((isChanged) => isChanged(state, next))
  );
}

function legacyApiId(legacy: LegacyState) {
  return legacy.credentials?.apiId ?? legacy.tdlib?.apiId ?? null;
}

function legacyApiHashConfigured(legacy: LegacyState) {
  return Boolean(legacy.credentials?.apiHash) || legacy.tdlib?.apiHashConfigured || false;
}

function legacyPhoneNumber(legacy: LegacyState) {
  return legacy.credentials?.phoneNumber ?? legacy.user?.phoneNumber ?? null;
}

function normalizeLegacyState(legacy: LegacyState) {
  return normalizeState({
    ...legacy,
    tdlib: {
      apiId: legacyApiId(legacy),
      apiHashConfigured: legacyApiHashConfigured(legacy),
    },
    user: {
      phoneNumber: legacyPhoneNumber(legacy),
    },
  });
}

function getRuntimeStatePatch(runtimeState: RuntimeAuthState) {
  const isReady = runtimeState.authStep === "ready";

  return {
    status: isReady ? "connected" : "awaiting_credentials",
    authStep: runtimeState.authStep,
    message: describeTelegramAuthStep(runtimeState.authStep),
    sessionUser: isReady ? runtimeState.sessionUser ?? null : null,
  } satisfies Pick<
    StoredTelegramState,
    "status" | "authStep" | "message" | "sessionUser"
  >;
}

function shouldSyncRuntimeState(
  state: StoredTelegramState,
  patch: ReturnType<typeof getRuntimeStatePatch>,
) {
  return (
    state.status !== patch.status ||
    state.authStep !== patch.authStep ||
    state.message !== patch.message ||
    state.sessionUser?.id !== patch.sessionUser?.id
  );
}

export class TelegramAuthService {
  readonly telegramRoot: string;
  readonly statePath: string;
  private readonly legacyStatePath: string;
  readonly secretsService: TelegramSecretsService;
  readonly tdlibService: TelegramTdlibService;
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
    this.telegramRoot = path.join(this.settingsService.getLibraryRoot(), "telegram");
    this.statePath = path.join(this.telegramRoot, "state.json");
    this.legacyStatePath = path.join(
      this.settingsService.getLibraryRoot(),
      "telegram.json",
    );
    this.secretsService = services.secretsService;
    this.tdlibService = services.tdlibService;
    this.emit = services.emit;
  }

  async ensureTelegramRoot() {
    await fs.mkdir(this.telegramRoot, { recursive: true });
  }

  private async sanitizePersistedState(
    state: PersistedTelegramState,
  ): Promise<SanitizedPersistedState> {
    const input = getSanitizedPersistedInputs(state);

    const { inlineApiHash, inlineBotToken } = input;

    if (hasInlineSecret(inlineApiHash)) {
      await this.secretsService.setSecret(ACCOUNT_KEY, "api_hash", inlineApiHash);
    }

    if (hasInlineSecret(inlineBotToken)) {
      await this.secretsService.setSecret(ACCOUNT_KEY, "bot_token", inlineBotToken);
    }

    const auth = getSanitizedAuthState(state, input);
    const nextState = normalizeState({
      ...state,
      status: auth.status,
      authStep: auth.authStep,
      tdlib: {
        apiId: input.apiId,
        apiHashConfigured: auth.apiHashConfigured,
      },
      user: {
        phoneNumber: input.phoneNumber,
      },
    });

    return {
      state: nextState,
      changed: hasSanitizedStateChanged(state, nextState, input),
    };
  }

  private async migrateLegacyState() {
    try {
      const raw = await fs.readFile(this.legacyStatePath, "utf8");
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
      await fs.rm(this.legacyStatePath, { force: true });
    } catch {
      // No legacy state to migrate.
    }
  }

  async readState(): Promise<StoredTelegramState> {
    await this.settingsService.ensureLibrary();
    await this.ensureTelegramRoot();

    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const persisted = JSON.parse(raw) as PersistedTelegramState;
      const next = await this.sanitizePersistedState(persisted);
      if (next.changed) {
        await this.writeState(next.state);
      }
      return next.state;
    } catch {
      await this.migrateLegacyState();

      try {
        const raw = await fs.readFile(this.statePath, "utf8");
        const persisted = JSON.parse(raw) as PersistedTelegramState;
        const next = await this.sanitizePersistedState(persisted);
        if (next.changed) {
          await this.writeState(next.state);
        }
        return next.state;
      } catch {
        const nextState = createDefaultState();
        await this.writeState(nextState);
        return nextState;
      }
    }
  }

  async writeState(state: StoredTelegramState) {
    await this.ensureTelegramRoot();
    state.updatedAt = nowIso();
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
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
        payload.authStep === "ready" ? payload.sessionUser ?? null : null,
      lastError: payload.lastError ?? null,
      updatedAt: nowIso(),
    }));

    return toPublicState(next);
  }

  private async markApiHashUnavailable(message: string) {
    return this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: "wait_tdlib_parameters",
      tdlib: {
        ...current.tdlib,
        apiHashConfigured: false,
      },
      message,
      lastError: message,
      updatedAt: nowIso(),
    }));
  }

  private async markInvalidTdlibCredentials() {
    await this.secretsService.deleteSecret(ACCOUNT_KEY, "api_hash");
    return this.updateState((current) => {
      const normalizedApiId = normalizeTdlibCredential(current.tdlib.apiId ?? "");

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
      const message = (error as Error)?.message ?? INVALID_TDLIB_CREDENTIALS_MESSAGE;
      return { state: await this.markApiHashUnavailable(message) };
    }

    if (!apiHash) {
      const message = "Telegram api_hash is missing. Enter your TDLib credentials again.";
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
    if (input.apiId === input.state.tdlib.apiId && input.apiHash === input.originalApiHash) {
      return;
    }

    await this.secretsService.setSecret(ACCOUNT_KEY, "api_hash", input.apiHash);
    await this.updateState((current) => ({
      ...current,
      tdlib: {
        ...current.tdlib,
        apiId: input.apiId,
      },
      updatedAt: nowIso(),
    }));
  }

  private async ensureDatabaseEncryptionKey(accountRoot: string) {
    let databaseEncryptionKey = await this.secretsService.getSecret(
      ACCOUNT_KEY,
      "database_encryption_key",
    );
    if (!databaseEncryptionKey || !isTdlibBytesString(databaseEncryptionKey)) {
      await fs.rm(accountRoot, {
        recursive: true,
        force: true,
      });
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
      tdlib: {
        apiId: null,
        apiHashConfigured: false,
      },
      user: {
        phoneNumber: null,
      },
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
      const isParameterParseError =
        /Failed to parse JSON object as TDLib request|Wrong character in the string/i.test(
          message,
        );

      if (isParameterParseError) {
        return this.markTdlibStartupParameterError(message);
      }

      throw error;
    }
  }

  private async syncStateFromRuntime(state: StoredTelegramState) {
    const runtimeState = this.tdlibService.getCurrentAuthState();
    const patch = getRuntimeStatePatch(runtimeState);

    if (shouldSyncRuntimeState(state, patch)) {
      return this.updateState((current) => ({
        ...current,
        ...patch,
        lastError: patch.authStep === "ready" ? null : current.lastError,
        updatedAt: nowIso(),
      }));
    }

    return state;
  }

  async ensureRuntimeStarted() {
    const state = await this.readState();
    if (!state.tdlib.apiId || !state.tdlib.apiHashConfigured) {
      return state;
    }

    const credentialResult = await this.readTdlibCredentials(state);
    if (credentialResult.state) {
      return credentialResult.state;
    }

    const { apiId, apiHash, originalApiHash } = credentialResult.credentials;
    await this.persistNormalizedTdlibCredentials({
      state,
      apiId,
      apiHash,
      originalApiHash,
    });

    const accountRoot = path.join(this.telegramRoot, "tdlib", ACCOUNT_KEY);
    const databaseEncryptionKey = await this.ensureDatabaseEncryptionKey(accountRoot);
    const startupErrorState = await this.startTdlibRuntime({
      accountRoot,
      apiId,
      apiHash,
      phoneNumber: state.user.phoneNumber,
      databaseEncryptionKey,
    });
    if (startupErrorState) {
      return startupErrorState;
    }

    return this.syncStateFromRuntime(state);
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
      tdlib: {
        apiId: normalized.apiId,
        apiHashConfigured: true,
      },
      message: current.user.phoneNumber
        ? "TDLib credentials saved. If Telegram prompts for a code, enter it to finish login."
        : "TDLib credentials saved. Enter the phone number for your Telegram account.",
      lastError: null,
      updatedAt: nowIso(),
    }));
    await this.ensureRuntimeStarted();
    return toPublicState(next);
  }

  async submitPhoneNumber(input: { phoneNumber: string }): Promise<TelegramState> {
    const phoneNumber = normalizeTelegramPhoneNumber(input.phoneNumber);
    const next = await this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: "wait_phone_number",
      user: {
        phoneNumber,
      },
      message: "Submitting your phone number to Telegram.",
      lastError: null,
      updatedAt: nowIso(),
    }));

    try {
      await this.ensureRuntimeStarted();
      await this.lastRuntimeUpdate;
      const state = await this.readState();
      if (state.authStep === "wait_phone_number") {
        await this.tdlibService.submitPhoneNumber(phoneNumber);
        await this.lastRuntimeUpdate;
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
      await this.lastRuntimeUpdate;
    } catch (error) {
      await this.failAuthStep("wait_code", error);
    }

    return toPublicState(await this.readState());
  }

  async submitPassword(input: { password: string }): Promise<TelegramState> {
    try {
      await this.ensureRuntimeStarted();
      await this.tdlibService.submitPassword(input.password);
      await this.lastRuntimeUpdate;
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
      telegramPacks.map((pack) => this.libraryService.deletePack({ packId: pack.id })),
    );
    const next = createDefaultState();
    await this.writeState(next);
    this.emit({
      type: "auth_state_changed",
      state: toPublicState(next),
    });
    return toPublicState(next);
  }

  async reset(): Promise<TelegramState> {
    return this.logout();
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
