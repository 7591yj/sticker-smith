import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramState } from "@sticker-smith/shared";
import { TelegramAuthDialog } from "../src/renderer/components/TelegramAuthDialog";

function createTelegramState(
  overrides: Partial<TelegramState> = {},
): TelegramState {
  return {
    backend: "tdlib",
    status: "awaiting_credentials",
    authStep: "wait_tdlib_parameters",
    selectedMode: "user",
    recommendedMode: "user",
    message: "TDLib requires your Telegram api_id and api_hash.",
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
    ...overrides,
  };
}

describe("TelegramAuthDialog", () => {
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

  async function renderDialog(
    state: TelegramState,
    overrides: Partial<{
      onClose: () => void;
      onSubmitTdlibParameters: (input: {
        apiId: string;
        apiHash: string;
      }) => Promise<unknown>;
      onSubmitPhoneNumber: (input: { phoneNumber: string }) => Promise<unknown>;
      onSubmitCode: (input: { code: string }) => Promise<unknown>;
      onSubmitPassword: (input: { password: string }) => Promise<unknown>;
    }> = {},
  ) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TelegramAuthDialog
          open
          state={state}
          onClose={overrides.onClose ?? vi.fn()}
          onSubmitTdlibParameters={
            overrides.onSubmitTdlibParameters ?? vi.fn(async () => undefined)
          }
          onSubmitPhoneNumber={
            overrides.onSubmitPhoneNumber ?? vi.fn(async () => undefined)
          }
          onSubmitCode={overrides.onSubmitCode ?? vi.fn(async () => undefined)}
          onSubmitPassword={
            overrides.onSubmitPassword ?? vi.fn(async () => undefined)
          }
        />,
      );
    });

    return { root, container };
  }

  it("renders tdlib parameter inputs for user setup", async () => {
    const { root } = await renderDialog(createTelegramState());

    expect(document.body.textContent).toContain("TDLib Parameters");
    expect(document.body.textContent).toContain("API ID");
    expect(document.body.textContent).toContain("API hash");

    await act(async () => {
      root.unmount();
    });
  });

  it("renders the code entry step", async () => {
    const { root } = await renderDialog(
      createTelegramState({
        authStep: "wait_code",
        message: "Enter the login code Telegram sent to your account.",
      }),
    );

    expect(document.body.textContent).toContain("Telegram Code");
    expect(document.body.textContent).toContain("Login code");

    await act(async () => {
      root.unmount();
    });
  });

  it("renders the connected account summary", async () => {
    const { root } = await renderDialog(
      createTelegramState({
        status: "connected",
        authStep: "ready",
        tdlib: {
          apiId: "12345",
          apiHashConfigured: true,
        },
        user: {
          phoneNumber: "+12025550123",
        },
        sessionUser: {
          id: 1,
          username: "stickersmith",
          displayName: "Sticker Smith",
        },
        message: "Telegram is connected.",
      }),
    );

    expect(document.body.textContent).toContain("Telegram Connected");
    expect(document.body.textContent).toContain("API ID: 12345");
    expect(document.body.textContent).toContain("Phone: +12025550123");
    expect(document.body.textContent).toContain(
      "Account: Sticker Smith (@stickersmith)",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("disables auth actions while a telegram auth step is submitting", async () => {
    let resolveSubmit: (() => void) | null = null;
    const onSubmitCode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const { root, container } = await renderDialog(
      createTelegramState({
        authStep: "wait_code",
        message: "Enter the login code Telegram sent to your account.",
      }),
      { onSubmitCode },
    );

    const codeInput = container.querySelector("input");
    expect(codeInput).toBeTruthy();

    await act(async () => {
      (codeInput as HTMLInputElement).value = "12345";
      codeInput?.dispatchEvent(new Event("input", { bubbles: true }));
      codeInput?.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    const buttons = [...document.querySelectorAll("button")];
    const cancelButton = buttons.find((button) => button.textContent?.includes("Cancel"));
    const confirmButton = buttons.find((button) => button.textContent?.includes("Confirm"));

    expect(cancelButton).toBeDefined();
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onSubmitCode).toHaveBeenCalledTimes(1);
    expect((cancelButton as HTMLButtonElement).disabled).toBe(true);
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveSubmit?.();
      await Promise.resolve();
    });

    expect((cancelButton as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });
});
