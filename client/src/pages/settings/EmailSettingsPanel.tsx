import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  NumberInput,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { describeSaveError } from "../../lib/formErrors";
import {
  type MailSource,
  useEmailSettings,
  useResetEmailSettings,
  useSaveEmailSettings,
  useSendTestEmail,
} from "../../api/settings";

const SOURCE_LABELS: Record<MailSource, { label: string; color: string }> = {
  institution: { label: "Using this institution's settings", color: "green" },
  server: { label: "Using the server's default settings", color: "blue" },
  none: { label: "Not configured", color: "yellow" },
};

/** Email settings for this institution; the server's own (environment) settings apply until it saves its own. */
export function EmailSettingsPanel() {
  const { data, isLoading } = useEmailSettings();
  const save = useSaveEmailSettings();
  const reset = useResetEmailSettings();
  const sendTest = useSendTestEmail();

  const [host, setHost] = useState("");
  const [port, setPort] = useState<number | string>(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [from, setFrom] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Load the saved values into the form whenever they change (first load, or after a save/reset).
  useEffect(() => {
    if (!data) return;
    setHost(data.settings.smtpHost);
    setPort(data.settings.smtpPort);
    setSecure(data.settings.smtpSecure);
    setUser(data.settings.smtpUser);
    setFrom(data.settings.mailFrom);
    setPassword("");
    setClearPassword(false);
  }, [data]);

  if (isLoading || !data) return <Loader />;

  const canEdit = data.canEdit;
  const source = SOURCE_LABELS[data.source];

  async function handleSave() {
    setError(null);
    try {
      await save.mutateAsync({
        smtpHost: host,
        smtpPort: Number(port),
        smtpSecure: secure,
        smtpUser: user,
        smtpPassword: password,
        clearPassword,
        mailFrom: from,
      });
      notifications.show({ message: "Email settings saved", color: "green" });
    } catch (err) {
      setError(describeSaveError(err));
    }
  }

  async function handleTest() {
    try {
      const result = await sendTest.mutateAsync();
      notifications.show(
        result.status === "SENT"
          ? { message: `Test email sent to ${result.to} — check your inbox`, color: "green" }
          : {
              title:
                result.status === "FAILED" ? "The test email failed" : "Email is not configured",
              message: result.reason ?? "Nothing was sent.",
              color: "red",
              autoClose: false,
            },
      );
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to send",
        color: "red",
      });
    }
  }

  async function handleReset() {
    try {
      await reset.mutateAsync();
      notifications.show({
        message: "Reverted to the server's default email settings",
        color: "blue",
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to revert",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md" maw={560}>
      <Group>
        <Badge color={source.color} size="lg">
          {source.label}
        </Badge>
      </Group>
      <Text size="sm" c="dimmed">
        Invitations, password resets, surveys and notifications are emailed with these settings.
        Until this institution saves its own, the server's default settings are used
        {data.serverDefaultAvailable
          ? ""
          : " — and none are set, so nothing is being emailed (links are shown to copy instead)"}
        .
      </Text>

      {!canEdit && (
        <Alert color="gray">
          Only a System Administrator can change the email settings. You can see them here.
        </Alert>
      )}

      <TextInput
        label="SMTP host"
        placeholder="smtp.example.com"
        value={host}
        onChange={(e) => setHost(e.currentTarget.value)}
        disabled={!canEdit}
      />
      <Group align="flex-end">
        <NumberInput
          label="Port"
          value={port}
          onChange={setPort}
          min={1}
          max={65535}
          w={120}
          disabled={!canEdit}
        />
        <Switch
          label="Use TLS from the start (usually port 465)"
          checked={secure}
          onChange={(e) => setSecure(e.currentTarget.checked)}
          disabled={!canEdit}
          mb={6}
        />
      </Group>
      <TextInput
        label="Username"
        value={user}
        onChange={(e) => setUser(e.currentTarget.value)}
        disabled={!canEdit}
      />
      <PasswordInput
        label="Password"
        description={
          data.settings.passwordSet
            ? "A password is saved. Leave blank to keep it, or type a new one to replace it."
            : "No password is saved."
        }
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        autoComplete="new-password"
        disabled={!canEdit || clearPassword}
      />
      {canEdit && data.settings.passwordSet && (
        <Checkbox
          label="Remove the saved password"
          checked={clearPassword}
          onChange={(e) => setClearPassword(e.currentTarget.checked)}
        />
      )}
      <TextInput
        label="Send from"
        description="For example  College Name <no-reply@college.edu>"
        value={from}
        onChange={(e) => setFrom(e.currentTarget.value)}
        disabled={!canEdit}
      />

      {error && <Alert color="red">{error}</Alert>}

      {canEdit && (
        <Group>
          <Button
            onClick={handleSave}
            loading={save.isPending}
            disabled={!host.trim() || !from.trim()}
          >
            Save settings
          </Button>
          <Button
            variant="light"
            onClick={handleTest}
            loading={sendTest.isPending}
            disabled={data.source === "none"}
          >
            Send test email to me
          </Button>
          {data.source === "institution" && (
            <Button variant="subtle" color="gray" onClick={handleReset} loading={reset.isPending}>
              Use the server's defaults
            </Button>
          )}
        </Group>
      )}
      {canEdit && (
        <Text size="xs" c="dimmed">
          The test email uses the settings that are currently saved, so save first.
        </Text>
      )}
    </Stack>
  );
}
