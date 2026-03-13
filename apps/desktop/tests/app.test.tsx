import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", {
  stickerSmith: {
    telegram: {
      getState: vi.fn(async () => ({
        backend: "tdlib",
        status: "disconnected",
        authStep: "wait_tdlib_parameters",
        selectedMode: "user",
        recommendedMode: "user",
        message: "Enter your Telegram api_id and api_hash to start a user session and sync owned sticker packs.",
        tdlib: {
          apiId: null,
          apiHashConfigured: false,
        },
        user: {
          phoneNumber: null,
        },
        sessionUser: null,
        lastError: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
      })),
      subscribe: vi.fn(() => () => undefined),
    },
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
    expect(markup).toContain("Select a pack or create a new one.");
  });
});
