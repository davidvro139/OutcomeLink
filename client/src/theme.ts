import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * Brand palette adjusted for WCAG AA contrast (4.5:1 minimum against dark backgrounds).
 * The logo's original red (#f63831) was too dark for accessibility.
 * Adjusted to brighter red-orange to meet contrast requirements.
 */
const brandRed: MantineColorsTuple = [
  "#ffe5e0",
  "#ffc9bf",
  "#ffae9e",
  "#ff927d",
  "#ff5555",
  "#ff2e2e",
  "#e62020",
  "#cc1a1a",
  "#b21515",
  "#8c0f0f",
];

/** Neutral charcoal ramp matching the logo's gray/near-black, replacing Mantine's default cool blue-gray dark palette. */
const charcoal: MantineColorsTuple = [
  "#cccccc",
  "#adadad",
  "#949494",
  "#666666",
  "#424242",
  "#333333",
  "#2b2b2b",
  "#212121",
  "#1a1a1a",
  "#121212",
];

export const theme = createTheme({
  primaryColor: "brandRed",
  primaryShade: { light: 6, dark: 5 },
  colors: {
    brandRed,
    dark: charcoal,
  },
  components: {
    Button: {
      styles: () => ({
        root: {
          "&[data-variant='filled']": {
            color: "#000",
          },
        },
      }),
    },
  },
});
