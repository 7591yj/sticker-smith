import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import { SidebarDialogs } from "./sidebar/SidebarDialogs";
import { SidebarFooter } from "./sidebar/SidebarFooter";
import {
  SidebarHeader,
  PackList,
  PackSourceFilter,
  UnsupportedTelegramToggle,
} from "./sidebar/SidebarPackList";
import { SidebarMenus } from "./sidebar/SidebarMenus";
import type { SidebarProps } from "./sidebar/types";
import { useSidebarModel, type SidebarModel } from "./sidebar/useSidebarModel";

function SidebarBody({
  model,
  props,
}: {
  model: SidebarModel;
  props: SidebarProps;
}) {
  return (
    <>
      <SidebarHeader />
      <PackSourceFilter
        activePackFilter={model.activePackFilter}
        onChange={model.setActivePackFilter}
      />
      <PackList
        packs={model.visiblePacks}
        emptyState={model.emptyState}
        selectedPackId={props.selectedPackId}
        onSelect={props.onSelect}
        onContextMenu={model.handleContextMenu}
      />
      {model.activePackFilter === "telegram" &&
      model.unsupportedTelegramPacks.length > 0 ? (
        <UnsupportedTelegramToggle
          show={model.showUnsupportedTelegram}
          onToggle={() => model.setShowUnsupportedTelegram((show) => !show)}
        />
      ) : null}
      <Divider />
      <SidebarFooter
        syncActionLabel={model.syncActionLabel}
        telegramReady={model.telegramReady}
        telegramSyncBusy={model.telegramSyncBusy}
        telegramSyncRecommended={props.telegramSyncRecommended}
        onImportDir={model.handleImportDir}
        onCreatePack={() => model.setCreateDialogOpen(true)}
        onOpenTelegramMenu={(event) =>
          model.setTelegramMenuAnchor(event.currentTarget)
        }
        onSyncTelegramPacks={props.onSyncTelegramPacks}
      />
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  const model = useSidebarModel(props);

  return (
    <Box
      sx={{
        width: props.width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        borderRight: 1,
        borderColor: "divider",
        height: "100%",
      }}
    >
      <SidebarBody model={model} props={props} />
      <SidebarMenus model={model} props={props} />
      <SidebarDialogs model={model} props={props} />
    </Box>
  );
}
