import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenameDialog } from "../src/renderer/components/RenameDialog";

describe("RenameDialog", () => {
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

  it("renders rejected async validation errors inline", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => {
      throw new Error("Expected a Telegram-compatible emoji.");
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RenameDialog
          open
          title="Edit Emojis"
          label="Emoji list"
          initialValue="smile"
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });

    const confirmButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Confirm"),
    );
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledWith("smile");
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Expected a Telegram-compatible emoji.",
    );

    await act(async () => {
      root.unmount();
    });
  });
});
