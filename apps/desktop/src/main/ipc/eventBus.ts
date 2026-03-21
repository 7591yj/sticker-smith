import { BrowserWindow } from "electron";

export function createBroadcastEmitter(channel: string) {
  return (payload: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
  };
}
