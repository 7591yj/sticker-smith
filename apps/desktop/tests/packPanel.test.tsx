import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { StickerPackDetails } from "@sticker-smith/shared";

import { PackPanel } from "../src/renderer/components/PackPanel";

function createDetails(): StickerPackDetails {
  return {
    pack: {
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
    },
    assets: [],
    outputs: [],
  };
}

describe("PackPanel", () => {
  it("renders the outputs export action", () => {
    const markup = renderToStaticMarkup(
      <PackPanel
        details={createDetails()}
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
      />,
    );

    expect(markup).toContain("Open Assets");
    expect(markup).toContain("Open Outputs");
    expect(markup).toContain("Export");
    expect(markup).toContain("Upload");
    expect(markup).toContain('aria-label="Delete pack"');
    expect(markup).toContain('aria-label="List view"');
    expect(markup).toContain("disabled");
  });

  it("renders telegram sync errors on mirror packs", () => {
    const markup = renderToStaticMarkup(
      <PackPanel
        details={{
          ...createDetails(),
          pack: {
            ...createDetails().pack,
            source: "telegram",
            telegram: {
              stickerSetId: "100",
              shortName: "sample_pack",
              title: "Sample Pack",
              format: "video",
              syncState: "error",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError: "The selected Telegram sticker set is no longer owned by the current account.",
              publishedFromLocalPackId: null,
            },
          },
        }}
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
      />,
    );

    expect(markup).toContain("The selected Telegram sticker set is no longer owned by the current account.");
    expect(markup).toContain("Update");
    expect(markup).toContain("Sync error");
    expect(markup).toContain("sample_pack");
    expect(markup).toContain(
      'aria-label="Deleting Telegram sticker sets is not supported yet"',
    );
    expect(markup).toContain("disabled");
  });

  it("renders a needs-update label for stale telegram mirrors", () => {
    const markup = renderToStaticMarkup(
      <PackPanel
        details={{
          ...createDetails(),
          pack: {
            ...createDetails().pack,
            source: "telegram",
            telegram: {
              stickerSetId: "100",
              shortName: "sample_pack",
              title: "Sample Pack",
              format: "video",
              syncState: "stale",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError: null,
              publishedFromLocalPackId: null,
            },
          },
        }}
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
      />,
    );

    expect(markup).toContain("Needs update");
  });

  it("renders busy telegram actions while a mirror is syncing or downloading", () => {
    const markup = renderToStaticMarkup(
      <PackPanel
        details={{
          ...createDetails(),
          pack: {
            ...createDetails().pack,
            source: "telegram",
            telegram: {
              stickerSetId: "100",
              shortName: "sample_pack",
              title: "Sample Pack",
              format: "video",
              syncState: "syncing",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError: null,
              publishedFromLocalPackId: null,
            },
          },
          assets: [
            {
              id: "asset-1",
              packId: "pack-1",
              relativePath: "sticker.webm",
              absolutePath: null,
              emojiList: ["🙂"],
              kind: "webm",
              importedAt: "2026-03-12T00:00:00.000Z",
              originalImportPath: null,
              downloadState: "downloading",
              telegram: {
                stickerId: "sticker-1",
                fileId: "remote-1",
                fileUniqueId: "unique-1",
                position: 0,
                baselineOutputHash: null,
              },
            },
          ],
        }}
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
      />,
    );

    expect(markup).toContain("Syncing");
    expect(markup).toContain("Telegram media downloading");
    expect(markup).toContain("downloading");
  });

  it("renders unsupported non-video telegram mirrors as disabled", () => {
    const markup = renderToStaticMarkup(
      <PackPanel
        details={{
          ...createDetails(),
          pack: {
            ...createDetails().pack,
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
          },
        }}
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
      />,
    );

    expect(markup).toContain("Unsupported");
    expect(markup).toContain(
      'Telegram pack &quot;Static Pack&quot; uses static stickers, and only video sticker packs are supported currently.',
    );
    expect(markup).toContain("disabled");
  });

  it("renders uploading and updating labels for telegram actions in flight", () => {
    const uploadingMarkup = renderToStaticMarkup(
      <PackPanel
        details={createDetails()}
        converting={false}
        telegramConnected={true}
        telegramPublishing={true}
        telegramUpdating={false}
        setDetails={vi.fn()}
        refreshDetails={vi.fn(async () => createDetails())}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
        onPublishLocalPack={vi.fn(async () => undefined)}
        onDownloadTelegramPackMedia={vi.fn(async () => undefined)}
        onUpdateTelegramPack={vi.fn(async () => undefined)}
      />,
    );

    const updatingMarkup = renderToStaticMarkup(
      <PackPanel
        details={{
          ...createDetails(),
          pack: {
            ...createDetails().pack,
            source: "telegram",
            telegram: {
              stickerSetId: "100",
              shortName: "sample_pack",
              title: "Sample Pack",
              format: "video",
              syncState: "stale",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError: null,
              publishedFromLocalPackId: null,
            },
          },
        }}
        converting={false}
        telegramConnected={true}
        telegramPublishing={false}
        telegramUpdating={true}
        setDetails={vi.fn()}
        refreshDetails={vi.fn(async () => createDetails())}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
        onPublishLocalPack={vi.fn(async () => undefined)}
        onDownloadTelegramPackMedia={vi.fn(async () => undefined)}
        onUpdateTelegramPack={vi.fn(async () => undefined)}
      />,
    );

    expect(uploadingMarkup).toContain("Uploading…");
    expect(updatingMarkup).toContain("Updating…");
  });
});
