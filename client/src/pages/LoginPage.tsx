import {
  Alert,
  Button,
  Center,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { ROLE_LABELS, type Role } from "@outcomelink/shared";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiRequestError } from "../lib/apiClient";

interface LoginFormValues {
  email: string;
  password: string;
}

// One seeded account per role at the demo institution (server/prisma/seed.ts,
// "Creating staff users" — all share this password). Lets a reviewer try
// every permission level without knowing the seed data by heart. Dev-only:
// import.meta.env.DEV is false in a production build, so this section (and
// the credentials it exposes) never ships.
const DEMO_PASSWORD = "password123";
const DEMO_ACCOUNTS: { role: Role; name: string; email: string }[] = [
  { role: "SYSTEM_ADMINISTRATOR", name: "Sam Sysadmin", email: "sam@mwtc.edu" },
  { role: "INSTITUTIONAL_ADMINISTRATOR", name: "Ada Administrator", email: "ada@mwtc.edu" },
  { role: "PROGRAM_ADMINISTRATOR", name: "Priya Patel", email: "priya.patel@mwtc.edu" },
  { role: "CAREER_SERVICES_STAFF", name: "Jordan Blake", email: "jordan.blake@mwtc.edu" },
  { role: "INSTRUCTOR_STAFF", name: "Terry Osei", email: "terry.osei@mwtc.edu" },
  { role: "READ_ONLY_AUDITOR", name: "Quinn Alvarado", email: "quinn.alvarado@mwtc.edu" },
];

interface LoginLocationState {
  from?: Location;
  prefillEmail?: string;
  successMessage?: string;
}

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginLocationState | undefined;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // Read once at mount — e.g. arriving here right after SetPasswordPage
  // completes, the same way that page's own success is communicated without
  // a shared server-side session.
  const [successMessage] = useState(locationState?.successMessage ?? null);

  const form = useForm<LoginFormValues>({
    initialValues: { email: locationState?.prefillEmail ?? "", password: "" },
    validate: {
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : "Enter a valid email"),
      password: (value) => (value.length > 0 ? null : "Password is required"),
    },
  });

  if (status === "authenticated") {
    const destination = locationState?.from?.pathname ?? "/";
    return <Navigate to={destination} replace />;
  }

  async function handleLogin(email: string, password: string) {
    setError(null);
    setSubmitting(true);
    setPendingEmail(email);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Unable to log in. Please try again.",
      );
    } finally {
      setSubmitting(false);
      setPendingEmail(null);
    }
  }

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={440}>
        <Stack gap="lg">
          <div>
            <Title order={2}>OutcomeLink</Title>
            <Text c="dimmed" size="sm">
              Sign in to continue
            </Text>
          </div>

          {successMessage && <Alert color="green">{successMessage}</Alert>}

          {error && (
            <Alert color="red" title="Sign in failed">
              {error}
            </Alert>
          )}

          <form onSubmit={form.onSubmit((values) => handleLogin(values.email, values.password))}>
            <Stack gap="md">
              <TextInput
                type="email"
                label="Email"
                placeholder="you@institution.edu"
                required
                {...form.getInputProps("email")}
              />
              <PasswordInput
                label="Password"
                placeholder="Your password"
                required
                {...form.getInputProps("password")}
              />
              <Button type="submit" loading={submitting} fullWidth>
                Sign in
              </Button>
            </Stack>
          </form>

          {import.meta.env.DEV && (
            <>
              <Divider label="Development only — demo accounts" labelPosition="center" />
              <Stack gap={6}>
                {DEMO_ACCOUNTS.map((account) => (
                  <Button
                    key={account.email}
                    variant="light"
                    color="grape"
                    fullWidth
                    loading={pendingEmail === account.email}
                    disabled={submitting && pendingEmail !== account.email}
                    onClick={() => handleLogin(account.email, DEMO_PASSWORD)}
                  >
                    <Group justify="space-between" w="100%" wrap="nowrap">
                      <Text size="sm" fw={500}>
                        {ROLE_LABELS[account.role]}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {account.name}
                      </Text>
                    </Group>
                  </Button>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
