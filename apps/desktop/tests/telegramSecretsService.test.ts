import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TelegramSecretsService } from "../src/main/services/telegramSecretsService";

class FakeSettingsService {
  constructor(private readonly root: string) {}

  getLibraryRoot() {
    return this.root;
  }
}

class FakeKeytar {
  private readonly secrets = new Map<string, string>();

  async getPassword(service: string, account: string) {
    return this.secrets.get(`${service}:${account}`) ?? null;
  }

  async setPassword(service: string, account: string, password: string) {
    this.secrets.set(`${service}:${account}`, password);
  }

  async deletePassword(service: string, account: string) {
    return this.secrets.delete(`${service}:${account}`);
  }
}

describe("TelegramSecretsService", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanup
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it("stores secrets in plaintext when keychain and safeStorage are unavailable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-secrets-"));
    cleanup.push(root);

    const service = new TelegramSecretsService(
      new FakeSettingsService(root) as never,
      {
        keytar: null,
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: () => {
            throw new Error("encryptString should not be called");
          },
          decryptString: () => {
            throw new Error("decryptString should not be called");
          },
        },
      },
    );

    await service.setSecret("default", "api_hash", "secret-hash");

    expect(await service.getSecret("default", "api_hash")).toBe("secret-hash");
    await expect(
      fs.readFile(path.join(root, "telegram", "secrets.json"), "utf8"),
    ).resolves.toContain('"storage": "plain_text"');
  });

  it("reads legacy safeStorage-backed fallback secrets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-secrets-"));
    cleanup.push(root);

    await fs.mkdir(path.join(root, "telegram"), { recursive: true });
    await fs.writeFile(
      path.join(root, "telegram", "secrets.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          secrets: {
            "default:api_hash": Buffer.from("enc:legacy-secret").toString("base64"),
          },
        },
        null,
        2,
      ),
    );

    const service = new TelegramSecretsService(
      new FakeSettingsService(root) as never,
      {
        keytar: null,
        safeStorage: {
          isEncryptionAvailable: () => true,
          encryptString: (value: string) => Buffer.from(`enc:${value}`),
          decryptString: (value: Buffer) => value.toString("utf8").replace(/^enc:/, ""),
        },
      },
    );

    expect(await service.getSecret("default", "api_hash")).toBe("legacy-secret");
  });

  it("fails clearly when encrypted fallback secrets cannot be decrypted in the current environment", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-secrets-"));
    cleanup.push(root);

    await fs.mkdir(path.join(root, "telegram"), { recursive: true });
    await fs.writeFile(
      path.join(root, "telegram", "secrets.json"),
      JSON.stringify(
        {
          schemaVersion: 2,
          secrets: {
            "default:api_hash": {
              storage: "safe_storage",
              value: Buffer.from("enc:secret").toString("base64"),
            },
          },
        },
        null,
        2,
      ),
    );

    const service = new TelegramSecretsService(
      new FakeSettingsService(root) as never,
      {
        keytar: null,
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (value: string) => Buffer.from(value),
          decryptString: (value: Buffer) => value.toString("utf8"),
        },
      },
    );

    await expect(service.getSecret("default", "api_hash")).rejects.toThrow(
      "cannot unlock previously encrypted Telegram credentials",
    );
  });

  it("reads plaintext fallback secrets before a later keychain migration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-secrets-"));
    cleanup.push(root);

    const keytar = new FakeKeytar();
    await fs.mkdir(path.join(root, "telegram"), { recursive: true });
    await fs.writeFile(
      path.join(root, "telegram", "secrets.json"),
      JSON.stringify(
        {
          schemaVersion: 2,
          secrets: {
            "default:api_hash": {
              storage: "plain_text",
              value: "plain-secret",
            },
          },
        },
        null,
        2,
      ),
    );

    const service = new TelegramSecretsService(
      new FakeSettingsService(root) as never,
      {
        keytar,
        safeStorage: null,
      },
    );

    expect(await service.getSecret("default", "api_hash")).toBe("plain-secret");
    await service.setSecret("default", "api_hash", "migrated-secret");
    expect(await keytar.getPassword("Sticker Smith", "default:api_hash")).toBe(
      "migrated-secret",
    );
    await expect(
      fs.readFile(path.join(root, "telegram", "secrets.json"), "utf8"),
    ).resolves.not.toContain("plain-secret");
  });
});
