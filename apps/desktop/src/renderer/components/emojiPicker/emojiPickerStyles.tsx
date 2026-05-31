import { type CSSProperties, useMemo } from "react";
import GlobalStyles from "@mui/material/GlobalStyles";
import { alpha, useTheme } from "@mui/material/styles";
import { appTokens } from "../../../theme/appTokens";

export function useEmojiPickerStyle() {
  const theme = useTheme();

  return useMemo(() => {
    const dialogBackground = "#38383D";
    const dialogInputBackground = "#303035";
    const dialogBorder = alpha(theme.palette.common.white, 0.12);

    return {
      "--epr-bg-color": dialogBackground,
      "--epr-picker-border-color": "transparent",
      "--epr-highlight-color": theme.palette.primary.main,
      "--epr-text-color": theme.palette.text.primary,
      "--epr-hover-bg-color": alpha(theme.palette.primary.main, 0.14),
      "--epr-focus-bg-color": alpha(theme.palette.primary.main, 0.2),
      "--epr-search-input-bg-color": dialogInputBackground,
      "--epr-search-input-bg-color-active": dialogInputBackground,
      "--epr-search-input-text-color": theme.palette.text.primary,
      "--epr-search-input-placeholder-color": theme.palette.text.secondary,
      "--epr-search-border-color": dialogBorder,
      "--epr-search-border-color-active": theme.palette.primary.main,
      "--epr-category-label-bg-color": alpha(dialogBackground, 0.94),
      "--epr-category-label-text-color": theme.palette.text.secondary,
      "--epr-category-icon-active-color": theme.palette.primary.main,
      "--epr-horizontal-padding": "0px",
      "--epr-header-padding": "0 0 8px 0",
      "--epr-category-padding": "0px",
      "--epr-category-label-padding": "0px",
      "--epr-picker-border-radius": `${appTokens.shape.radiusPx.panel}px`,
      "--epr-search-input-border-radius": `${appTokens.shape.radiusPx.control}px`,
      "--epr-search-input-padding": "0 30px",
      "--epr-search-bar-inner-padding": "8px",
      "--epr-search-input-height": "34px",
      "--epr-category-label-height": "28px",
      "--epr-category-navigation-button-size": "26px",
      "--epr-preview-text-size": appTokens.typography.fontSizes.caption,
      "--epr-emoji-size": "24px",
      "--epr-emoji-padding": "4px",
      fontFamily: theme.typography.fontFamily,
      fontSize: appTokens.typography.fontSizes.caption,
      border: 0,
      boxShadow: "none",
    } as CSSProperties;
  }, [theme]);
}

export function EmojiPickerDialogGlobalStyles() {
  const theme = useTheme();

  return (
    <GlobalStyles
      styles={{
        ".EmojiPickerReact, .EmojiPickerReact input, .EmojiPickerReact button:not(.epr-emoji), .EmojiPickerReact .epr-emoji-category-label":
          {
            fontFamily: `${theme.typography.fontFamily} !important`,
          },
        ".EmojiPickerReact input": {
          fontSize: `${appTokens.typography.fontSizes.caption} !important`,
        },
        ".EmojiPickerReact .epr-emoji-category-label": {
          fontSize: `${appTokens.typography.fontSizes.caption} !important`,
          fontWeight: `${appTokens.typography.fontWeights.medium} !important`,
        },
      }}
    />
  );
}
