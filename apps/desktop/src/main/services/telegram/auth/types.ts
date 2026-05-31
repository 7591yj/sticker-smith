import type { TelegramState } from "@sticker-smith/shared";

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

export interface PersistedTelegramState extends Omit<
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

export type TdlibCredentials = {
  apiId: string;
  apiHash: string;
  originalApiHash: string;
};

export type TdlibCredentialResult =
  | { credentials: TdlibCredentials; state?: never }
  | { credentials?: never; state: StoredTelegramState };

export type SanitizedPersistedState = {
  state: StoredTelegramState;
  changed: boolean;
};

export type SanitizedPersistedInputs = {
  apiId: string | null;
  phoneNumber: string | null;
  inlineApiHash: string | null;
  inlineBotToken: string | null;
};

export type LegacyState = {
  credentials?: {
    apiId?: string | null;
    apiHash?: string | null;
    phoneNumber?: string | null;
  };
} & Partial<StoredTelegramState>;
