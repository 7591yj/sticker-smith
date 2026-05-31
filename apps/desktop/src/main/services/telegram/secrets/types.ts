export type SecretKey = "api_hash" | "bot_token" | "database_encryption_key";

export interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export interface SafeStorageModule {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface StoredSecretRecord {
  storage: "safe_storage" | "plain_text";
  value: string;
}

export interface StoredFallbackSecrets {
  schemaVersion: 2;
  secrets: Record<string, StoredSecretRecord>;
}

export interface TelegramSecretsServiceOptions {
  keytar?: KeytarModule | null;
  safeStorage?: SafeStorageModule | null;
}
