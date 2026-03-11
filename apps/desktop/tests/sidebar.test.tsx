import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { StickerPack } from "@sticker-smith/shared";

import { Sidebar } from "../src/renderer/components/Sidebar";

function createPack(overrides: Partial<StickerPack> = {}): StickerPack {
  return {
    id: "pack-1",
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

describe("Sidebar", () => {
  it("renders webm pack thumbnails as video previews", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        packs={[
          createPack({ thumbnailPath: "/tmp/sample-pack/webm/icon.webm" }),
        ]}
        selectedPackId={null}
        onSelect={vi.fn()}
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
        selectedPackId={null}
        onSelect={vi.fn()}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("<img");
    expect(markup).toContain("icon.png");
  });
});
