import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

export function renderWithProviders(ui: ReactElement) {
  // A fresh QueryClient per render — retries off and no caching between tests
  // (per-test isolation) so a failing query doesn't retry for real and slow
  // the suite down, and one test's cached data can't leak into the next.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MantineProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MantineProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
