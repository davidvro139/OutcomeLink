import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; Mantine's color-scheme detection calls
// it on mount. Minimal stub is enough since no test exercises theme switching.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
