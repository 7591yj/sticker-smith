import type { TelegramState } from "@sticker-smith/shared";

import { nowIso } from "../utils/timeUtils";
import type {
  LegacyState,
  PersistedTelegramState,
  StoredTelegramState,
} from "./telegramAuthTypes";

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
    phoneNumber: withDefault(
      state?.user?.phoneNumber,
      defaults.user.phoneNumber,
    ),
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

  if (options.status === "connected") return "ready";
  if (!options.apiId || !options.apiHashConfigured)
    return "wait_tdlib_parameters";
  if (!options.phoneNumber) return "wait_phone_number";
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

function legacyApiId(legacy: LegacyState) {
  return legacy.credentials?.apiId ?? legacy.tdlib?.apiId ?? null;
}

function legacyApiHashConfigured(legacy: LegacyState) {
  return (
    Boolean(legacy.credentials?.apiHash) ||
    legacy.tdlib?.apiHashConfigured ||
    false
  );
}

function legacyPhoneNumber(legacy: LegacyState) {
  return legacy.credentials?.phoneNumber ?? legacy.user?.phoneNumber ?? null;
}

export function normalizeLegacyState(legacy: LegacyState) {
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
