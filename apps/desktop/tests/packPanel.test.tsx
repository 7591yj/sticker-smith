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
        setDetails={vi.fn()}
        refreshDetails={vi.fn(async () => createDetails())}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
        onPublishLocalPack={vi.fn(async () => undefined)}
        onDownloadTelegramPackMedia={vi.fn(async () => undefined)}
        onUpdateTelegramPack={vi.fn(async () => undefined)}
      />,
    );

    expect(markup).toContain("Open Outputs");
    expect(markup).toContain("Export");
    expect(markup).toContain("Upload");
    expect(markup).toContain('aria-label="Delete pack"');
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
    expect(markup).toContain(
      'aria-label="Deleting Telegram sticker sets is not supported yet"',
    );
    expect(markup).toContain("disabled");
  });
});
