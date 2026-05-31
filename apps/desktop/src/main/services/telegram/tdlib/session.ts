import type { TelegramSessionUser } from "@sticker-smith/shared";
import { asNumber } from "./values";
import type { TdClient } from "./types";

export function mapSessionUser(me: any): TelegramSessionUser {
  const displayName = [me?.first_name, me?.last_name].filter(Boolean).join(" ");

  return {
    id: asNumber(me?.id),
    username: me?.usernames?.editable_username ?? me?.username ?? null,
    displayName: displayName || "Telegram User",
  } satisfies TelegramSessionUser;
}

export async function getSessionUser(client: TdClient | null) {
  if (!client) {
    return null;
  }

  return mapSessionUser(await client.invoke({ _: "getMe" }));
}
