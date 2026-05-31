import { useCallback } from "react";
import type { StickerPackDetails } from "@sticker-smith/shared";
import { TelegramPublishDialog } from "../TelegramPublishDialog";
import type { PackPanelProps } from "./types";

function suggestShortName(details: StickerPackDetails) {
  return (
    details.pack.telegramShortName ??
    `${details.pack.slug.replace(/-/g, "_")}_${details.pack.id.replace(/-/g, "").slice(0, 6)}`
  );
}

type PackPublishDialogControllerProps = Pick<
  PackPanelProps,
  "refreshDetails" | "refreshPacks" | "onPublishLocalPack"
> & {
  details: StickerPackDetails;
  open: boolean;
  submitting: boolean;
  telegramPublishing: boolean;
  setOpen: (open: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
};

export function PackPublishDialogController({
  details,
  open,
  submitting,
  telegramPublishing,
  setOpen,
  setSubmitting,
  refreshDetails,
  refreshPacks,
  onPublishLocalPack,
}: PackPublishDialogControllerProps) {
  const { pack } = details;
  const close = useCallback(() => {
    if (submitting || telegramPublishing) return;
    setOpen(false);
  }, [submitting, telegramPublishing, setOpen]);

  const confirm = useCallback(
    async ({ title, shortName }: { title: string; shortName: string }) => {
      setSubmitting(true);
      try {
        await window.stickerSmith.packs.setTelegramShortName({
          packId: pack.id,
          shortName,
        });
        await Promise.all([refreshPacks(), refreshDetails(pack.id)]);
        await onPublishLocalPack({ packId: pack.id, title, shortName });
        setOpen(false);
      } catch {
        // App-level Telegram failure handling keeps the dialog open for retry.
      } finally {
        setSubmitting(false);
      }
    },
    [
      pack.id,
      refreshPacks,
      refreshDetails,
      onPublishLocalPack,
      setOpen,
      setSubmitting,
    ],
  );

  return (
    <TelegramPublishDialog
      open={open}
      initialTitle={pack.name}
      initialShortName={suggestShortName(details)}
      submitting={submitting || telegramPublishing}
      onClose={close}
      onConfirm={confirm}
    />
  );
}
