export const tokens = {
  color: {
    slate: {
      50: "#F5F7FA",
      100: "#E7ECF2",
      400: "#7C8896",
      700: "#2E3A47",
      900: "#161D25",
    },
    inkBlue: { 500: "#1F3A5F", 600: "#16283F" },
    amber: { 100: "#FDF3DA", 500: "#C88A1E" },
    cashierSurface: "#FAFAF9",
    cashierText: "#141414",
    confirmGreen: { 500: "#1F8A4C", 600: "#186E3D" },
    dangerRed: { 500: "#B23A3A", 600: "#8F2E2E" },
    storefrontNeutral: {
      50: "#FAFAFA",
      200: "#E5E5E5",
      700: "#404040",
      900: "#171717",
    },
  },
  font: {
    ui: "'Manrope', ui-sans-serif, system-ui, sans-serif",
    tabularNums: "font-variant-numeric: tabular-nums;",
  },
  radius: { sm: "4px", md: "8px", lg: "12px" },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
  },
  breakpoint: { sm: "480px", md: "768px", lg: "1024px", xl: "1280px" },
} as const;

export const cssVariables = {
  "--urp-ink": tokens.color.inkBlue[600],
  "--urp-surface": tokens.color.cashierSurface,
  "--urp-text": tokens.color.cashierText,
  "--urp-attention": tokens.color.amber[500],
  "--urp-confirm": tokens.color.confirmGreen[500],
  "--urp-danger": tokens.color.dangerRed[500],
  "--urp-radius-sm": tokens.radius.sm,
  "--urp-radius-md": tokens.radius.md,
  "--urp-radius-lg": tokens.radius.lg,
} as const;

export type CssVariables = typeof cssVariables;
