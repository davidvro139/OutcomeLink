<<<<<<< HEAD
import { createTheme, type MantineColorsTuple } from "@mantine/core";
=======
import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from "@mantine/core";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

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
<<<<<<< HEAD
  "#d71009",
=======
  "#c90f08",
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  "#ba0e08",
  "#980b06",
  "#6c0804",
];

/** Neutral charcoal ramp matching the logo's gray/near-black, replacing Mantine's default cool blue-gray dark palette. */
const charcoal: MantineColorsTuple = [
  "#cccccc",
  "#adadad",
<<<<<<< HEAD
  "#949494",
=======
  "#a8a8a8",
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  "#666666",
  "#424242",
  "#333333",
  "#2b2b2b",
  "#212121",
  "#1a1a1a",
  "#121212",
];

<<<<<<< HEAD
export const theme = createTheme({
  primaryColor: "brandRed",
  primaryShade: { light: 6, dark: 5 },
=======
/**
 * Link text in dark mode: the brand red Mantine uses for anchors is only ~3.7:1 on the card
 * backgrounds; this lighter tint clears WCAG AA's 4.5:1. (Set through the resolver because Mantine
 * writes its own color variables at runtime, after any stylesheet.)
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  // Mantine's light-mode "dimmed" gray (#868e96) is only 3.3:1 on white; this darker gray clears 4.5:1.
  light: { "--mantine-color-dimmed": "#5a6169" },
  dark: { "--mantine-color-anchor": "#ff7a75" },
});

export const theme = createTheme({
  primaryColor: "brandRed",
  // Shade 6 in dark mode too: white text on the brighter shade 5 is only 4.2:1, under the 4.5:1 WCAG AA needs.
  primaryShade: { light: 6, dark: 6 },
  // Picks black or white text per background so every filled badge, button and icon meets AA contrast
  // (white on Mantine's light greens, yellows and grays does not).
  autoContrast: true,
  // Mantine's default threshold (0.3) leaves white text on mid-tone reds, blues and grapes at 3.3-4.0:1. At 0.18 white and
  // black text are equally legible, so whichever is chosen meets 4.5:1.
  luminanceThreshold: 0.18,
  components: {
    // A link inside a sentence must be recognisable without relying on color alone (WCAG 1.4.1).
    Anchor: { defaultProps: { underline: "always" } },
    // The dialog's X button is an icon with no text, so a screen reader would announce it as just "button".
    Modal: { defaultProps: { closeButtonProps: { "aria-label": "Close dialog" } } },
    Drawer: { defaultProps: { closeButtonProps: { "aria-label": "Close panel" } } },
  },
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  colors: {
    brandRed,
    dark: charcoal,
  },
});
