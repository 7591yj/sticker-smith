import { appTokens } from "../../../theme/appTokens";
import { RenameDialog } from "../RenameDialog";
import { TelegramAuthDialog } from "../TelegramAuthDialog";
import type { SidebarProps } from "./types";
import type { SidebarModel } from "./useSidebarModel";

export function SidebarDialogs({
  model,
  props,
}: {
  model: SidebarModel;
  props: SidebarProps;
}) {
  return (
    <>
      <RenameDialog
        open={model.createDialogOpen}
        title={appTokens.copy.dialogs.newPack}
        label={appTokens.copy.dialogs.packName}
        initialValue=""
        onConfirm={model.handleCreate}
        onClose={() => model.setCreateDialogOpen(false)}
      />
      {model.renamePack && (
        <RenameDialog
          open
          title={appTokens.copy.dialogs.renamePack}
          initialValue={model.renamePack.name}
          onConfirm={model.handleRenameConfirm}
          onClose={() => model.setRenamePack(null)}
        />
      )}
      <TelegramAuthDialog
        open={model.telegramDialogOpen}
        state={props.telegramState}
        onClose={() => model.setTelegramDialogOpen(false)}
        onSubmitTdlibParameters={props.onSubmitTelegramTdlibParameters}
        onSubmitPhoneNumber={props.onSubmitTelegramPhoneNumber}
        onSubmitCode={props.onSubmitTelegramCode}
        onSubmitPassword={props.onSubmitTelegramPassword}
      />
    </>
  );
}
