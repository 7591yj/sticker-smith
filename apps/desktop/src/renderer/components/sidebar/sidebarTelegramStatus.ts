import type { TelegramState } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";

export function statusLabelForTelegram(state: TelegramState | null) {
  if (!state) return appTokens.copy.labels.telegramDisconnected;
  if (state.status === "connected") return appTokens.copy.labels.telegramConnected;
  if (state.authStep === "wait_code") return appTokens.copy.labels.telegramNeedsCode;
  if (state.authStep === "wait_password") return appTokens.copy.labels.telegramNeedsPassword;
  if (state.status === "awaiting_credentials") {
    return appTokens.copy.labels.telegramNeedsCredentials;
  }
  return appTokens.copy.labels.telegramDisconnected;
}
