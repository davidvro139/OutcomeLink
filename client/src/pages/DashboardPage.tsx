import { Alert, Badge, Group, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

interface HealthStatus {
  status: string;
}

export function DashboardPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiRequest<HealthStatus>("/health"),
    retry: false,
  });

  return (
    <Stack p="xl" gap="md">
      <Title order={1}>OutcomeLink</Title>
      <Text c="dimmed">
        Scaffold checkpoint: Mantine, React Router, and TanStack Query are wired up. This card
        reflects whether the API server is reachable.
      </Text>
      <Group>
        <Text fw={500}>API status:</Text>
        {isLoading && <Badge color="gray">Checking...</Badge>}
        {data && <Badge color="green">{data.status}</Badge>}
        {error && <Badge color="red">Unreachable</Badge>}
      </Group>
      {error && (
        <Alert color="red" title="API not reachable">
          Start the server with <code>npm run dev:server</code> from the repo root.
        </Alert>
      )}
    </Stack>
  );
}
