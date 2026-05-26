import { act } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";
import type { StickerPack, TelegramEvent, TelegramPackSummary } from "@sticker-smith/shared";
import { App } from "../src/renderer/App";

export function createConnectedTelegramState() {
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

export function createDisconnectedTelegramState() {
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

type TelegramState =
  | ReturnType<typeof createConnectedTelegramState>
  | ReturnType<typeof createDisconnectedTelegramState>;

export function createPack(overrides: Partial<StickerPack> = {}): StickerPack {
  return {
    id: "pack-1",
    source: "local",
    name: "Sample Pack",
    slug: "sample-pack",
    rootPath: "/tmp/sample-pack",
    iconStickerId: null,
    thumbnailPath: null,
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    ...overrides,
  };
}

export function createTelegramMetadata(
  overrides: Partial<TelegramPackSummary> = {},
): TelegramPackSummary {
  return {
    stickerSetId: "100",
    shortName: "telegram_pack",
    title: "Telegram Pack",
    format: "video",
    syncState: "synced",
    lastSyncedAt: "2026-03-12T00:00:00.000Z",
    lastSyncError: null,
    publishedFromLocalPackId: null,
    ...overrides,
  };
}

export function createTelegramPack(overrides: Partial<StickerPack> = {}): StickerPack {
  return createPack({
    id: "telegram-pack",
    source: "telegram",
    name: "Telegram Pack",
    slug: "telegram-pack",
    rootPath: "/tmp/telegram-pack",
    telegram: createTelegramMetadata(overrides.telegram),
    ...overrides,
  });
}

type PackLike = { id: string };

export function installStickerSmithMock({
  getState,
  subscribe = () => () => undefined,
  syncOwnedPacks,
  list = async () => [],
  get = async (packId: string) => {
    const packs = await list();
    return {
      pack: packs.find((pack) => pack.id === packId) ?? packs[0],
      stickers: [],
    };
  },
}: {
  getState: () => Promise<TelegramState>;
  subscribe?: (nextListener: (event: TelegramEvent) => void) => () => undefined;
  syncOwnedPacks: ReturnType<typeof vi.fn>;
  list?: () => Promise<PackLike[]>;
  get?: (packId: string) => Promise<{ pack: PackLike | undefined; stickers: never[] }>;
}) {
  Object.assign(window, {
    stickerSmith: {
      telegram: {
        getState: vi.fn(getState),
        subscribe: vi.fn(subscribe),
        syncOwnedPacks,
      },
      packs: {
        list: vi.fn(list),
        get: vi.fn(get),
      },
      conversion: {
        subscribe: vi.fn(() => () => undefined),
      },
      settings: {},
    },
  });
}

export async function renderApp(waitForEffects = () => Promise.resolve()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App />);
    await waitForEffects();
  });

  return { container, root };
}
