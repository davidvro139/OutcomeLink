import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * Brand palette based on Ogden-Weber Technical College's logo colors,
 * adjusted for WCAG AA contrast requirements (4.5:1 minimum).
 * Original: #f63831 / #f5120a; adjusted to meet accessibility standards
 * while maintaining the brand's red appearance.
 */
const brandRed: MantineColorsTuple = [
  "#feeceb",
  "#fdd0ce",
  "#fba09d",
  "#f86762",
  "#e63c26",
  "#cc2415",
  "#b01d0f",
  "#961a0c",
  "#7d1609",
  "#650f06",
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
});
