import {
  Alert,
  Button,
  Center,
  Divider,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiRequestError } from "../lib/apiClient";

interface LoginFormValues {
  email: string;
  password: string;
}

// Seeded test account from local dev setup — see the session's earlier work
// creating this user directly against the dev database. Dev-only: import.meta.env.DEV
// is false in a production build, so this button (and the credentials) never ship.
const DEMO_CREDENTIALS = { email: "ada@mwtc.edu", password: "password123" };

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    initialValues: { email: "", password: "" },
    validate: {
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : "Enter a valid email"),
      password: (value) => (value.length > 0 ? null : "Password is required"),
    },
  });

  if (status === "authenticated") {
    const destination = (location.state as { from?: Location })?.from?.pathname ?? "/";
    return <Navigate to={destination} replace />;
  }

  async function handleLogin(email: string, password: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Unable to log in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={380}>
        <Stack gap="lg">
          <div>
            <Title order={2}>OutcomeLink</Title>
            <Text c="dimmed" size="sm">
              Sign in to continue
            </Text>
          </div>

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
              <Divider label="Development only" labelPosition="center" />
              <Button
                variant="light"
                color="grape"
                fullWidth
                loading={submitting}
                onClick={() => handleLogin(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)}
              >
                Demo login
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
