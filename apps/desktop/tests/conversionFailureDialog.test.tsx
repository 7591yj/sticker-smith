import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversionJobEvent, StickerPackDetails } from "@sticker-smith/shared";
import { App } from "../src/renderer/App";

describe("conversion failure dialog", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens a dialog when a background conversion job finishes with failures", async () => {
    const details: StickerPackDetails = {
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
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      },
      assets: [
        {
          id: "asset-1",
          packId: "pack-1",
          relativePath: "broken.png",
          absolutePath: "/tmp/sample-pack/source/broken.png",
          emojiList: [],
          kind: "png",
          importedAt: "2026-03-12T00:00:00.000Z",
          originalImportPath: null,
        },
      ],
      outputs: [],
    };
    let listener: ((event: ConversionJobEvent) => void) | null = null;

    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => ({
            backend: "tdlib",
            status: "disconnected",
            selectedMode: null,
            recommendedMode: "user",
            message: "Telegram is not connected.",
            updatedAt: "2026-03-12T00:00:00.000Z",
          })),
        },
        packs: {
          list: vi.fn(async () => [details.pack]),
          get: vi.fn(async () => details),
        },
        assets: {},
        conversion: {
          subscribe: vi.fn((nextListener: (event: ConversionJobEvent) => void) => {
            listener = nextListener;
            return () => undefined;
          }),
        },
        outputs: {},
        settings: {},
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    await act(async () => {
      listener?.({ type: "job_started", jobId: "job-1", taskCount: 1 });
      listener?.({
        type: "asset_failed",
        jobId: "job-1",
        assetId: "asset-1",
        mode: "sticker",
        error: "ffmpeg failed during sticker conversion",
      });
      listener?.({
        type: "job_finished",
        jobId: "job-1",
        successCount: 0,
        failureCount: 1,
      });
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Conversion failed");
    expect(document.body.textContent).toContain(
      'Sticker Smith finished converting "Sample Pack" in the background, but 1 asset failed.',
    );
    expect(document.body.textContent).toContain("broken.png");
    expect(document.body.textContent).toContain(
      "ffmpeg failed during sticker conversion",
    );

    await act(async () => {
      root.unmount();
    });
  });
});
