export type AppTheme = {
  id: string;
  name: string;
  mode: "dark" | "light";
  palette: string[];
  tokens: Record<string, string>;
};

function theme(
  id: string,
  name: string,
  mode: "dark" | "light",
  colors: {
    background: string;
    foreground: string;
    surface: string;
    surface2: string;
    muted: string;
    mutedForeground: string;
    border: string;
    ring: string;
    primary: string;
    primaryForeground: string;
    destructive: string;
    timeline: string;
  },
): AppTheme {
  return {
    id,
    name,
    mode,
    palette: [colors.background, colors.surface, colors.primary, colors.ring],
    tokens: {
      "--background": colors.background,
      "--foreground": colors.foreground,
      "--surface": colors.surface,
      "--surface-2": colors.surface2,
      "--muted": colors.muted,
      "--muted-foreground": colors.mutedForeground,
      "--border": colors.border,
      "--ring": colors.ring,
      "--primary": colors.primary,
      "--primary-foreground": colors.primaryForeground,
      "--destructive": colors.destructive,
      "--timeline": colors.timeline,
    },
  };
}

export const APP_THEMES = [
  theme("tokyo-night", "Calm dark", "dark", {
    background: "#1a1b26",
    foreground: "#c0caf5",
    surface: "#16161e",
    surface2: "#1f2335",
    muted: "#24283b",
    mutedForeground: "#787c99",
    border: "rgba(169, 177, 214, 0.14)",
    ring: "#7aa2f7",
    primary: "#7aa2f7",
    primaryForeground: "#101014",
    destructive: "#f7768e",
    timeline: "#11131f",
  }),
  theme("linen-light", "Linen light", "light", {
    background: "#f8f7f2",
    foreground: "#1a1a1a",
    surface: "#fdfcf8",
    surface2: "#f0eee7",
    muted: "#e9e7df",
    mutedForeground: "#6b6b6b",
    border: "rgba(26, 26, 26, 0.1)",
    ring: "#5b6cff",
    primary: "#5b6cff",
    primaryForeground: "#f8f7f2",
    destructive: "#c14156",
    timeline: "#f4f2ec",
  }),
] satisfies AppTheme[];


export const DEFAULT_THEME_ID = "tokyo-night";

export function themeById(id: string): AppTheme {
  return APP_THEMES.find((theme) => theme.id === id) ?? APP_THEMES[0];
}
