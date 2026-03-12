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
        setDetails={vi.fn()}
        refreshDetails={vi.fn(async () => createDetails())}
        refreshPacks={vi.fn(async () => [])}
        setSelectedPackId={vi.fn()}
      />,
    );

    expect(markup).toContain("Open Outputs");
    expect(markup).toContain("Export");
  });
});
