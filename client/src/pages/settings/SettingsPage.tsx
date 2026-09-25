import { Group, Stack, Tabs, Text, Title } from "@mantine/core";
import { usePermissions } from "../../auth/usePermissions";
import { BackupPanel } from "./BackupPanel";
import { EmailSettingsPanel } from "./EmailSettingsPanel";
import { RetentionPanel } from "./RetentionPanel";
import { HelpLink } from "../../help/HelpLink";

/** Settings (docs/TODO.md): the operational settings that used to be server environment variables only. */
export function SettingsPage() {
  const { canAdminister } = usePermissions();
  if (!canAdminister) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        You don't have access to this page.
      </Text>
    );
  }
  return (
    <Stack p="xl" gap="md">
      <Group gap="md" align="baseline">
        <Title order={2}>Settings</Title>
        <HelpLink slug="administration" />
      </Group>
      <Tabs defaultValue="email" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="email">Email</Tabs.Tab>
          <Tabs.Tab value="retention">Data retention</Tabs.Tab>
          <Tabs.Tab value="backups">Backups</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="email" pt="md">
          <EmailSettingsPanel />
        </Tabs.Panel>
        <Tabs.Panel value="retention" pt="md">
          <RetentionPanel />
        </Tabs.Panel>
        <Tabs.Panel value="backups" pt="md">
          <BackupPanel />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
