import { act } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/renderer/App";

export function createConnectedTelegramState() {
  return {
    backend: "tdlib" as const,
    status: "connected" as const,
    authStep: "ready" as const,
    selectedMode: "user" as const,
    recommendedMode: "user" as const,
    message: "Telegram is connected.",
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
    lastError: null,
    updatedAt: "2026-03-12T00:00:00.000Z",
  };
}

export function createDisconnectedTelegramState() {
  return {
    backend: "tdlib" as const,
    status: "disconnected" as const,
    authStep: "wait_tdlib_parameters" as const,
    selectedMode: "user" as const,
    recommendedMode: "user" as const,
    message: "Telegram is disconnected.",
    tdlib: {
      apiId: null,
      apiHashConfigured: false,
    },
    user: {
      phoneNumber: null,
    },
    sessionUser: null,
    lastError: null,
    updatedAt: "2026-03-12T00:01:00.000Z",
  };
}

export async function renderApp(waitForEffects = () => Promise.resolve()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App />);
    await waitForEffects();
  });

  return { container, root };
}
