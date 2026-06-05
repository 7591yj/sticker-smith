import ChangeCircleIcon from "@mui/icons-material/ChangeCircle";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CreateIcon from "@mui/icons-material/Create";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FilterListIcon from "@mui/icons-material/FilterList";
import type { SvgIconComponent } from "@mui/icons-material";
import { appTokens } from "../../../theme/appTokens";
import type { StickerStatus } from "./stickerUtils";
import type { StickerFilter } from "./types";

export type StickerStatusMeta = {
  label: string;
  color: string;
  Icon: SvgIconComponent;
};

export const stickerStatusMeta = {
  draft: {
    label: appTokens.copy.labels.stickerStatusDraft,
    color: appTokens.colors.status.draft.main,
    Icon: CreateIcon,
  },
  ready: {
    label: appTokens.copy.labels.stickerStatusReady,
    color: appTokens.colors.status.ready.main,
    Icon: CheckCircleOutlineIcon,
  },
  synced: {
    label: appTokens.copy.labels.stickerStatusSynced,
    color: appTokens.colors.status.synced.main,
    Icon: CheckCircleIcon,
  },
  modified: {
    label: appTokens.copy.labels.stickerStatusModified,
    color: appTokens.colors.status.modified.main,
    Icon: ChangeCircleIcon,
  },
  failed: {
    label: appTokens.copy.labels.stickerStatusFailed,
    color: appTokens.colors.status.failed.main,
    Icon: ErrorOutlineIcon,
  },
} satisfies Record<StickerStatus, StickerStatusMeta>;

export const stickerFilterMeta = {
  all: {
    label: appTokens.copy.labels.stickerStatusAll,
    color: appTokens.colors.text.secondary,
    Icon: FilterListIcon,
  },
  draft: stickerStatusMeta.draft,
  ready: stickerStatusMeta.ready,
  synced: stickerStatusMeta.synced,
  modified: stickerStatusMeta.modified,
  failed: stickerStatusMeta.failed,
} satisfies Record<StickerFilter, StickerStatusMeta>;
