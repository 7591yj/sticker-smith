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
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
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
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("<video");
    expect(markup).toContain("icon.webm");
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
              syncState: "idle",
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
        selectedPackId={null}
        onSelect={vi.fn()}
        onSubmitTelegramTdlibParameters={vi.fn(async () => undefined)}
        onSubmitTelegramPhoneNumber={vi.fn(async () => undefined)}
        onSubmitTelegramCode={vi.fn(async () => undefined)}
        onSubmitTelegramPassword={vi.fn(async () => undefined)}
        onLogoutTelegram={vi.fn(async () => undefined)}
        onSyncTelegramPacks={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("Local");
    expect(markup).toContain("Telegram");
    expect(markup).toContain("Local Pack");
    expect(markup).toContain("Telegram Pack");
    expect(markup).toContain("Connected");
    expect(markup).toContain("Sticker Smith (@stickersmith)");
    expect(markup).toContain("Manage Telegram");
    expect(markup).toContain("Resync");
  });
});
