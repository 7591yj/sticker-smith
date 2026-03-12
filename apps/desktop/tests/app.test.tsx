import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", {
  stickerSmith: {
    telegram: { getState: vi.fn(async () => ({
      backend: "tdlib",
      status: "disconnected",
      selectedMode: null,
      recommendedMode: "user",
      message: "Telegram is not connected.",
      updatedAt: "2026-03-12T00:00:00.000Z",
    })) },
    packs: { list: vi.fn(), get: vi.fn() },
    assets: {},
    conversion: { subscribe: vi.fn(() => () => undefined) },
    outputs: {},
    settings: {},
  },
});

import { App } from "../src/renderer/App";

describe("desktop app", () => {
  it("renders the desktop shell", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Sticker Smith");
    expect(markup).toContain("Local");
    expect(markup).toContain("Telegram");
    expect(markup).toContain("No local packs yet");
    expect(markup).toContain("User Account");
    expect(markup).toContain("Select a pack or create a new one.");
  });
});
