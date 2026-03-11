import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", {
  stickerSmith: {
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
    expect(markup).toContain("No packs yet");
    expect(markup).toContain("Select a pack or create a new one.");
  });
});
