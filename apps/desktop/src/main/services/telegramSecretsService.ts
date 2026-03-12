import fs from "node:fs/promises";
import path from "node:path";

import type { SettingsService } from "./settingsService";

const SERVICE_NAME = "Sticker Smith";

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

interface StoredFallbackSecrets {
  schemaVersion: 1;
  secrets: Record<string, string>;
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
    schemaVersion: 1,
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
      const parsed = JSON.parse(raw) as Partial<StoredFallbackSecrets>;
      return {
        schemaVersion: 1,
        secrets: parsed.secrets ?? {},
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
    const safeStorage = await this.getSafeStorage();
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error(
        "Telegram secret storage is unavailable because the OS keychain and Electron safeStorage are both unavailable.",
      );
    }

    const secrets = await this.readFallbackSecrets();
    const encoded = secrets.secrets[this.accountName(accountKey, key)];
    if (!encoded) {
      return null;
    }

    return safeStorage.decryptString(Buffer.from(encoded, "base64"));
  }

  private async setFallbackSecret(
    accountKey: string,
    key: SecretKey,
    value: string,
  ) {
    const safeStorage = await this.getSafeStorage();
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error(
        "Telegram secret storage is unavailable because the OS keychain and Electron safeStorage are both unavailable.",
      );
    }

    const secrets = await this.readFallbackSecrets();
    secrets.secrets[this.accountName(accountKey, key)] = safeStorage
      .encryptString(value)
      .toString("base64");
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
      return keytar.getPassword(SERVICE_NAME, this.accountName(accountKey, key));
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
      return;
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
    return {
      keychain: await this.isKeychainAvailable(),
      fallbackEncryption:
        (await this.getSafeStorage())?.isEncryptionAvailable() ?? false,
    };
  }
}
