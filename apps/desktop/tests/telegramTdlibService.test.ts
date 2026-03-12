import { describe, expect, it, vi } from "vitest";

import { TelegramTdlibService } from "../src/main/services/telegramTdlibService";

describe("TelegramTdlibService", () => {
  it("sends the required tdlib parameter defaults during initialization", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
        on: (event: string, listener: (...args: unknown[]) => void) => void;
        close: () => Promise<void>;
        isClosed: () => boolean;
      } | null;
      loadTdlibModules: () => Promise<{
        configure: (options: Record<string, unknown>) => void;
        createBareClient: () => {
          invoke: (request: Record<string, unknown>) => Promise<unknown>;
          on: (event: string, listener: (...args: unknown[]) => void) => void;
          close: () => Promise<void>;
          isClosed: () => boolean;
        };
        tdjson: string;
      }>;
    };

    service.loadTdlibModules = async () => ({
      configure: () => undefined,
      tdjson: "/tmp/tdjson",
      createBareClient: () => ({
        invoke: async (request: Record<string, unknown>) => {
          requests.push(request);
          if (request._ === "getAuthorizationState") {
            return { _: "authorizationStateWaitTdlibParameters" };
          }

          if (request._ === "setTdlibParameters") {
            return { _: "ok" };
          }

          return null;
        },
        on: () => undefined,
        close: async () => undefined,
        isClosed: () => false,
      }),
    });

    await service.ensureStarted({
      apiId: 12345,
      apiHash: "0123456789abcdef0123456789abcdef",
      phoneNumber: null,
      databaseDirectory: "/tmp/sticker-smith-tdlib-db",
      filesDirectory: "/tmp/sticker-smith-tdlib-files",
      databaseEncryptionKey: "encryption-key",
    });

    expect(requests[1]).toEqual({
      _: "setTdlibParameters",
      use_test_dc: false,
      database_directory: "/tmp/sticker-smith-tdlib-db",
      files_directory: "/tmp/sticker-smith-tdlib-files",
      database_encryption_key: "encryption-key",
      use_message_database: true,
      use_secret_chats: false,
      system_language_code: "en",
      application_version: "1.0",
      device_model: "Unknown device",
      system_version: "Unknown",
      api_id: 12345,
      api_hash: "0123456789abcdef0123456789abcdef",
    });
  });

  it("submits tdlib parameters only once when startup repeats the wait state", async () => {
    const requests: Array<Record<string, unknown>> = [];
    let updateListener: ((update: Record<string, unknown>) => void) | null = null;
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
        on: (event: string, listener: (...args: unknown[]) => void) => void;
        close: () => Promise<void>;
        isClosed: () => boolean;
      } | null;
      loadTdlibModules: () => Promise<{
        configure: (options: Record<string, unknown>) => void;
        createBareClient: () => {
          invoke: (request: Record<string, unknown>) => Promise<unknown>;
          on: (event: string, listener: (...args: unknown[]) => void) => void;
          close: () => Promise<void>;
          isClosed: () => boolean;
        };
        tdjson: string;
      }>;
    };

    service.loadTdlibModules = async () => ({
      configure: () => undefined,
      tdjson: "/tmp/tdjson",
      createBareClient: () => ({
        invoke: async (request: Record<string, unknown>) => {
          requests.push(request);
          if (request._ === "getAuthorizationState") {
            queueMicrotask(() => {
              updateListener?.({
                _: "updateAuthorizationState",
                authorization_state: {
                  _: "authorizationStateWaitTdlibParameters",
                },
              });
            });
            return { _: "authorizationStateWaitTdlibParameters" };
          }

          if (request._ === "setTdlibParameters") {
            return { _: "ok" };
          }

          return null;
        },
        on: (event: string, listener: (...args: unknown[]) => void) => {
          if (event === "update") {
            updateListener = listener as (update: Record<string, unknown>) => void;
          }
        },
        close: async () => undefined,
        isClosed: () => false,
      }),
    });

    await service.ensureStarted({
      apiId: 12345,
      apiHash: "0123456789abcdef0123456789abcdef",
      phoneNumber: null,
      databaseDirectory: "/tmp/sticker-smith-tdlib-db",
      filesDirectory: "/tmp/sticker-smith-tdlib-files",
      databaseEncryptionKey: "encryption-key",
    });

    expect(
      requests.filter((request) => request._ === "setTdlibParameters"),
    ).toHaveLength(1);
  });

  it("configures tdlib only once across client restarts", async () => {
    vi.resetModules();
    const { TelegramTdlibService: FreshTelegramTdlibService } = await import(
      "../src/main/services/telegramTdlibService"
    );
    let configureCount = 0;
    let closed = false;
    const service = new FreshTelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
        on: (event: string, listener: (...args: unknown[]) => void) => void;
        close: () => Promise<void>;
        isClosed: () => boolean;
      } | null;
      loadTdlibModules: () => Promise<{
        configure: (options: Record<string, unknown>) => void;
        createBareClient: () => {
          invoke: (request: Record<string, unknown>) => Promise<unknown>;
          on: (event: string, listener: (...args: unknown[]) => void) => void;
          close: () => Promise<void>;
          isClosed: () => boolean;
        };
        tdjson: string;
      }>;
    };

    service.loadTdlibModules = async () => ({
      configure: () => {
        configureCount += 1;
      },
      tdjson: "/tmp/tdjson",
      createBareClient: () => {
        closed = false;
        return {
          invoke: async (request: Record<string, unknown>) => {
            if (request._ === "getAuthorizationState") {
              return { _: "authorizationStateWaitTdlibParameters" };
            }

            if (request._ === "setTdlibParameters") {
              return { _: "ok" };
            }

            return null;
          },
          on: () => undefined,
          close: async () => {
            closed = true;
          },
          isClosed: () => closed,
        };
      },
    });

    const credentials = {
      apiId: 12345,
      apiHash: "0123456789abcdef0123456789abcdef",
      phoneNumber: null,
      databaseDirectory: "/tmp/sticker-smith-tdlib-db",
      filesDirectory: "/tmp/sticker-smith-tdlib-files",
      databaseEncryptionKey: "encryption-key",
    };

    await service.ensureStarted(credentials);
    await service.close();
    await service.ensureStarted(credentials);

    expect(configureCount).toBe(1);
  });

  it("closes the tdlib client when initialization fails", async () => {
    let closed = false;
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
        on: (event: string, listener: (...args: unknown[]) => void) => void;
        close: () => Promise<void>;
        isClosed: () => boolean;
      } | null;
      loadTdlibModules: () => Promise<{
        configure: (options: Record<string, unknown>) => void;
        createBareClient: () => {
          invoke: (request: Record<string, unknown>) => Promise<unknown>;
          on: (event: string, listener: (...args: unknown[]) => void) => void;
          close: () => Promise<void>;
          isClosed: () => boolean;
        };
        tdjson: string;
      }>;
    };

    service.loadTdlibModules = async () => ({
      configure: () => undefined,
      tdjson: "/tmp/tdjson",
      createBareClient: () => ({
        invoke: async (request: Record<string, unknown>) => {
          if (request._ === "getAuthorizationState") {
            return { _: "authorizationStateWaitTdlibParameters" };
          }

          if (request._ === "setTdlibParameters") {
            throw new Error("Wrong character in the string");
          }

          return null;
        },
        on: () => undefined,
        close: async () => {
          closed = true;
        },
        isClosed: () => closed,
      }),
    });

    await expect(
      service.ensureStarted({
        apiId: 12345,
        apiHash: "0123456789abcdef0123456789abcdef",
        phoneNumber: null,
        databaseDirectory: "/tmp/sticker-smith-tdlib-db",
        filesDirectory: "/tmp/sticker-smith-tdlib-files",
        databaseEncryptionKey: "encryption-key",
      }),
    ).rejects.toThrow("Wrong character in the string");

    expect(closed).toBe(true);
    expect(service.client).toBeNull();
  });

  it("requests file downloads with a positive limit", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
      };
    };

    service.client = {
      invoke: async (request: Record<string, unknown>) => {
        requests.push(request);
        return {
          id: 42,
          local: {
            is_downloading_completed: true,
            path: "/tmp/sticker.webp",
          },
          size: 128,
        };
      },
    };

    await service.downloadFile(42);

    expect(requests).toEqual([
      {
        _: "downloadFile",
        file_id: 42,
        priority: 32,
        offset: 0,
        limit: 1_000_000_000,
        synchronous: false,
      },
    ]);
  });

  it("requests owned sticker sets with a positive page limit", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
      };
    };

    service.client = {
      invoke: async (request: Record<string, unknown>) => {
        requests.push(request);
        if (request._ === "getOwnedStickerSets") {
          return {
            sets: [{ id: 123 }],
          };
        }

        if (request._ === "getStickerSet") {
          return {
            id: 123,
            name: "sample_pack_by_test",
            title: "Sample Pack",
            sticker_type: { _: "stickerTypeRegular" },
            sticker_format: { _: "stickerFormatWebm" },
            thumbnail: null,
            stickers: [],
          };
        }

        return null;
      },
    };

    await service.getOwnedStickerSets();

    expect(requests[0]).toEqual({
      _: "getOwnedStickerSets",
      offset_sticker_set_id: "0",
      limit: 100,
    });
  });

  it("preserves large sticker set ids without numeric coercion", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
      };
    };

    service.client = {
      invoke: async (request: Record<string, unknown>) => {
        requests.push(request);
        return {
          id: "2706894883376857121",
          name: "sample_pack_by_test",
          title: "Sample Pack",
          sticker_type: { _: "stickerTypeRegular" },
          sticker_format: { _: "stickerFormatWebm" },
          thumbnail: null,
          stickers: [],
        };
      },
    };

    await service.getStickerSet("2706894883376857121");

    expect(requests).toEqual([
      {
        _: "getStickerSet",
        set_id: "2706894883376857121",
      },
    ]);
  });

  it("rejects occupied Telegram sticker set names", async () => {
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
      };
    };

    service.client = {
      invoke: async () => ({ _: "checkStickerSetNameResultNameOccupied" }),
    };

    await expect(service.checkStickerSetName("sample_pack")).rejects.toThrow(
      "A Telegram sticker set with that short name already exists.",
    );
  });

  it("rejects invalid Telegram sticker set names", async () => {
    const service = new TelegramTdlibService() as TelegramTdlibService & {
      client: {
        invoke: (request: Record<string, unknown>) => Promise<unknown>;
      };
    };

    service.client = {
      invoke: async () => ({ _: "checkStickerSetNameResultNameInvalid" }),
    };

    await expect(service.checkStickerSetName("bad")).rejects.toThrow(
      "The Telegram sticker short name is invalid.",
    );
  });
});
