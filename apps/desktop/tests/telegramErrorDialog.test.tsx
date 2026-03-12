import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramEvent } from "@sticker-smith/shared";
import { App } from "../src/renderer/App";

describe("telegram error dialog", () => {
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

  it("opens a dialog when telegram publish fails", async () => {
    let listener: ((event: TelegramEvent) => void) | null = null;

    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => ({
            backend: "tdlib",
            status: "connected",
            authStep: "ready",
            selectedMode: "user",
            recommendedMode: "user",
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
          })),
          subscribe: vi.fn((nextListener: (event: TelegramEvent) => void) => {
            listener = nextListener;
            return () => undefined;
          }),
          syncOwnedPacks: vi.fn(async () => undefined),
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

    await act(async () => {
      listener?.({
        type: "publish_failed",
        localPackId: "pack-1",
        error: "A Telegram sticker set with that short name already exists.",
      });
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Telegram upload failed");
    expect(document.body.textContent).toContain(
      "A Telegram sticker set with that short name already exists.",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("opens a dialog when telegram startup fails", async () => {
    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => {
            throw new Error("Telegram secret storage is unavailable.");
          }),
          subscribe: vi.fn(() => () => undefined),
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

    expect(document.body.textContent).toContain("Telegram startup failed");
    expect(document.body.textContent).toContain(
      "Telegram secret storage is unavailable.",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("opens a dialog when telegram logout fails", async () => {
    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => ({
            backend: "tdlib",
            status: "connected",
            authStep: "ready",
            selectedMode: "user",
            recommendedMode: "user",
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
          })),
          logout: vi.fn(async () => {
            throw new Error("The Telegram session could not be closed.");
          }),
          subscribe: vi.fn(() => () => undefined),
          syncOwnedPacks: vi.fn(async () => undefined),
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

    const logoutButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Logout"),
    );
    expect(logoutButton).toBeDefined();

    await act(async () => {
      logoutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Telegram logout failed");
    expect(document.body.textContent).toContain(
      "The Telegram session could not be closed.",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("opens a dialog when telegram update fails before any event is emitted", async () => {
    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => ({
            backend: "tdlib",
            status: "connected",
            authStep: "ready",
            selectedMode: "user",
            recommendedMode: "user",
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
          })),
          updateTelegramPack: vi.fn(async () => {
            throw new Error("Telegram is not connected.");
          }),
          subscribe: vi.fn(() => () => undefined),
          syncOwnedPacks: vi.fn(async () => undefined),
        },
        packs: {
          list: vi.fn(async () => [
            {
              id: "telegram-pack",
              source: "telegram",
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
                format: "video",
                syncState: "idle",
                lastSyncedAt: "2026-03-12T00:00:00.000Z",
                lastSyncError: null,
                publishedFromLocalPackId: null,
              },
              createdAt: "2026-03-12T00:00:00.000Z",
              updatedAt: "2026-03-12T00:00:00.000Z",
            },
          ]),
          get: vi.fn(async () => ({
            pack: {
              id: "telegram-pack",
              source: "telegram",
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
                format: "video",
                syncState: "idle",
                lastSyncedAt: "2026-03-12T00:00:00.000Z",
                lastSyncError: null,
                publishedFromLocalPackId: null,
              },
              createdAt: "2026-03-12T00:00:00.000Z",
              updatedAt: "2026-03-12T00:00:00.000Z",
            },
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

    const updateButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Update"),
    );
    expect(updateButton).toBeDefined();

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Telegram update failed");
    expect(document.body.textContent).toContain("Telegram is not connected.");

    await act(async () => {
      root.unmount();
    });
  });
});
