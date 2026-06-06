import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramEvent } from "@sticker-smith/shared";
import {
  createConnectedTelegramState,
  createDisconnectedTelegramState,
  createPack,
  createTelegramMetadata,
  createTelegramPack,
  installStickerSmithMock,
  renderApp,
} from "./helpers";

async function renderWithTelegramPacks(initialPacks = [
  createPack({ id: "local-pack", name: "Local Pack", slug: "local-pack", rootPath: "/tmp/local-pack" }),
  createTelegramPack({ telegram: createTelegramMetadata({ syncState: "idle" }) }),
]) {
  let listener: ((event: TelegramEvent) => void) | null = null;
  const syncOwnedPacks = vi.fn(async () => undefined);
  let packs = initialPacks;

  installStickerSmithMock({
    getState: async () => createConnectedTelegramState(),
    subscribe: (nextListener) => {
      listener = nextListener;
      return () => undefined;
    },
    syncOwnedPacks,
    list: async () => packs,
  });

  return {
    ...(await renderApp()),
    emit: async (event: TelegramEvent) => act(async () => {
      listener?.(event);
      await Promise.resolve();
    }),
    setPacks: (nextPacks: typeof packs) => {
      packs = nextPacks;
    },
    syncOwnedPacks,
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
    const { root, emit, setPacks } = await renderWithTelegramPacks();

    expect(document.body.textContent).toContain("Telegram Pack");

    setPacks([createPack({ id: "local-pack", name: "Local Pack", slug: "local-pack", rootPath: "/tmp/local-pack" })]);

    await emit({
      type: "auth_state_changed",
      state: createDisconnectedTelegramState(),
    });

    expect(document.body.textContent).not.toContain("Telegram Pack");

    await act(async () => {
      root.unmount();
    });
  });

  it("syncs owned telegram packs when a connected session is restored on startup", async () => {
    const syncOwnedPacks = vi.fn(async () => undefined);

    installStickerSmithMock({
      getState: async () => createConnectedTelegramState(),
      syncOwnedPacks,
      get: vi.fn(),
    });

    const { root } = await renderApp();

    expect(syncOwnedPacks).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it("syncs owned telegram packs once per connected session transition", async () => {
    let listener: ((event: TelegramEvent) => void) | null = null;
    const syncOwnedPacks = vi.fn(async () => undefined);

    installStickerSmithMock({
      getState: async () => createDisconnectedTelegramState(),
      subscribe: (nextListener) => {
        listener = nextListener;
        return () => undefined;
      },
      syncOwnedPacks,
      get: vi.fn(),
    });

    const { root } = await renderApp();

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

  it("refreshes telegram mirror state when pack sync starts", async () => {
    const { root, emit, setPacks } = await renderWithTelegramPacks([
      createTelegramPack({ telegram: createTelegramMetadata({ syncState: "idle" }) }),
    ]);

    expect(document.body.textContent).toContain("Up to date");

    setPacks([
      createTelegramPack({ telegram: createTelegramMetadata({ syncState: "syncing" }) }),
    ]);

    await emit({
      type: "pack_sync_started",
      packId: "telegram-pack",
      stickerSetId: "100",
    });

    expect(document.body.textContent).toContain("Syncing");

    await act(async () => {
      root.unmount();
    });
  });

  it("shows uploading and updating action labels from telegram events", async () => {
    const { root, emit } = await renderWithTelegramPacks([
      createPack({ id: "local-pack", name: "Local Pack", slug: "local-pack", rootPath: "/tmp/local-pack" }),
      createTelegramPack({ telegram: createTelegramMetadata({ syncState: "stale" }) }),
    ]);

    expect(document.body.textContent).toContain("Publish to Telegram");

    await emit({
      type: "publish_started",
      localPackId: "local-pack",
    });

    expect(document.body.textContent).toContain("Publishing…");

    await emit({
      type: "publish_finished",
      localPackId: "local-pack",
      packId: "telegram-pack",
      stickerSetId: "100",
    });

    expect(document.body.textContent).toContain("Update");

    await emit({
      type: "update_started",
      packId: "telegram-pack",
      stickerSetId: "100",
    });

    expect(document.body.textContent).toContain("Updating Telegram…");

    await act(async () => {
      root.unmount();
    });
  });

  it("shows sync-in-progress during first telegram sync before mirrors exist", async () => {
    let listener: ((event: TelegramEvent) => void) | null = null;
    const syncOwnedPacks = vi.fn(async () => undefined);

    installStickerSmithMock({
      getState: async () => createConnectedTelegramState(),
      subscribe: (nextListener) => {
        listener = nextListener;
        return () => undefined;
      },
      syncOwnedPacks,
      get: vi.fn(),
    });

    const { root } = await renderApp();

    await act(async () => {
      listener?.({
        type: "sync_started",
      });
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Sync in progress");

    await act(async () => {
      root.unmount();
    });
  });
});
