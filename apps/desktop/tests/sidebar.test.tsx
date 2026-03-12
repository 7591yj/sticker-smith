import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { StickerPack, TelegramState } from "@sticker-smith/shared";

import { Sidebar } from "../src/renderer/components/Sidebar";

function createPack(overrides: Partial<StickerPack> = {}): StickerPack {
  return {
    id: "pack-1",
    source: "local",
    name: "Sample Pack",
    slug: "sample-pack",
    rootPath: "/tmp/sample-pack",
    sourceRoot: "/tmp/sample-pack/source",
    outputRoot: "/tmp/sample-pack/webm",
    iconAssetId: null,
    thumbnailPath: null,
    createdAt: "2026-03-11T00:00:00.000Z",
    updatedAt: "2026-03-11T00:00:00.000Z",
    ...overrides,
  };
}

function createTelegramState(
  overrides: Partial<TelegramState> = {},
): TelegramState {
  return {
    backend: "tdlib",
    status: "disconnected",
    authStep: "wait_tdlib_parameters",
    selectedMode: "user",
    recommendedMode: "user",
    message: "Enter your Telegram api_id and api_hash to start a user session and sync owned sticker packs.",
    tdlib: {
      apiId: null,
      apiHashConfigured: false,
    },
    user: {
      phoneNumber: null,
    },
    sessionUser: null,
    lastError: null,
    updatedAt: "2026-03-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("Sidebar", () => {
  it("renders a fallback pack icon when no thumbnail exists", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[createPack()]}
        telegramState={createTelegramState()}
        telegramSyncInProgress={false}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onResetTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("fallback pack icon");
  });

  it("renders webm pack thumbnails as video previews", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[
          createPack({ thumbnailPath: "/tmp/sample-pack/webm/icon.webm" }),
        ]}
        telegramState={createTelegramState()}
        telegramSyncInProgress={false}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onResetTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("<video");
    expect(markup).toContain("icon.webm");
  });

  it("renders a reset telegram action while disconnected", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[]}
        telegramState={createTelegramState()}
        telegramSyncInProgress={false}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onResetTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Telegram account"');
    expect(markup).toContain('aria-label="Sync"');
    expect(markup).toContain("color:error.main");
    expect(markup).not.toContain(">Reset Telegram<");
    expect(markup).not.toContain(">Logout<");
  });

  it("renders separate local and telegram sections", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[
          createPack({ id: "local-pack", name: "Local Pack", source: "local" }),
          createPack({
            id: "telegram-pack",
            name: "Telegram Pack",
            source: "telegram",
            telegram: {
              stickerSetId: "100",
              shortName: "telegram_pack",
              title: "Telegram Pack",
              format: "video",
              syncState: "stale",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError: null,
              publishedFromLocalPackId: null,
            },
          }),
        ]}
        telegramState={createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          message: "Telegram is connected.",
        })}
        telegramSyncInProgress={false}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onResetTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("Local");
    expect(markup).toContain("Telegram");
    expect(markup).toContain("Local Pack");
    expect(markup).toContain("Telegram Pack");
    expect(markup).toContain('aria-label="Telegram account"');
    expect(markup).toContain('aria-label="Resync"');
    expect(markup).toContain("Needs update");
    expect(markup).not.toContain("Telegram is connected.");
    expect(markup).not.toContain(">Connected<");
  });

  it("renders unsupported telegram packs in a separate section", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[
          createPack({
            id: "telegram-pack",
            name: "Telegram Pack",
            source: "telegram",
            telegram: {
              stickerSetId: "100",
              shortName: "telegram_pack",
              title: "Telegram Pack",
              format: "video",
              syncState: "stale",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError: null,
              publishedFromLocalPackId: null,
            },
          }),
          createPack({
            id: "unsupported-pack",
            name: "Static Pack",
            source: "telegram",
            telegram: {
              stickerSetId: "200",
              shortName: "static_pack",
              title: "Static Pack",
              format: "static",
              syncState: "unsupported",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError:
                'Telegram pack "Static Pack" uses static stickers, and only video sticker packs are supported currently.',
              publishedFromLocalPackId: null,
            },
          }),
        ]}
        telegramState={createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          message: "Telegram is connected.",
        })}
        telegramSyncInProgress={false}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onResetTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("Telegram");
    expect(markup).toContain("Telegram (Unsupported)");
    expect(markup).toContain("Telegram Pack");
    expect(markup).toContain("Static Pack");
    expect(markup).toContain("Needs update");
    expect(markup).toContain("Unsupported");
  });

  it("renders sync-in-progress while telegram mirrors are syncing", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[
          createPack({
            id: "telegram-pack",
            name: "Telegram Pack",
            source: "telegram",
            telegram: {
              stickerSetId: "100",
              shortName: "telegram_pack",
              title: "Telegram Pack",
              format: "video",
              syncState: "syncing",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError: null,
              publishedFromLocalPackId: null,
            },
          }),
        ]}
        telegramState={createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          message: "Telegram is connected.",
        })}
        telegramSyncInProgress={false}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onResetTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("Sync in progress");
    expect(markup).toContain("Syncing");
  });

  it("renders sync-in-progress even before any telegram packs exist", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[]}
        telegramState={createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          message: "Telegram is connected.",
        })}
        telegramSyncInProgress={true}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onResetTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("Sync in progress");
  });
});
