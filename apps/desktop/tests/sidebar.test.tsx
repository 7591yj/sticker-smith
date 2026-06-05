import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ComponentProps } from "react";
import type { TelegramState } from "@sticker-smith/shared";

import { Sidebar } from "../src/renderer/components/Sidebar";
import { createPack, createTelegramMetadata } from "./helpers";

type SidebarProps = ComponentProps<typeof Sidebar>;

function renderSidebarMarkup(overrides: Partial<SidebarProps> = {}) {
  return renderToStaticMarkup(
    <Sidebar
      packs={[]}
      telegramState={createTelegramState()}
      telegramSyncInProgress={false}
      telegramSyncRecommended={false}
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
      {...overrides}
    />,
  );
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
    const markup = renderSidebarMarkup({
        packs: [
          createPack({
            source: "telegram",
            telegram: createTelegramMetadata({ stickerSetId: "100", shortName: "telegram_pack", title: "Telegram Pack", format: "video", syncState: "synced" }),
          }),
        ],
        telegramState: createTelegramState(),
      });

    expect(markup).toContain("fallback pack icon");
    expect(markup).toContain("telegram_pack");
  });

  it("renders webm pack thumbnails as video previews", () => {
    const markup = renderSidebarMarkup({
        packs: [
          createPack({
            source: "telegram",
            thumbnailPath: "/tmp/sample-pack/webm/icon.webm",
            telegram: createTelegramMetadata({ stickerSetId: "100", shortName: "telegram_pack", title: "Telegram Pack", format: "video", syncState: "synced" }),
          }),
        ],
        telegramState: createTelegramState(),
      });

    expect(markup).toContain("<video");
    expect(markup).toContain("icon.webm");
  });

  it("renders a reset telegram action while disconnected", () => {
    const markup = renderSidebarMarkup({
        packs: [],
        telegramState: createTelegramState(),
      });

    expect(markup).toContain('aria-label="Telegram account"');
    expect(markup).toContain('aria-label="Sync"');
    expect(markup).not.toContain(">Reset Telegram<");
    expect(markup).not.toContain(">Logout<");
  });

  it("renders telegram packs by default and keeps source filters in the header", () => {
    const markup = renderSidebarMarkup({
        packs: [
          createPack({ id: "local-pack", name: "Local Pack", source: "local" }),
          createPack({
            id: "telegram-pack",
            name: "Telegram Pack",
            source: "telegram",
            telegram: createTelegramMetadata({ stickerSetId: "100", shortName: "telegram_pack", title: "Telegram Pack", format: "video", syncState: "stale" }),
          }),
        ],
        telegramState: createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          message: "Telegram is connected.",
        }),
      });

    expect(markup).toContain('aria-label="Local"');
    expect(markup).toContain('aria-label="Telegram"');
    expect(markup).not.toContain('aria-label="Telegram (Unsupported)"');
    expect(markup).not.toContain("Local Pack");
    expect(markup).toContain("Telegram Pack");
    expect(markup).toContain('aria-label="Telegram account"');
    expect(markup).toContain('aria-label="Refresh"');
    expect(markup).not.toContain("Short name not set");
    expect(markup).toContain("telegram_pack");
    expect(markup).toContain("Needs update");
    expect(markup).not.toContain("Telegram is connected.");
    expect(markup).not.toContain(">Connected<");
  });

  it("renders telegram packs by default when there are no local packs", () => {
    const markup = renderSidebarMarkup({
        packs: [
          createPack({
            id: "telegram-pack",
            name: "Telegram Pack",
            source: "telegram",
            telegram: createTelegramMetadata({ stickerSetId: "100", shortName: "telegram_pack", title: "Telegram Pack", format: "video", syncState: "stale" }),
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
        ],
        telegramState: createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          message: "Telegram is connected.",
        }),
      });

    expect(markup).toContain('aria-label="Telegram"');
    expect(markup).not.toContain('aria-label="Telegram (Unsupported)"');
    expect(markup).toContain("Show unsupported stickers");
    expect(markup).toContain("Telegram Pack");
    expect(markup).not.toContain("Static Pack");
    expect(markup).toContain("Needs update");
  });

  it("renders sync-in-progress while telegram mirrors are syncing", () => {
    const markup = renderSidebarMarkup({
        packs: [
          createPack({
            id: "telegram-pack",
            name: "Telegram Pack",
            source: "telegram",
            telegram: createTelegramMetadata({ stickerSetId: "100", shortName: "telegram_pack", title: "Telegram Pack", format: "video", syncState: "syncing" }),
          }),
        ],
        telegramState: createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          message: "Telegram is connected.",
        }),
      });

    expect(markup).toContain("Sync in progress");
    expect(markup).toContain("Syncing");
  });

  it("renders sync-in-progress even before any telegram packs exist", () => {
    const markup = renderSidebarMarkup({
        packs: [],
        telegramState: createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          message: "Telegram is connected.",
        }),
        telegramSyncInProgress: true,
      });

    expect(markup).toContain("Sync in progress");
  });

  it("renders the sync icon in red when a manual sync is needed", () => {
    const markup = renderSidebarMarkup({
        packs: [],
        telegramState: createTelegramState({
          status: "connected",
          authStep: "ready",
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
        }),
        telegramSyncRecommended: true,
      });

    expect(markup).toContain('aria-label="Sync needed"');
  });
});
