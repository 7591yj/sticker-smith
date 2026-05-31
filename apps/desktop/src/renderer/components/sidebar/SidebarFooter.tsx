import AddIcon from "@mui/icons-material/Add";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import SyncIcon from "@mui/icons-material/Sync";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import type { MouseEvent } from "react";
import { appTokens } from "../../../theme/appTokens";

export function SidebarFooter({
  syncActionLabel,
  telegramReady,
  telegramSyncBusy,
  telegramSyncRecommended,
  onImportDir,
  onCreatePack,
  onOpenTelegramMenu,
  onSyncTelegramPacks,
}: {
  syncActionLabel: string;
  telegramReady: boolean;
  telegramSyncBusy: boolean;
  telegramSyncRecommended: boolean;
  onImportDir: () => void;
  onCreatePack: () => void;
  onOpenTelegramMenu: (event: MouseEvent<HTMLElement>) => void;
  onSyncTelegramPacks: () => Promise<unknown>;
}) {
  return (
    <Box
      component="footer"
      sx={{
        px: appTokens.layout.spacing.sidebarPaddingX,
        py: appTokens.layout.spacing.panelPaddingY,
        minHeight: appTokens.layout.panelHeaderMinHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: appTokens.layout.spacing.compactGap,
      }}
    >
      <Tooltip title={appTokens.copy.labels.importFolderAsNewPack}>
        <IconButton size="small" onClick={onImportDir}>
          <DriveFileMoveIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={appTokens.copy.actions.newPack}>
        <IconButton size="small" onClick={onCreatePack}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={appTokens.copy.labels.telegramAccount}>
        <IconButton
          size="small"
          aria-label={appTokens.copy.labels.telegramAccount}
          onClick={onOpenTelegramMenu}
          sx={{ color: telegramReady ? "text.secondary" : "error.main" }}
        >
          <ManageAccountsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={syncActionLabel}>
        <span>
          <IconButton
            size="small"
            aria-label={syncActionLabel}
            disabled={!telegramReady || telegramSyncBusy}
            onClick={() => void onSyncTelegramPacks().catch(() => undefined)}
          >
            <SyncIcon
              fontSize="small"
              sx={{
                color:
                  telegramSyncRecommended && telegramReady && !telegramSyncBusy
                    ? "error.main"
                    : "text.secondary",
                animation: telegramSyncBusy
                  ? "telegram-sync-spin 1s linear infinite"
                  : "none",
                "@keyframes telegram-sync-spin": {
                  from: { transform: "rotate(0deg)" },
                  to: { transform: "rotate(360deg)" },
                },
              }}
            />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
