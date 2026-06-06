import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { StickerItem, StickerPackDetails } from "@sticker-smith/shared";

import { PackPanel } from "../src/renderer/components/PackPanel";
import { createTelegramMetadata } from "./helpers";

function createDetails(overrides: Partial<StickerPackDetails> = {}): StickerPackDetails {
  return {
    pack: {
      id: "pack-1",
      source: "local",
      name: "Sample Pack",
      slug: "sample-pack",
      rootPath: "/tmp/sample-pack",
      iconStickerId: null,
      thumbnailPath: null,
      createdAt: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-03-11T00:00:00.000Z",
      ...overrides.pack,
    },
    stickers: overrides.stickers ?? [],
  };
}

function createTelegramDetails(
  telegramOverrides: Parameters<typeof createTelegramMetadata>[0] = {},
  detailsOverrides: Partial<StickerPackDetails> = {},
): StickerPackDetails {
  return createDetails({
    ...detailsOverrides,
    pack: {
      source: "telegram",
      telegram: createTelegramMetadata({
        shortName: "sample_pack",
        title: "Sample Pack",
        syncState: "idle",
        ...telegramOverrides,
      }),
      ...detailsOverrides.pack,
    },
  });
}

function createSticker(overrides: Partial<StickerItem> = {}): StickerItem {
  return {
    id: "asset-1",
    packId: "pack-1",
    order: 0,
    relativePath: "sticker.webm",
    absolutePath: null,
    originalFileName: "sticker.webm",
    emojiList: ["🙂"],
    sizeBytes: 1024,
    sha256: null,
    importedAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    downloadState: "ready",
    telegram: null,
    ...overrides,
  };
}

function renderPackPanelMarkup(details: StickerPackDetails, overrides = {}) {
  return renderToStaticMarkup(
    <PackPanel
      details={details}
      converting={false}
      telegramConnected={true}
      telegramPublishing={false}
      telegramUpdating={false}
      setDetails={vi.fn()}
      refreshDetails={vi.fn(async () => createDetails())}
      refreshPacks={vi.fn(async () => [])}
      setSelectedPackId={vi.fn()}
      onPublishLocalPack={vi.fn(async () => undefined)}
      onDownloadTelegramPackMedia={vi.fn(async () => undefined)}
      onUpdateTelegramPack={vi.fn(async () => undefined)}
      {...overrides}
    />,
  );
}

describe("PackPanel", () => {
  it("renders header actions with pack options in the overflow menu", () => {
    const markup = renderPackPanelMarkup(createDetails());

    expect(markup).toContain('aria-label="Pack options"');
    expect(markup).not.toContain("Open Folder");
    expect(markup).not.toContain("Export");
    expect(markup).toContain("Publish to Telegram");
    expect(markup).toContain('aria-label="Select all"');
    expect(markup).toContain("disabled");
  });

  it("renders telegram sync errors on mirror packs", () => {
    const markup = renderPackPanelMarkup(createTelegramDetails({ stickerSetId: "100", shortName: "sample_pack", title: "Sample Pack", format: "video", syncState: "error", lastSyncError: "The selected Telegram sticker set is no longer owned by the current account." }));

    expect(markup).toContain("The selected Telegram sticker set is no longer owned by the current account.");
    expect(markup).toContain("Update");
    expect(markup).toContain("Sync error");
    expect(markup).toContain("sample_pack");
    expect(markup).toContain('aria-label="Pack options"');
    expect(markup).toContain("disabled");
  });

  it("renders a needs-update label for stale telegram mirrors", () => {
    const markup = renderPackPanelMarkup(createTelegramDetails({ stickerSetId: "100", shortName: "sample_pack", title: "Sample Pack", format: "video", syncState: "stale" }));

    expect(markup).toContain("Local edits");
  });

  it("renders busy telegram actions while a mirror is syncing or downloading", () => {
    const markup = renderPackPanelMarkup(
      createTelegramDetails({ stickerSetId: "100", syncState: "syncing" }, {
        stickers: [createSticker({
          downloadState: "downloading",
          telegram: {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            position: 0,
            baselineOutputHash: null,
          },
        })],
      }),
    );

    expect(markup).toContain("Syncing");
    expect(markup).toContain("Telegram is already updating this pack");
  });

  it("renders unsupported non-video telegram mirrors as disabled", () => {
    const markup = renderPackPanelMarkup(createTelegramDetails({
      stickerSetId: "200",
      shortName: "static_pack",
      title: "Static Pack",
      format: "static",
      syncState: "unsupported",
      lastSyncError:
        '"Static Pack" uses static stickers. Sticker Smith currently supports video sticker packs only.',
    }));

    expect(markup).toContain("Unsupported");
    expect(markup).toContain(
      '&quot;Sample Pack&quot; uses static stickers. Sticker Smith currently supports video sticker packs only.',
    );
    expect(markup).toContain("disabled");
  });

  it("renders uploading and updating labels for telegram actions in flight", () => {
    const uploadingMarkup = renderPackPanelMarkup(createDetails(), { telegramPublishing: true });

    const updatingMarkup = renderPackPanelMarkup(
      createTelegramDetails({ stickerSetId: "100", syncState: "stale" }),
      { telegramUpdating: true },
    );

    expect(uploadingMarkup).toContain("Publishing…");
    expect(updatingMarkup).toContain("Updating Telegram…");
  });
});
