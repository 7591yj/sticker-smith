import { useState } from "react";
import type { BrowserView } from "./fileBrowser";
import { EmptyPackPanel, PackPanelLoaded } from "./packPanel/PackPanelLoaded";
import type { PackPanelProps } from "./packPanel/types";
import { usePackPanelActions } from "./packPanel/usePackPanelActions";

export function PackPanel({
  details,
  converting,
  telegramConnected,
  telegramPublishing,
  telegramUpdating,
  setDetails,
  refreshDetails,
  refreshPacks,
  setSelectedPackId,
  onPublishLocalPack,
  onDownloadTelegramPackMedia,
  onUpdateTelegramPack,
}: PackPanelProps) {
  const [renaming, setRenaming] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [view, setView] = useState<BrowserView>("list");
  const packId = details?.pack.id ?? null;
  const actions = usePackPanelActions({
    details,
    packId,
    setDetails,
    refreshDetails,
    refreshPacks,
    setSelectedPackId,
    setRenaming,
  });

  if (!details) return <EmptyPackPanel />;

  return (
    <PackPanelLoaded
      details={details}
      actions={actions}
      converting={converting}
      telegramConnected={telegramConnected}
      telegramPublishing={telegramPublishing}
      telegramUpdating={telegramUpdating}
      refreshDetails={refreshDetails}
      refreshPacks={refreshPacks}
      onPublishLocalPack={onPublishLocalPack}
      onDownloadTelegramPackMedia={onDownloadTelegramPackMedia}
      onUpdateTelegramPack={onUpdateTelegramPack}
      renaming={renaming}
      setRenaming={setRenaming}
      publishDialogOpen={publishDialogOpen}
      setPublishDialogOpen={setPublishDialogOpen}
      publishSubmitting={publishSubmitting}
      setPublishSubmitting={setPublishSubmitting}
      view={view}
      setView={setView}
    />
  );
}
