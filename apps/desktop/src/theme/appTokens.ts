import { appCopy } from "./appCopy";

const APP_FONT_FAMILY = [
  '"Sarasa Mono SC"',
  '"Sarasa Mono TC"',
  '"Sarasa Mono J"',
  '"Sarasa Mono K"',
  '"Noto Sans Mono CJK SC"',
  '"Noto Sans Mono CJK TC"',
  '"Noto Sans Mono CJK JP"',
  '"Noto Sans Mono CJK KR"',
  '"Noto Sans CJK SC"',
  '"Noto Sans CJK TC"',
  '"Noto Sans CJK JP"',
  '"Noto Sans CJK KR"',
  '"Cascadia Mono"',
  '"SFMono-Regular"',
  "ui-monospace",
  "monospace",
].join(", ");

const shapeRadiusPx = {
  small: 4,
  control: 6,
  panel: 8,
  card: 12,
  thumbnail: 6,
} as const;

const shapeRadius = {
  small: shapeRadiusPx.small / shapeRadiusPx.panel,
  control: shapeRadiusPx.control / shapeRadiusPx.panel,
  panel: 1,
  card: shapeRadiusPx.card / shapeRadiusPx.panel,
  thumbnail: shapeRadiusPx.thumbnail / shapeRadiusPx.panel,
  round: "50%",
} as const;

const layoutSpacing = {
  panelPaddingX: 2.5,
  panelPaddingY: 1,
  controlGap: 1,
  compactGap: 0.5,
  metadataGap: 0.75,
  browserPaddingX: 2.5,
  browserListGap: 0.75,
  browserGridGap: 1.5,
  browserToolbarTop: 1.25,
  browserToolbarBottom: 1,
  menuIconGap: 1.5,
  sidebarPaddingX: 1.5,
  sectionLabelTop: 0.75,
  sectionLabelCompactTop: 0.5,
  sectionLabelBottom: 0.25,
  failureCardX: 1.25,
  failureCardY: 1,
  toolbarButtonX: 1.5,
} as const;

export const appTokens = {
  colorScheme: "dark",
  colors: {
    primary: "#60a5fa",
    background: {
      app: "#09090b",
      surface: "#111118",
    },
    text: {
      primary: "#e2e8f0",
      secondary: "#94a3b8",
      contrast: "#000000",
      inverseMuted: "rgba(255,255,255,0.8)",
    },
    border: {
      subtle: "rgba(255, 255, 255, 0.08)",
    },
    overlay: {
      mediaLabel: "rgba(0,0,0,0.55)",
    },
    error: "#f87171",
    status: {
      draft: {
        main: "oklch(0.88 0.03 255)",
        background: "oklch(0.70 0.04 255 / 0.16)",
        border: "oklch(0.70 0.04 255 / 0.28)",
        contrast: "oklch(0.88 0.03 255)",
      },
      ready: {
        main: "oklch(0.72 0.14 150)",
        background: "oklch(0.72 0.14 150 / 0.16)",
        border: "oklch(0.72 0.14 150 / 0.30)",
        contrast: "oklch(0.89 0.07 150)",
      },
      synced: {
        main: "primary.main",
        background: "rgba(96, 165, 250, 0.14)",
        border: "rgba(96, 165, 250, 0.32)",
        contrast: "#bfdbfe",
      },
      modified: {
        main: "warning.main",
        background: "rgba(251, 191, 36, 0.14)",
        border: "rgba(251, 191, 36, 0.34)",
        contrast: "#fde68a",
      },
      failed: {
        main: "oklch(0.72 0.16 25)",
        background: "oklch(0.72 0.16 25 / 0.17)",
        border: "oklch(0.72 0.16 25 / 0.34)",
        contrast: "oklch(0.89 0.08 25)",
      },
    },
  },
  typography: {
    fontFamily: APP_FONT_FAMILY,
    monoFontFamily: "ui-monospace, monospace",
    fontSize: 13,
    fontSizes: {
      overline: "0.68rem",
      caption: "0.75rem",
      secondaryCaption: "0.72rem",
      body: "0.8rem",
      bodyCompact: "0.78rem",
      bodyDefault: "0.825rem",
      subtitle: "0.925rem",
      dialogTitle: "0.95rem",
      assetKind: "0.65rem",
      assetLabel: "0.6rem",
    },
    fontWeights: {
      regular: 400,
      medium: 600,
      bold: 700,
    },
    letterSpacing: {
      tight: "-0.01em",
      overline: "0.08em",
      chip: "0.04em",
    },
  },
  shape: {
    radiusPx: shapeRadiusPx,
    radius: shapeRadius,
  },
  layout: {
    sidebarWidth: 264,
    panelHeaderMinHeight: 48,
    tabsMinHeight: 40,
    spacing: layoutSpacing,
    window: {
      width: 1600,
      height: 980,
      minWidth: 1200,
      minHeight: 720,
    },
  },
  sizes: {
    preview: {
      thumbnail: 20,
      fallbackIcon: 16,
      fileTypeIcon: 28,
      listRow: 56,
      gridMinWidth: 96,
      aspectRatio: "1 / 1",
      badge: 16,
      badgeIcon: 10,
    },
    icon: {
      sidebarBrand: 18,
      panelAction: 17,
      action: 16,
      compactAction: 15,
    },
    controls: {
      toggleHeight: 28,
    },
    progress: {
      height: 3,
    },
    chip: {
      compactHeight: 18,
    },
    menu: {
      contextWide: 170,
      contextNarrow: 160,
      telegram: 240,
    },
  },
  copy: appCopy,
} as const;
