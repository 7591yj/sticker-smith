import path from "node:path";

import type { SettingsService } from "./settingsService";
import { TelegramFallbackSecretStore } from "./telegramSecrets/fallbackStore";
import {
  loadKeytar,
  loadSafeStorage,
  normalizeKeytarModule,
} from "./telegramSecrets/moduleLoaders";
import type {
  KeytarModule,
  SafeStorageModule,
  SecretKey,
  TelegramSecretsServiceOptions,
} from "./telegramSecrets/types";
import { APP_SERVICE_NAME as SERVICE_NAME } from "../config/constants";

export { normalizeKeytarModule } from "./telegramSecrets/moduleLoaders";
export type { TelegramSecretsServiceOptions } from "./telegramSecrets/types";

const SECRET_KEYS = [
  "api_hash",
  "bot_token",
  "database_encryption_key",
] as const;

export class TelegramSecretsService {
  private readonly fallbackStore: TelegramFallbackSecretStore;
  private keytar: KeytarModule | null | undefined;
  private safeStorage: SafeStorageModule | null | undefined;

  constructor(
    private readonly settingsService: SettingsService,
    options: TelegramSecretsServiceOptions = {},
  ) {
    const secretsPath = path.join(
      this.settingsService.getLibraryRoot(),
      "telegram",
      "secrets.json",
    );
    this.keytar = options.keytar;
    this.safeStorage = options.safeStorage;
    this.fallbackStore = new TelegramFallbackSecretStore(
      secretsPath,
      this.getSafeStorage.bind(this),
      this.accountName.bind(this),
    );
  }

  private accountName(accountKey: string, key: SecretKey) {
    return `${accountKey}:${key}`;
  }

  private async getKeytar() {
    if (this.keytar !== undefined) return this.keytar;

    try {
      this.keytar = await loadKeytar();
    } catch {
      this.keytar = null;
    }

    return this.keytar;
  }

  private async getSafeStorage() {
    if (this.safeStorage !== undefined) return this.safeStorage;

    try {
      this.safeStorage = await loadSafeStorage();
    } catch {
      this.safeStorage = null;
    }

    return this.safeStorage;
  }

  private async isKeychainAvailable() {
    return (await this.getKeytar()) !== null;
  }

  async getSecret(accountKey: string, key: SecretKey) {
    const keytar = await this.getKeytar();

    if (keytar) {
      const secret = await keytar.getPassword(
        SERVICE_NAME,
        this.accountName(accountKey, key),
      );
      if (secret !== null) return secret;
    }

    return this.fallbackStore.getSecret(accountKey, key);
  }

  async setSecret(accountKey: string, key: SecretKey, value: string) {
    const keytar = await this.getKeytar();

    if (keytar) {
      await keytar.setPassword(
        SERVICE_NAME,
        this.accountName(accountKey, key),
        value,
      );
      await this.fallbackStore.deleteSecret(accountKey, key);
      return;
    }

    await this.fallbackStore.setSecret(accountKey, key, value);
  }

  async deleteSecret(accountKey: string, key: SecretKey) {
    const keytar = await this.getKeytar();

    if (keytar) {
      await keytar.deletePassword(
        SERVICE_NAME,
        this.accountName(accountKey, key),
      );
    }

    await this.fallbackStore.deleteSecret(accountKey, key);
  }

  async clearAccount(accountKey: string) {
    await Promise.all(
      SECRET_KEYS.map((key) => this.deleteSecret(accountKey, key)),
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
