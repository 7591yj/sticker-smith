import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  OutputArtifact,
  SourceAsset,
  StickerPack,
  StickerPackDetails,
} from "@sticker-smith/shared";
import { AssetGrid } from "../src/renderer/components/AssetGrid";
import { EmojiPickerDialog } from "../src/renderer/components/EmojiPickerDialog";
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
  overrides: Partial<SourceAsset> = {},
): SourceAsset {
  return {
    id,
    packId: "pack-1",
    order: 0,
    relativePath,
    absolutePath: `/tmp/sample-pack/source/${relativePath}`,
    originalFileName: relativePath.split("/").pop() ?? relativePath,
    emojiList: [],
    kind,
    importedAt: "2026-03-11T00:00:00.000Z",
    originalImportPath: null,
    downloadState: "ready",
    ...overrides,
  };
}

function createOutput(
  relativePath: string,
  mode: OutputArtifact["mode"] = "sticker",
  order = 0,
): OutputArtifact {
  return {
    packId: "pack-1",
    sourceAssetId: `asset-for-${relativePath}`,
    order,
    mode,
    relativePath,
    absolutePath: `/tmp/sample-pack/webm/${relativePath}`,
    sizeBytes: 32_768,
    sha256: null,
    updatedAt: "2026-03-11T00:00:00.000Z",
  };
}

describe("fileBrowser", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps pinned items first before sorting the rest", () => {
    const sorted = sortItemsWithPinnedFirst(
      [
        { order: 2, pinned: false },
        { order: 1, pinned: false },
        { order: 5, pinned: true },
      ],
      {
        getOrder: (item) => item.order,
        isPinned: (item) => item.pinned,
      },
    );

    expect(sorted.map((item) => item.order)).toEqual([5, 1, 2]);
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
      createAsset("asset-1", "asset-1.png", "png", { order: 1, originalFileName: "zeta.png" }),
      createAsset("asset-2", "asset-2.png", "png", { order: 2, originalFileName: "icon.png" }),
      createAsset("asset-3", "asset-3.png", "png", { order: 0, originalFileName: "alpha.png" }),
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

    expect(markup.indexOf("Icon")).toBeLessThan(markup.indexOf("001"));
    expect(markup.indexOf("001")).toBeLessThan(markup.indexOf("002"));
  });

  it("does not render emoji metadata in the assets grid", () => {
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

    expect(markup).not.toContain("No emoji");
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
    expect(markup).toContain("Icon");
    expect(markup).toContain("ready");
  });
});

describe("OutputsList", () => {
  it("uses preview cards without per-file open controls and keeps icon output first", () => {
    const markup = renderToStaticMarkup(
      <OutputsList
        packId="pack-1"
        view="gallery"
        assets={[
          createAsset("asset-for-zeta.webm", "zeta.png", "png", {
            order: 1,
            emojiList: ["🙂"],
          }),
          createAsset("asset-for-alpha.webm", "alpha.png", "png", { order: 0 }),
        ]}
        outputs={[
          createOutput("zeta.webm", "sticker", 1),
          createOutput("icon.webm", "icon", 0),
          createOutput("alpha.webm", "sticker", 0),
        ]}
        refreshDetails={vi.fn(async (): Promise<StickerPackDetails> => ({
          pack: createPack(),
          assets: [],
          outputs: [],
        }))}
      />,
    );

    expect(markup).not.toContain("Open containing folder");
    expect(markup.indexOf("Icon")).toBeLessThan(markup.indexOf("001"));
    expect(markup.indexOf("001")).toBeLessThan(markup.indexOf("002"));
    expect(markup).toContain("🙂");
    expect(markup).toContain("No emoji");
  });

  it("shows tooltip metadata for output filenames while keeping order-based labels", () => {
    const markup = renderToStaticMarkup(
      <OutputsList
        packId="pack-1"
        view="list"
        assets={[
          createAsset("asset-for-nested/alpha.webm", "alpha.png", "png", {
            order: 0,
            originalFileName: "alpha-original.png",
          }),
        ]}
        outputs={[
          {
            ...createOutput("nested/alpha.webm"),
            sourceAssetId: "asset-for-nested/alpha.webm",
            order: 0,
          },
        ]}
        refreshDetails={vi.fn(async (): Promise<StickerPackDetails> => ({
          pack: createPack(),
          assets: [],
          outputs: [],
        }))}
      />,
    );

    expect(markup).toContain("001");
    expect(markup).toContain("Original: alpha-original.png");
    expect(markup).toContain("Stored: webm/nested/alpha.webm");
  });

  it("does not render no-emoji metadata for icon outputs", () => {
    const markup = renderToStaticMarkup(
      <OutputsList
        packId="pack-1"
        view="gallery"
        assets={[createAsset("asset-for-icon.webm", "icon.png")]}
        outputs={[createOutput("icon.webm", "icon")]}
        refreshDetails={vi.fn(async (): Promise<StickerPackDetails> => ({
          pack: createPack(),
          assets: [],
          outputs: [],
        }))}
      />,
    );

    expect(markup).not.toContain("No emoji");
  });
});

describe("EmojiPickerDialog", () => {
  it("renders an expanded Telegram emoji catalog", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <EmojiPickerDialog
          open
          title="Edit Emojis"
          initialEmojis={[]}
          onConfirm={vi.fn(async () => undefined)}
          onClose={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Search emojis");
    expect(document.body.textContent).toContain("🫶");
    expect(document.body.textContent).toContain("🩷");
    expect(document.body.textContent).toContain("🌮");

    await act(async () => {
      root.unmount();
    });
  });
});
