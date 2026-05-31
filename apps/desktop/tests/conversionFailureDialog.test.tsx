import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversionJobEvent, StickerPackDetails } from "@sticker-smith/shared";
import { createDisconnectedTelegramState, renderApp } from "./helpers";

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
        iconStickerId: null,
        thumbnailPath: null,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      },
      stickers: [
        {
          id: "asset-1",
          packId: "pack-1",
          order: 0,
          relativePath: "broken.png",
          absolutePath: "/tmp/sample-pack/source/broken.png",
          originalFileName: "broken.png",
          emojiList: [],
          sizeBytes: 1024,
          sha256: null,
          importedAt: "2026-03-12T00:00:00.000Z",
          updatedAt: "2026-03-12T00:00:00.000Z",
          downloadState: "ready",
        },
      ],
      };
    let listener: ((event: ConversionJobEvent) => void) | null = null;

    Object.assign(window, {
      stickerSmith: {
        telegram: {
          getState: vi.fn(async () => createDisconnectedTelegramState()),
          subscribe: vi.fn(() => () => undefined),
        },
        packs: {
          list: vi.fn(async () => [details.pack]),
          get: vi.fn(async () => details),
        },
        conversion: {
          subscribe: vi.fn((nextListener: (event: ConversionJobEvent) => void) => {
            listener = nextListener;
            return () => undefined;
          }),
        },
        settings: {},
      },
    });

    const { root } = await renderApp();

    await act(async () => {
      listener?.({ type: "job_started", jobId: "job-1", taskCount: 1 });
      listener?.({
        type: "sticker_failed",
        jobId: "job-1",
        stickerId: "asset-1",
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

    expect(document.body.textContent).toContain("Some files could not be added");
    expect(document.body.textContent).toContain(
      'Sticker Smith tried to add files to "Sample Pack", but 1 file failed.',
    );
    expect(document.body.textContent).toContain(
      "ffmpeg failed during sticker conversion",
    );

    await act(async () => {
      root.unmount();
    });
  });
});
