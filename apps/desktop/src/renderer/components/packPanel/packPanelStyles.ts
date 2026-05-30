import { appTokens } from "../../../theme/appTokens";

export const panelPrimaryButtonSx = {
  textTransform: "none",
  fontWeight: appTokens.typography.fontWeights.medium,
  fontSize: appTokens.typography.fontSizes.body,
  px: appTokens.layout.spacing.toolbarButtonX,
} as const;

export const panelSecondaryButtonSx = {
  textTransform: "none",
  fontSize: appTokens.typography.fontSizes.bodyCompact,
} as const;
