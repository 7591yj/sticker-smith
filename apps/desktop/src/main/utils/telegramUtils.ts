import type { TelegramState } from "@sticker-smith/shared";

export function describeTelegramAuthStep(
  authStep: TelegramState["authStep"] | string,
) {
  switch (authStep) {
    case "wait_tdlib_parameters":
      return "TDLib requires your Telegram api_id and api_hash.";
    case "wait_phone_number":
      return "Enter the phone number for the Telegram account that owns the sticker sets.";
    case "wait_code":
      return "Enter the login code Telegram sent to your account.";
    case "wait_password":
      return "Enter your Telegram two-step verification password.";
    case "ready":
      return "Telegram is connected.";
    default:
      return "Telegram is logged out.";
  }
}
