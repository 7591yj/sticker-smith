import { createTheme } from "@mui/material/styles";
import { appTokens } from "../theme/appTokens";

export const appTheme = createTheme({
  palette: {
    mode: appTokens.colorScheme,
    primary: { main: appTokens.colors.primary },
    background: {
      default: appTokens.colors.background.app,
      paper: appTokens.colors.background.surface,
    },
    text: {
      primary: appTokens.colors.text.primary,
      secondary: appTokens.colors.text.secondary,
    },
    divider: appTokens.colors.border.subtle,
    error: { main: appTokens.colors.error },
  },
  typography: {
    fontFamily: appTokens.typography.fontFamily,
    fontSize: appTokens.typography.fontSize,
  },
  shape: { borderRadius: appTokens.radii.panel },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": { height: "100%", margin: 0, padding: 0 },
        html: {
          colorScheme: appTokens.colorScheme,
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        body: { fontFamily: appTokens.typography.fontFamily },
        "*, *::before, *::after": { boxSizing: "border-box" },
      },
    },
    MuiButton: {
      defaultProps: { disableRipple: false },
    },
    MuiIconButton: {
      styleOverrides: {
        sizeSmall: { padding: appTokens.radii.small },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: appTokens.radii.control },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { fontSize: appTokens.typography.fontSizes.bodyDefault },
      },
    },
  },
});
