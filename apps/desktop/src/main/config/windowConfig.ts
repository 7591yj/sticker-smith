// Keep in sync with appTokens.layout.window and appTokens.colors when values change.
export const windowConfig = {
  width: 1600,
  height: 980,
  minWidth: 1200,
  minHeight: 720,
  backgroundColor: "#09090b",
} as const;

// Keep in sync with appTokens.copy when labels change.
export const mainProcessDialogStrings = {
  exportDialogTitle: "Export",
  exportFolderButtonLabel: "Copy Folder Here",
} as const;
