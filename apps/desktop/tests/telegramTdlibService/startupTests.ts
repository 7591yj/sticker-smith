import { expect, it, vi } from "vitest";
import { TelegramTdlibService } from "../../src/main/services/telegram/tdlib/service";
import {
  createStartupTestService,
  createTestService,
  tdlibCredentials,
} from "./helpers";

export function registerStartupTests() {
  it("sends the required tdlib parameter defaults during initialization", async () => {
    const { requests, service } =
      createStartupTestService(TelegramTdlibService);

    await service.ensureStarted(tdlibCredentials());

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
    const { requests, service } = createStartupTestService(
      TelegramTdlibService,
      {
        repeatWaitStateUpdate: true,
      },
    );

    await service.ensureStarted(tdlibCredentials());

    expect(
      requests.filter((request) => request._ === "setTdlibParameters"),
    ).toHaveLength(1);
  });

  it("configures tdlib only once across client restarts", async () => {
    vi.resetModules();
    const { TelegramTdlibService: FreshTelegramTdlibService } =
      await import("../../src/main/services/telegram/tdlib/service");
    let configureCount = 0;
    let closed = false;
    const service = createTestService(FreshTelegramTdlibService);

    service.loadTdlibModules = async () => ({
      configure: () => {
        configureCount += 1;
      },
      tdjson: "/tmp/tdjson",
      createBareClient: () => {
        closed = false;
        return {
          invoke: async (request: Record<string, unknown>) => {
            if (request._ === "getAuthorizationState")
              return { _: "authorizationStateWaitTdlibParameters" };
            if (request._ === "setTdlibParameters") return { _: "ok" };
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

    const credentials = tdlibCredentials();

    await service.ensureStarted(credentials);
    await service.close();
    await service.ensureStarted(credentials);

    expect(configureCount).toBe(1);
  });

  it("closes the tdlib client when initialization fails", async () => {
    let closed = false;
    const service = createTestService(TelegramTdlibService);

    service.loadTdlibModules = async () => ({
      configure: () => undefined,
      tdjson: "/tmp/tdjson",
      createBareClient: () => ({
        invoke: async (request: Record<string, unknown>) => {
          if (request._ === "getAuthorizationState")
            return { _: "authorizationStateWaitTdlibParameters" };
          if (request._ === "setTdlibParameters")
            throw new Error("Wrong character in the string");
          return null;
        },
        on: () => undefined,
        close: async () => {
          closed = true;
        },
        isClosed: () => closed,
      }),
    });

    await expect(service.ensureStarted(tdlibCredentials())).rejects.toThrow(
      "Wrong character in the string",
    );

    expect(closed).toBe(true);
    expect(service.client).toBeNull();
  });
}
