import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * Brand palette sampled directly from Ogden-Weber Technical College's logo
 * (the red "T" mark, near-black wordmark, and gray ring/subtext) — the
 * institution behind the outcomes-training material in
 * docs/Outcomes and CPL slides.pdf. Only the color values are reused here,
 * not the logo mark itself.
 */
const brandRed: MantineColorsTuple = [
  "#feeceb",
  "#fdd0ce",
  "#fba09d",
  "#f86762",
  "#f63831",
  "#f5120a",
  "#d71009",
  "#ba0e08",
  "#980b06",
  "#6c0804",
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
