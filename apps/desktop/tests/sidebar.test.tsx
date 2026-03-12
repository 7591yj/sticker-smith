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
    selectedMode: null,
    recommendedMode: "user",
    message: "User login is recommended.",
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
        onSelectTelegramAuthMode={vi.fn(async () => undefined)}
        onDisconnectTelegram={vi.fn(async () => undefined)}
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
        onSelectTelegramAuthMode={vi.fn(async () => undefined)}
        onDisconnectTelegram={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("<video");
    expect(markup).toContain("icon.webm");
  });

  it("renders image pack thumbnails as images", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[
          createPack({ thumbnailPath: "/tmp/sample-pack/webm/icon.png" }),
        ]}
        telegramState={createTelegramState()}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSelectTelegramAuthMode={vi.fn(async () => undefined)}
        onDisconnectTelegram={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("<img");
    expect(markup).toContain("icon.png");
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
          }),
        ]}
        telegramState={createTelegramState({
          status: "awaiting_credentials",
          selectedMode: "user",
          message: "TDLib user login needs api_id/api_hash.",
        })}
        selectedPackId={null}
        onSelect={vi.fn()}
        onSelectTelegramAuthMode={vi.fn(async () => undefined)}
        onDisconnectTelegram={vi.fn(async () => undefined)}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("Local");
    expect(markup).toContain("Telegram");
    expect(markup).toContain("Local Pack");
    expect(markup).toContain("Telegram Pack");
    expect(markup).toContain("Credentials needed");
    expect(markup).toContain("User Account");
    expect(markup).toContain("Bot Token");
  });
});
