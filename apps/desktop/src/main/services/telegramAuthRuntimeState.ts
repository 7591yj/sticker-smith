import type { TelegramTdlibService } from "./telegramTdlibService";
import type {
  PersistedTelegramState,
  SanitizedPersistedInputs,
  StoredTelegramState,
} from "./telegramAuthTypes";
import {
  extractInlineApiId,
  extractInlinePhoneNumber,
  extractInlineSecret,
  normalizeTelegramAuthStep,
  normalizeTelegramStatus,
} from "./telegramAuthNormalization";
import { describeTelegramAuthStep } from "../utils/telegramUtils";

type RuntimeAuthState = ReturnType<TelegramTdlibService["getCurrentAuthState"]>;

export function getSanitizedPersistedInputs(
  state: PersistedTelegramState,
): SanitizedPersistedInputs {
  return {
    apiId: extractInlineApiId(state),
    phoneNumber: extractInlinePhoneNumber(state),
    inlineApiHash: extractInlineSecret(state, "apiHash"),
    inlineBotToken: extractInlineSecret(state, "botToken"),
  };
}

export function hasInlineSecret(secret: string | null): secret is string {
  return typeof secret === "string" && secret.length > 0;
}

export function getSanitizedAuthState(
  state: PersistedTelegramState,
  input: Pick<
    SanitizedPersistedInputs,
    "apiId" | "phoneNumber" | "inlineApiHash"
  >,
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

export function hasSanitizedStateChanged(
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

export function getRuntimeStatePatch(runtimeState: RuntimeAuthState) {
  const isReady = runtimeState.authStep === "ready";

  return {
    status: isReady ? "connected" : "awaiting_credentials",
    authStep: runtimeState.authStep,
    message: describeTelegramAuthStep(runtimeState.authStep),
    sessionUser: isReady ? (runtimeState.sessionUser ?? null) : null,
  } satisfies Pick<
    StoredTelegramState,
    "status" | "authStep" | "message" | "sessionUser"
  >;
}

export function shouldSyncRuntimeState(
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
