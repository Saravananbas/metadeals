/**
 * Framework-agnostic design tokens shared across Web, Mobile API, and client apps.
 * Colors reference the official brand variables defined in metadeals4u-color-system.css.
 */
export const sharedDesignTokens = {
  colors: {
    primary: "var(--md-color-primary)",
    primaryHover: "var(--md-color-primary-hover)",
    primarySoft: "var(--md-color-primary-soft)",
    accent: "var(--md-color-accent)",
    accentHover: "var(--md-color-accent-hover)",
    accentSoft: "var(--md-color-accent-soft)",
    page: "var(--md-color-page)",
    surface: "var(--md-color-surface)",
    surfaceMuted: "var(--md-color-surface-muted)",
    text: "var(--md-color-text)",
    textSecondary: "var(--md-color-text-secondary)",
    textMuted: "var(--md-color-text-muted)",
    border: "var(--md-color-border)",
    success: "var(--md-color-success)",
    danger: "var(--md-color-danger)",
    warning: "var(--md-color-warning)",
  },
  typography: {
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif",
    sizes: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
      display: 32,
    },
    weights: {
      regular: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
  },
  radii: {
    sm: 6,
    md: 10,
    lg: 16,
    full: 9999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
} as const;

export type SharedDesignTokens = typeof sharedDesignTokens;
