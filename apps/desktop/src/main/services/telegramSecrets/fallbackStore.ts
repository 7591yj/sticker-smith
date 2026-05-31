import fs from "node:fs/promises";
import path from "node:path";
import type {
  SafeStorageModule,
  SecretKey,
  StoredFallbackSecrets,
} from "./types";

function createEmptyFallbackSecrets(): StoredFallbackSecrets {
  return { schemaVersion: 2, secrets: {} };
}

function isStoredSecretRecord(record: unknown) {
  return (
    record &&
    typeof record === "object" &&
    "storage" in record &&
    "value" in record &&
    ((record as { storage?: unknown }).storage === "safe_storage" ||
      (record as { storage?: unknown }).storage === "plain_text") &&
    typeof (record as { value?: unknown }).value === "string"
  );
}

function migrateLegacySecrets(
  parsed:
    | Partial<StoredFallbackSecrets>
    | { schemaVersion?: 1; secrets?: Record<string, string> },
) {
  return {
    schemaVersion: 2,
    secrets: Object.fromEntries(
      Object.entries(parsed.secrets ?? {})
        .filter(
          (_entry): _entry is [string, string] =>
            typeof _entry[0] === "string" && typeof _entry[1] === "string",
        )
        .map(([accountName, value]) => [
          accountName,
          { storage: "safe_storage" as const, value },
        ]),
    ),
  } satisfies StoredFallbackSecrets;
}

function normalizeFallbackSecrets(
  parsed:
    | Partial<StoredFallbackSecrets>
    | { schemaVersion?: 1; secrets?: Record<string, string> },
) {
  if (parsed.schemaVersion !== 2 || !parsed.secrets) {
    return migrateLegacySecrets(parsed);
  }

  return {
    schemaVersion: 2,
    secrets: Object.fromEntries(
      Object.entries(parsed.secrets).flatMap(([accountName, record]) =>
        isStoredSecretRecord(record) ? [[accountName, record]] : [],
      ),
    ),
  } satisfies StoredFallbackSecrets;
}

export class TelegramFallbackSecretStore {
  constructor(
    private readonly secretsPath: string,
    private readonly getSafeStorage: () => Promise<SafeStorageModule | null>,
    private readonly accountName: (
      accountKey: string,
      key: SecretKey,
    ) => string,
  ) {}

  private async ensureTelegramRoot() {
    await fs.mkdir(path.dirname(this.secretsPath), { recursive: true });
  }

  private async readFallbackSecrets() {
    await this.ensureTelegramRoot();

    try {
      const raw = await fs.readFile(this.secretsPath, "utf8");
      return normalizeFallbackSecrets(JSON.parse(raw));
    } catch {
      return createEmptyFallbackSecrets();
    }
  }

  private async writeFallbackSecrets(secrets: StoredFallbackSecrets) {
    await this.ensureTelegramRoot();
    await fs.writeFile(this.secretsPath, JSON.stringify(secrets, null, 2));
  }

  async getSecret(accountKey: string, key: SecretKey) {
    const secrets = await this.readFallbackSecrets();
    const stored = secrets.secrets[this.accountName(accountKey, key)];
    if (!stored) return null;
    if (stored.storage === "plain_text") return stored.value;

    const safeStorage = await this.getSafeStorage();
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error(
        "Telegram secret storage is unavailable because this environment cannot unlock previously encrypted Telegram credentials.",
      );
    }

    return safeStorage.decryptString(Buffer.from(stored.value, "base64"));
  }

  async setSecret(accountKey: string, key: SecretKey, value: string) {
    const safeStorage = await this.getSafeStorage();
    const secrets = await this.readFallbackSecrets();
    secrets.secrets[this.accountName(accountKey, key)] =
      safeStorage?.isEncryptionAvailable()
        ? {
            storage: "safe_storage",
            value: safeStorage.encryptString(value).toString("base64"),
          }
        : { storage: "plain_text", value };
    await this.writeFallbackSecrets(secrets);
  }

  async deleteSecret(accountKey: string, key: SecretKey) {
    const secrets = await this.readFallbackSecrets();
    delete secrets.secrets[this.accountName(accountKey, key)];
    await this.writeFallbackSecrets(secrets);
  }
}
