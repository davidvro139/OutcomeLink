import { Alert, Badge, Group, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/apiClient";

interface HealthStatus {
  status: string;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, error, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiRequest<HealthStatus>("/health"),
    retry: false,
  });

  return (
    <Stack p="xl" gap="md">
      <Title order={1}>Welcome, {user?.name}</Title>
      <Text c="dimmed">
        Stage 5 checkpoint: authenticated shell with silent session restore, global search, and
        role-aware routing are wired up. Feature screens (programs, students, CPL dashboard, etc.)
        land in stage 6.
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
