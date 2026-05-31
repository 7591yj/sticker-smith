import type { ReactNode } from "react";
import StarIcon from "@mui/icons-material/Star";
import Box from "@mui/material/Box";
import { appTokens } from "../../../theme/appTokens";
import type { BrowserItemProps } from "./types";

type BrowserItemFrameProps = Omit<
  BrowserItemProps,
  "label" | "preview" | "metadata"
> & {
  frameSx: object;
  children: ReactNode;
};

type BrowserItemStateInput = {
  isPinned: boolean;
  selected: boolean;
  isDragOver: boolean;
  draggable: boolean;
};

function browserItemBorderColor(input: BrowserItemStateInput) {
  if (input.isDragOver) return "primary.light";
  if (input.selected || input.isPinned) return "primary.main";
  return "divider";
}

function browserItemHoverBorderColor(input: BrowserItemStateInput) {
  return input.selected || input.isPinned ? "primary.light" : "action.selected";
}

function browserItemShadow(input: BrowserItemStateInput) {
  return input.isDragOver || input.selected
    ? "0 0 0 1px rgba(96,165,250,0.35)"
    : "none";
}

function browserItemActiveSx(input: BrowserItemStateInput) {
  return input.draggable ? { cursor: "grabbing" } : undefined;
}

function browserItemStateSx(input: BrowserItemStateInput) {
  return {
    position: "relative",
    border: "1px solid",
    borderColor: browserItemBorderColor(input),
    bgcolor: input.selected ? "action.selected" : "action.hover",
    cursor: input.draggable ? "grab" : "default",
    userSelect: "none",
    WebkitUserSelect: "none",
    transition: "border-color 0.15s, background-color 0.15s, box-shadow 0.15s",
    boxShadow: browserItemShadow(input),
    "&:hover": {
      bgcolor: "action.selected",
      borderColor: browserItemHoverBorderColor(input),
    },
    "&:active": browserItemActiveSx(input),
  } as const;
}

function PinnedBadge() {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 4,
        right: 4,
        zIndex: 1,
        bgcolor: "primary.main",
        borderRadius: appTokens.shape.radius.round,
        width: appTokens.sizes.preview.badge,
        height: appTokens.sizes.preview.badge,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StarIcon
        sx={{
          fontSize: appTokens.sizes.preview.badgeIcon,
          color: appTokens.colors.text.contrast,
        }}
      />
    </Box>
  );
}

export function BrowserItemFrame({
  title,
  isPinned = false,
  selected = false,
  isDragOver = false,
  draggable = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  frameSx,
  children,
}: BrowserItemFrameProps) {
  return (
    <Box
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      draggable={draggable}
      title={title}
      sx={{
        ...frameSx,
        ...browserItemStateSx({ isPinned, selected, isDragOver, draggable }),
      }}
    >
      {isPinned ? <PinnedBadge /> : null}
      {children}
    </Box>
  );
}
