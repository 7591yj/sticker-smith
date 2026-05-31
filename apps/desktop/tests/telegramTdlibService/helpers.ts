import type { TelegramTdlibService } from "../../src/main/services/telegram/tdlib/service";

export type TdlibClientMock = {
  invoke: (request: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
  isClosed: () => boolean;
};

export type TestableTelegramTdlibService = TelegramTdlibService & {
  client: TdlibClientMock | null;
  loadTdlibModules: () => Promise<{
    configure: (options: Record<string, unknown>) => void;
    createBareClient: () => TdlibClientMock;
    tdjson: string;
  }>;
};

export function createTestService(Service: typeof TelegramTdlibService) {
  return new Service() as TestableTelegramTdlibService;
}

export function createServiceWithClient(
  Service: typeof TelegramTdlibService,
  invoke: (request: Record<string, unknown>) => Promise<unknown>,
) {
  const requests: Array<Record<string, unknown>> = [];
  const service = new Service() as TelegramTdlibService & {
    client: { invoke: (request: Record<string, unknown>) => Promise<unknown> };
    getSessionUser?: () => Promise<{ id: number }>;
  };

  service.client = {
    invoke: async (request: Record<string, unknown>) => {
      requests.push(request);
      return invoke(request);
    },
  };

  return { requests, service };
}

export function createOkServiceWithClient(
  Service: typeof TelegramTdlibService,
) {
  return createServiceWithClient(Service, async () => ({ _: "ok" }));
}

export function createStartupTestService(
  Service: typeof TelegramTdlibService,
  options: { repeatWaitStateUpdate?: boolean } = {},
) {
  const requests: Array<Record<string, unknown>> = [];
  let updateListener: ((update: Record<string, unknown>) => void) | null = null;
  const service = createTestService(Service);

  service.loadTdlibModules = async () => ({
    configure: () => undefined,
    tdjson: "/tmp/tdjson",
    createBareClient: () => ({
      invoke: async (request: Record<string, unknown>) => {
        requests.push(request);
        if (request._ === "getAuthorizationState") {
          if (options.repeatWaitStateUpdate) {
            queueMicrotask(() => {
              updateListener?.({
                _: "updateAuthorizationState",
                authorization_state: {
                  _: "authorizationStateWaitTdlibParameters",
                },
              });
            });
          }
          return { _: "authorizationStateWaitTdlibParameters" };
        }
        if (request._ === "setTdlibParameters") return { _: "ok" };
        return null;
      },
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (event === "update") {
          updateListener = listener as (
            update: Record<string, unknown>,
          ) => void;
        }
      },
      close: async () => undefined,
      isClosed: () => false,
    }),
  });

  return { requests, service };
}

export function tdlibCredentials() {
  return {
    apiId: 12345,
    apiHash: "0123456789abcdef0123456789abcdef",
    phoneNumber: null,
    databaseDirectory: "/tmp/sticker-smith-tdlib-db",
    filesDirectory: "/tmp/sticker-smith-tdlib-files",
    databaseEncryptionKey: "encryption-key",
  };
}
