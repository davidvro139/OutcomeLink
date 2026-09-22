import { Button, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { type Employer, useUpdateEmployerLocation } from "../../api/employers";
import { useAuth } from "../../auth/AuthContext";

export function EmployerLocationPanel({ employer }: { employer: Employer }) {
  const { user } = useAuth();
  const canEdit = user && ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR", "CAREER_SERVICES_STAFF"].includes(user.role);
  const [city, setCity] = useState(employer.city ?? "");
  const [state, setState] = useState(employer.state ?? "");
  const update = useUpdateEmployerLocation(employer.id);
  async function save() {
    try {
      await update.mutateAsync({ city: city.trim(), state: state.trim() });
      notifications.show({ message: "Employer location saved", color: "green" });
    } catch (error) {
      notifications.show({ message: error instanceof Error ? error.message : "Unable to save location", color: "red" });
    }
  }
  return <Paper withBorder p="md">
    <Stack gap="sm">
      <Text fw={500}>City and state</Text>
      {canEdit ? <>
        <Text size="sm">Geographic Placements groups employers by city and state. No street address or exact location is needed. US cities are mapped to approximate city locations.</Text>
        <Group grow>
          <TextInput label="City" value={city} onChange={(e) => setCity(e.currentTarget.value)} maxLength={100} />
          <TextInput label="State" description="State name or abbreviation, e.g. Colorado or CO" value={state} onChange={(e) => setState(e.currentTarget.value)} maxLength={100} />
        </Group>
        <Button onClick={() => void save()} loading={update.isPending} style={{ alignSelf: "flex-start" }}>Save location</Button>
      </> : <Text size="sm">{[employer.city, employer.state].filter(Boolean).join(", ") || "Location not recorded"}</Text>}
    </Stack>
  </Paper>;
}
