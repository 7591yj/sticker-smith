import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramEvent } from "@sticker-smith/shared";
import { App } from "../src/renderer/App";

function createConnectedTelegramState() {
  return {
    backend: "tdlib" as const,
    status: "connected" as const,
    authStep: "ready" as const,
    selectedMode: "user" as const,
    recommendedMode: "user" as const,
    message: "Telegram is connected.",
    tdlib: {
      apiId: "12345",
      apiHashConfigured: true,
    },
    user: {
      phoneNumber: "+12025550123",
    },
    sessionUser: {
      id: 1,
      username: "stickersmith",
      displayName: "Sticker Smith",
    },
    lastError: null,
    updatedAt: "2026-03-12T00:00:00.000Z",
  };
}

function createDisconnectedTelegramState() {
  return {
    backend: "tdlib" as const,
    status: "disconnected" as const,
    authStep: "wait_tdlib_parameters" as const,
    selectedMode: "user" as const,
    recommendedMode: "user" as const,
    message: "Telegram is disconnected.",
    tdlib: {
      apiId: null,
      apiHashConfigured: false,
    },
    user: {
      phoneNumber: null,
    },
    sessionUser: null,
    lastError: null,
    updatedAt: "2026-03-12T00:01:00.000Z",
  };
}

describe("app telegram pack refresh", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("refreshes the sidebar packs after telegram logout state changes", async () => {
    let listener: ((event: TelegramEvent) => void) | null = null;
    const syncOwnedPacks = vi.fn(async () => undefined);
    let packs = [
      {
        id: "local-pack",
        source: "local" as const,
        name: "Local Pack",
        slug: "local-pack",
        rootPath: "/tmp/local-pack",
        sourceRoot: "/tmp/local-pack/source",
        outputRoot: "/tmp/local-pack/webm",
        iconAssetId: null,
        thumbnailPath: null,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      },
      {
        id: "telegram-pack",
        source: "telegram" as const,
        name: "Telegram Pack",
        slug: "telegram-pack",
        rootPath: "/tmp/telegram-pack",
        sourceRoot: "/tmp/telegram-pack/source",
        outputRoot: "/tmp/telegram-pack/webm",
        iconAssetId: null,
        thumbnailPath: null,
        telegram: {
          stickerSetId: "100",
          shortName: "telegram_pack",
          title: "Telegram Pack",
          format: "video" as const,
          syncState: "idle" as const,
          lastSyncedAt: "2026-03-12T00:00:00.000Z",
          lastSyncError: null,
          publishedFromLocalPackId: null,
        },
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      },
    ];

    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => createConnectedTelegramState()),
          subscribe: vi.fn((nextListener: (event: TelegramEvent) => void) => {
            listener = nextListener;
            return () => undefined;
          }),
          syncOwnedPacks,
        },
        packs: {
          list: vi.fn(async () => packs),
          get: vi.fn(async (packId: string) => ({
            pack: packs.find((pack) => pack.id === packId) ?? packs[0],
            assets: [],
            outputs: [],
          })),
        },
        assets: {},
        conversion: {
          subscribe: vi.fn(() => () => undefined),
        },
        outputs: {},
        settings: {},
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Telegram Pack");

    packs = [packs[0]!];

    await act(async () => {
      listener?.({
        type: "auth_state_changed",
        state: createDisconnectedTelegramState(),
      });
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain("Telegram Pack");

    await act(async () => {
      root.unmount();
    });
  });

  it("syncs owned telegram packs when a connected session is restored on startup", async () => {
    const syncOwnedPacks = vi.fn(async () => undefined);

    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => createConnectedTelegramState()),
          subscribe: vi.fn(() => () => undefined),
          syncOwnedPacks,
        },
        packs: {
          list: vi.fn(async () => []),
          get: vi.fn(),
        },
        assets: {},
        conversion: {
          subscribe: vi.fn(() => () => undefined),
        },
        outputs: {},
        settings: {},
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    expect(syncOwnedPacks).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it("syncs owned telegram packs once per connected session transition", async () => {
    let listener: ((event: TelegramEvent) => void) | null = null;
    const syncOwnedPacks = vi.fn(async () => undefined);

    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => createDisconnectedTelegramState()),
          subscribe: vi.fn((nextListener: (event: TelegramEvent) => void) => {
            listener = nextListener;
            return () => undefined;
          }),
          syncOwnedPacks,
        },
        packs: {
          list: vi.fn(async () => []),
          get: vi.fn(),
        },
        assets: {},
        conversion: {
          subscribe: vi.fn(() => () => undefined),
        },
        outputs: {},
        settings: {},
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    expect(syncOwnedPacks).not.toHaveBeenCalled();

    await act(async () => {
      listener?.({
        type: "auth_state_changed",
        state: createConnectedTelegramState(),
      });
      await Promise.resolve();
    });

    expect(syncOwnedPacks).toHaveBeenCalledTimes(1);

    await act(async () => {
      listener?.({
        type: "auth_state_changed",
        state: createConnectedTelegramState(),
      });
      await Promise.resolve();
    });

    expect(syncOwnedPacks).toHaveBeenCalledTimes(1);

    await act(async () => {
      listener?.({
        type: "auth_state_changed",
        state: createDisconnectedTelegramState(),
      });
      await Promise.resolve();
    });

    await act(async () => {
      listener?.({
        type: "auth_state_changed",
        state: createConnectedTelegramState(),
      });
      await Promise.resolve();
    });

    expect(syncOwnedPacks).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });
});
