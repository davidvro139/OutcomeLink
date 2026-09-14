import { Badge, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";
import { useProgram } from "../../api/programs";
import { AuditHistory } from "../../components/AuditHistory";

export function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const programId = Number(id);
  const { data: program, isLoading } = useProgram(programId);

  if (isLoading) return <Loader m="xl" />;
  if (!program) return null;

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{program.name}</Title>
          <Text c="dimmed">
            {program.code} · {program.credentialType}
          </Text>
        </div>
        <Badge color={program.active ? "green" : "gray"} size="lg">
          {program.active ? "Active" : "Inactive"}
        </Badge>
      </Group>

      <Group gap="xl">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            CIP Code
          </Text>
          <Text>{program.cipCode ?? "—"}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Program Length
          </Text>
          <Text>{program.programLength ?? "—"}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Licensure Required
          </Text>
          <Text>{program.licensureRequired ? "Yes" : "No"}</Text>
        </div>
      </Group>

      <AuditHistory entityType="Program" entityId={program.id} />
    </Stack>
  );
}
