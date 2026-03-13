import { appTokens } from "../../theme/appTokens";

export const browserMetadataRowSx = {
  display: "flex",
  alignItems: "center",
  gap: appTokens.layout.spacing.metadataGap,
  flexWrap: "wrap",
} as const;

export const browserListContainerSx = {
  display: "flex",
  flexDirection: "column",
  gap: appTokens.layout.spacing.browserListGap,
  px: appTokens.layout.spacing.browserPaddingX,
} as const;

export const browserGridContainerSx = {
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(${appTokens.sizes.preview.gridMinWidth}px, 1fr))`,
  gap: appTokens.layout.spacing.browserGridGap,
  px: appTokens.layout.spacing.browserPaddingX,
} as const;

export const browserMenuPaperSx = {
  minWidth: appTokens.sizes.menu.contextWide,
} as const;

export const browserMenuTitleSx = {
  opacity: "1 !important",
  fontSize: appTokens.typography.fontSizes.caption,
  color: "text.secondary",
  fontWeight: appTokens.typography.fontWeights.medium,
} as const;

export const browserMenuIconSx = {
  mr: appTokens.layout.spacing.menuIconGap,
  fontSize: appTokens.sizes.icon.action,
} as const;

export const browserMetaChipSx = {
  height: appTokens.sizes.chip.compactHeight,
  fontSize: appTokens.typography.fontSizes.assetKind,
  textTransform: "uppercase",
  letterSpacing: appTokens.typography.letterSpacing.chip,
} as const;

export const browserToolbarSx = {
  px: appTokens.layout.spacing.panelPaddingX,
  pt: appTokens.layout.spacing.browserToolbarTop,
  pb: appTokens.layout.spacing.browserToolbarBottom,
  display: "flex",
  alignItems: "center",
  gap: appTokens.layout.spacing.controlGap,
  flexWrap: "wrap",
} as const;

export const browserCountLabelSx = {
  fontSize: appTokens.typography.fontSizes.caption,
} as const;

export function actionIconSx(size: number) {
  return {
    fontSize: `${size}px !important`,
  } as const;
}

export function formatCountLabel(count: number, noun: string) {
  return `${count} ${noun}${count !== 1 ? "s" : ""}`;
}
