import { Alert, Button, Center, Group, Loader, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useNavigate, useParams } from "react-router-dom";
import { useCompleteSetPassword, useSetPasswordInfo } from "../api/publicSetPassword";
import { ApiRequestError } from "../lib/apiClient";

interface SetPasswordFormValues {
  password: string;
  confirmPassword: string;
}

/**
 * User Administration (docs/TODO.md): public, unauthenticated "set your own
 * password" form, reached via a copyable link built from an invitation or
 * admin-initiated password reset (User.passwordSetToken) — the same pattern
 * as the Graduate/Employer Survey response links, since this app has no
 * email infrastructure to deliver either kind of link automatically.
 */
export function SetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const { data: info, isLoading, isError, error } = useSetPasswordInfo(token);
  const complete = useCompleteSetPassword(token ?? "");
  const navigate = useNavigate();

  const form = useForm<SetPasswordFormValues>({
    initialValues: { password: "", confirmPassword: "" },
    validate: {
      password: (value) => (value.length >= 8 ? null : "Password must be at least 8 characters"),
      confirmPassword: (value, values) => (value === values.password ? null : "Passwords don't match"),
    },
  });

  async function handleSubmit(values: SetPasswordFormValues) {
    try {
      const result = await complete.mutateAsync(values.password);
      navigate("/login", {
        state: { prefillEmail: result.email, successMessage: "Password set — you can now sign in." },
      });
    } catch {
      // Surfaced below via complete.isError / complete.error.
    }
  }

  return (
    <Center mih="100vh" bg="var(--mantine-color-body)" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={440}>
        <Stack gap="lg">
          <div>
            <Title order={2}>Set Your Password</Title>
            <Text c="dimmed" size="sm">
              OutcomeLink
            </Text>
          </div>

          {isLoading && (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          )}

          {isError && (
            <Alert color="red" title="Link invalid">
              {error instanceof ApiRequestError ? error.message : "This link is invalid or has expired."}
            </Alert>
          )}

          {info && (
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="md">
                <Text size="sm">
                  Welcome, {info.name}. Choose a password for your OutcomeLink account ({info.email}).
                </Text>
                <PasswordInput label="New password" required {...form.getInputProps("password")} />
                <PasswordInput label="Confirm password" required {...form.getInputProps("confirmPassword")} />
                {complete.isError && (
                  <Alert color="red">
                    {complete.error instanceof ApiRequestError
                      ? complete.error.message
                      : "Failed to set password."}
                  </Alert>
                )}
                <Button type="submit" loading={complete.isPending} fullWidth>
                  Set Password
                </Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
