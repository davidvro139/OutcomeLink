import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/charts/styles.css";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ApiRequestError } from "./lib/apiClient";
<<<<<<< HEAD
import { theme } from "./theme";
=======
import { cssVariablesResolver, theme } from "./theme";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 401/403/404 is a definitive answer, not a transient failure —
      // retrying it 3 times (react-query's default) just makes an
      // out-of-scope or nonexistent record's detail page spin for ~8
      // seconds before finally settling. Surfaced by program/campus access
      // scoping (project review, 2026-09-18) making a real 404 a routine,
      // expected outcome instead of a rare cross-institution edge case.
      retry: (failureCount, error) =>
<<<<<<< HEAD
        !(error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) && failureCount < 3,
=======
        !(error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) &&
        failureCount < 3,
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
<<<<<<< HEAD
    <MantineProvider theme={theme} defaultColorScheme="dark">
=======
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="dark"
    >
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
