import { useEffect, useRef } from "react";
import type { TelegramState } from "@sticker-smith/shared";

function getAutoSyncAccountKey(telegramState: TelegramState | null) {
  if (
    telegramState?.status !== "connected" ||
    telegramState.authStep !== "ready"
  ) {
    return null;
  }

  return telegramState.sessionUser?.id
    ? String(telegramState.sessionUser.id)
    : "connected";
}

function triggerAutoTelegramSyncOnce(options: {
  accountKey: string | null;
  syncedAccountRef: React.MutableRefObject<string | null>;
  syncTelegramPacks: () => Promise<void>;
}) {
  if (!options.accountKey) {
    options.syncedAccountRef.current = null;
    return;
  }

  if (options.syncedAccountRef.current === options.accountKey) return;

  options.syncedAccountRef.current = options.accountKey;
  void options.syncTelegramPacks().catch(() => undefined);
}

export function useAutoTelegramSync(
  telegramState: TelegramState | null,
  syncTelegramPacks: () => Promise<void>,
) {
  const autoSyncedTelegramAccountRef = useRef<string | null>(null);
  useEffect(() => {
    triggerAutoTelegramSyncOnce({
      accountKey: getAutoSyncAccountKey(telegramState),
      syncedAccountRef: autoSyncedTelegramAccountRef,
      syncTelegramPacks,
    });
  }, [syncTelegramPacks, telegramState]);
}
