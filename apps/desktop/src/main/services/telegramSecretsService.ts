import fs from "node:fs/promises";
import path from "node:path";

import type { SettingsService } from "./settingsService";
import { APP_SERVICE_NAME as SERVICE_NAME } from "../config/constants";

type SecretKey = "api_hash" | "bot_token" | "database_encryption_key";

interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

interface SafeStorageModule {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface StoredSecretRecord {
  storage: "safe_storage" | "plain_text";
  value: string;
}

interface StoredFallbackSecrets {
  schemaVersion: 2;
  secrets: Record<string, StoredSecretRecord>;
}

export interface TelegramSecretsServiceOptions {
  keytar?: KeytarModule | null;
  safeStorage?: SafeStorageModule | null;
}

async function loadKeytar() {
  const mod = (await import("keytar")) as unknown as KeytarModule;
  return mod;
}

async function loadSafeStorage() {
  const mod = await import("electron");
  return mod.safeStorage;
}

function createEmptyFallbackSecrets(): StoredFallbackSecrets {
  return {
    schemaVersion: 2,
    secrets: {},
  };
}

export class TelegramSecretsService {
  private readonly secretsPath: string;
  private keytar: KeytarModule | null | undefined;
  private safeStorage: SafeStorageModule | null | undefined;

  constructor(
    private readonly settingsService: SettingsService,
    options: TelegramSecretsServiceOptions = {},
  ) {
    this.secretsPath = path.join(
      this.settingsService.getLibraryRoot(),
      "telegram",
      "secrets.json",
    );
    this.keytar = options.keytar;
    this.safeStorage = options.safeStorage;
  }

  private accountName(accountKey: string, key: SecretKey) {
    return `${accountKey}:${key}`;
  }

  private async ensureTelegramRoot() {
    await fs.mkdir(path.dirname(this.secretsPath), { recursive: true });
  }

  private async getKeytar() {
    if (this.keytar !== undefined) {
      return this.keytar;
    }

    try {
      this.keytar = await loadKeytar();
    } catch {
      this.keytar = null;
    }

    return this.keytar;
  }

  private async getSafeStorage() {
    if (this.safeStorage !== undefined) {
      return this.safeStorage;
    }

    try {
      this.safeStorage = await loadSafeStorage();
    } catch {
      this.safeStorage = null;
    }

    return this.safeStorage;
  }

  private async isKeychainAvailable() {
    const keytar = await this.getKeytar();
    return keytar !== null;
  }

  private async readFallbackSecrets() {
    await this.ensureTelegramRoot();

    try {
      const raw = await fs.readFile(this.secretsPath, "utf8");
      const parsed = JSON.parse(raw) as
        | Partial<StoredFallbackSecrets>
        | {
            schemaVersion?: 1;
            secrets?: Record<string, string>;
          };

      if (parsed.schemaVersion === 2 && parsed.secrets) {
        const secrets = Object.fromEntries(
          Object.entries(parsed.secrets).flatMap(([accountName, record]) =>
            record &&
            typeof record === "object" &&
            "storage" in record &&
            "value" in record &&
            (record.storage === "safe_storage" ||
              record.storage === "plain_text") &&
            typeof record.value === "string"
              ? [[accountName, record]]
              : [],
          ),
        );

        return {
          schemaVersion: 2,
          secrets,
        } satisfies StoredFallbackSecrets;
      }

      return {
        schemaVersion: 2,
        secrets: Object.fromEntries(
          Object.entries(parsed.secrets ?? {}).filter(
            (_entry): _entry is [string, string] =>
              typeof _entry[0] === "string" && typeof _entry[1] === "string",
          ).map(([accountName, value]) => [
            accountName,
            {
              storage: "safe_storage" as const,
              value,
            },
          ]),
        ),
      } satisfies StoredFallbackSecrets;
    } catch {
      return createEmptyFallbackSecrets();
    }
  }

  private async writeFallbackSecrets(secrets: StoredFallbackSecrets) {
    await this.ensureTelegramRoot();
    await fs.writeFile(this.secretsPath, JSON.stringify(secrets, null, 2));
  }

  private async getFallbackSecret(accountKey: string, key: SecretKey) {
    const secrets = await this.readFallbackSecrets();
    const stored = secrets.secrets[this.accountName(accountKey, key)];
    if (!stored) {
      return null;
    }

    if (stored.storage === "plain_text") {
      return stored.value;
    }

    const safeStorage = await this.getSafeStorage();
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error(
        "Telegram secret storage is unavailable because this environment cannot unlock previously encrypted Telegram credentials.",
      );
    }

    return safeStorage.decryptString(Buffer.from(stored.value, "base64"));
  }

  private async setFallbackSecret(
    accountKey: string,
    key: SecretKey,
    value: string,
  ) {
    const safeStorage = await this.getSafeStorage();
    const secrets = await this.readFallbackSecrets();
    secrets.secrets[this.accountName(accountKey, key)] =
      safeStorage?.isEncryptionAvailable()
        ? {
            storage: "safe_storage",
            value: safeStorage.encryptString(value).toString("base64"),
          }
        : {
            storage: "plain_text",
            value,
          };
    await this.writeFallbackSecrets(secrets);
  }

  private async deleteFallbackSecret(accountKey: string, key: SecretKey) {
    const secrets = await this.readFallbackSecrets();
    delete secrets.secrets[this.accountName(accountKey, key)];
    await this.writeFallbackSecrets(secrets);
  }

  async getSecret(accountKey: string, key: SecretKey) {
    const keytar = await this.getKeytar();

    if (keytar) {
      const secret = await keytar.getPassword(
        SERVICE_NAME,
        this.accountName(accountKey, key),
      );
      if (secret !== null) {
        return secret;
      }
    }

    return this.getFallbackSecret(accountKey, key);
  }

  async setSecret(accountKey: string, key: SecretKey, value: string) {
    const keytar = await this.getKeytar();

    if (keytar) {
      await keytar.setPassword(
        SERVICE_NAME,
        this.accountName(accountKey, key),
        value,
      );
      await this.deleteFallbackSecret(accountKey, key);
      return;
    }

    await this.setFallbackSecret(accountKey, key, value);
  }

  async deleteSecret(accountKey: string, key: SecretKey) {
    const keytar = await this.getKeytar();

    if (keytar) {
      await keytar.deletePassword(
        SERVICE_NAME,
        this.accountName(accountKey, key),
      );
    }

    await this.deleteFallbackSecret(accountKey, key);
  }

  async clearAccount(accountKey: string) {
    await Promise.all(
      (["api_hash", "bot_token", "database_encryption_key"] as const).map((key) =>
        this.deleteSecret(accountKey, key),
      ),
    );
  }

  async getAvailability() {
    const safeStorage = await this.getSafeStorage();
    return {
      keychain: await this.isKeychainAvailable(),
      fallbackEncryption: safeStorage?.isEncryptionAvailable() ?? false,
      plaintextFallback: true,
    };
  }
}
