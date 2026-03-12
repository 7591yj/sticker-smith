import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  OutputArtifact,
  SourceAsset,
  StickerPack,
  StickerPackDetails,
} from "@sticker-smith/shared";
import { AssetGrid } from "../src/renderer/components/AssetGrid";
import { OutputsList } from "../src/renderer/components/OutputsList";
import {
  FilePreview,
  sortItemsWithPinnedFirst,
} from "../src/renderer/components/fileBrowser";

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

function createAsset(
  id: string,
  relativePath: string,
  kind: SourceAsset["kind"] = "png",
): SourceAsset {
  return {
    id,
    packId: "pack-1",
    relativePath,
    absolutePath: `/tmp/sample-pack/source/${relativePath}`,
    emojiList: [],
    kind,
    importedAt: "2026-03-11T00:00:00.000Z",
    originalImportPath: null,
    downloadState: "ready",
  };
}

function createOutput(
  relativePath: string,
  mode: OutputArtifact["mode"] = "sticker",
): OutputArtifact {
  return {
    packId: "pack-1",
    sourceAssetId: `asset-for-${relativePath}`,
    mode,
    relativePath,
    absolutePath: `/tmp/sample-pack/webm/${relativePath}`,
    sizeBytes: 32_768,
    sha256: null,
    updatedAt: "2026-03-11T00:00:00.000Z",
  };
}

describe("fileBrowser", () => {
  it("keeps pinned items first before sorting the rest", () => {
    const sorted = sortItemsWithPinnedFirst(
      [
        { label: "zeta", pinned: false },
        { label: "alpha", pinned: false },
        { label: "icon", pinned: true },
      ],
      {
        getLabel: (item) => item.label,
        isPinned: (item) => item.pinned,
      },
    );

    expect(sorted.map((item) => item.label)).toEqual(["icon", "alpha", "zeta"]);
  });

  it("renders webm previews as videos", () => {
    const markup = renderToStaticMarkup(
      <FilePreview
        absolutePath="/tmp/sample-pack/webm/large.webm"
        relativePath="large.webm"
      />,
    );

    expect(markup).toContain("<video");
    expect(markup).toContain("large.webm");
  });
});

describe("AssetGrid", () => {
  it("keeps the icon asset first in gallery view", () => {
    const assets = [
      createAsset("asset-1", "zeta.png"),
      createAsset("asset-2", "icon.png"),
      createAsset("asset-3", "alpha.png"),
    ];

    const markup = renderToStaticMarkup(
      <AssetGrid
        assets={assets}
        pack={createPack({ iconAssetId: "asset-2" })}
        view="gallery"
        refreshDetails={vi.fn(async (): Promise<StickerPackDetails> => ({
          pack: createPack({ iconAssetId: "asset-2" }),
          assets,
          outputs: [],
        }))}
      />,
    );

    expect(markup.indexOf("icon.png")).toBeLessThan(markup.indexOf("alpha.png"));
  });

  it("renders the emoji requirement state for assets without emojis", () => {
    const markup = renderToStaticMarkup(
      <AssetGrid
        assets={[createAsset("asset-1", "needs-emoji.png")]}
        pack={createPack()}
        view="gallery"
        refreshDetails={vi.fn(async (): Promise<StickerPackDetails> => ({
          pack: createPack(),
          assets: [createAsset("asset-1", "needs-emoji.png")],
          outputs: [],
        }))}
      />,
    );

    expect(markup).toContain("Emoji required");
  });

  it("renders a standalone telegram pack icon preview in the assets grid", () => {
    const markup = renderToStaticMarkup(
      <AssetGrid
        assets={[]}
        pack={createPack({
          source: "telegram",
          thumbnailPath: "/tmp/sample-pack/source/telegram-pack-icon.webp",
          telegram: {
            stickerSetId: "100",
            shortName: "sample_pack",
            title: "Sample Pack",
            format: "video",
            syncState: "idle",
            lastSyncedAt: "2026-03-12T00:00:00.000Z",
            lastSyncError: null,
            publishedFromLocalPackId: null,
          },
        })}
        view="gallery"
        refreshDetails={vi.fn(async (): Promise<StickerPackDetails> => ({
          pack: createPack({
            source: "telegram",
            thumbnailPath: "/tmp/sample-pack/source/telegram-pack-icon.webp",
            telegram: {
              stickerSetId: "100",
              shortName: "sample_pack",
              title: "Sample Pack",
              format: "video",
              syncState: "idle",
              lastSyncedAt: "2026-03-12T00:00:00.000Z",
              lastSyncError: null,
              publishedFromLocalPackId: null,
            },
          }),
          assets: [],
          outputs: [],
        }))}
      />,
    );

    expect(markup).toContain("telegram-pack-icon.webp");
    expect(markup).toContain("icon");
    expect(markup).toContain("ready");
  });
});

describe("OutputsList", () => {
  it("uses preview cards without per-file open controls and keeps icon output first", () => {
    const markup = renderToStaticMarkup(
      <OutputsList
        view="gallery"
        outputs={[
          createOutput("zeta.webm"),
          createOutput("icon.webm", "icon"),
          createOutput("alpha.webm"),
        ]}
      />,
    );

    expect(markup).not.toContain("Open containing folder");
    expect(markup.indexOf("icon.webm")).toBeLessThan(markup.indexOf("alpha.webm"));
  });
});
