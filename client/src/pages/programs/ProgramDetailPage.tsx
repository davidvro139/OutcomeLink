import { CPL_METRICS } from "@outcomelink/shared";
import {
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  type CreateNegotiatedBenchmarkInput,
  useCreateNegotiatedBenchmark,
  useNegotiatedBenchmarks,
  useProgram,
} from "../../api/programs";
import { AuditHistory } from "../../components/AuditHistory";

const CAN_MANAGE = ["SYSTEM_ADMINISTRATOR"];

export function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const programId = Number(id);
  const { user } = useAuth();
  const { data: program, isLoading } = useProgram(programId);
  const { data: negotiatedBenchmarks } = useNegotiatedBenchmarks(programId);
  const createNegotiatedBenchmark = useCreateNegotiatedBenchmark(programId);
  const [formOpened, { toggle: toggleForm }] = useDisclosure(false);

  const form = useForm<CreateNegotiatedBenchmarkInput>({
    initialValues: {
      metric: "COMPLETION",
      approvedPercentage: 0,
      effectiveStartDate: "",
      approvalReference: "",
    },
    validate: {
      approvedPercentage: (value) => (value > 0 && value <= 100 ? null : "Enter a percentage between 1 and 100"),
      effectiveStartDate: (value) => (value ? null : "Effective start date is required"),
      approvalReference: (value) => (value.trim() ? null : "A record of the Commission's approval is required"),
    },
  });

  async function handleSubmit(values: CreateNegotiatedBenchmarkInput) {
    try {
      await createNegotiatedBenchmark.mutateAsync(values);
      notifications.show({ message: "Negotiated benchmark recorded", color: "green" });
      form.reset();
      toggleForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to record negotiated benchmark",
        color: "red",
      });
    }
  }

  if (isLoading) return <Loader m="xl" />;
  if (!program) return null;

  const canManage = user && CAN_MANAGE.includes(user.role);

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

      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={500}>Negotiated Benchmarks</Text>
          {canManage && (
            <Button size="xs" variant="light" onClick={toggleForm}>
              {formOpened ? "Cancel" : "Record Negotiated Rate"}
            </Button>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          A Commission-approved alternate benchmark for one metric, overriding the standard
          institution-wide rate for the date range specified.
        </Text>

        {formOpened && (
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="sm" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
              <Select
                label="Metric"
                data={CPL_METRICS.map((m) => ({ value: m, label: m }))}
                {...form.getInputProps("metric")}
                allowDeselect={false}
              />
              <NumberInput
                label="Approved percentage"
                min={1}
                max={100}
                {...form.getInputProps("approvedPercentage")}
              />
              <Group grow>
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    Effective start date
                  </Text>
                  <input
                    type="date"
                    {...form.getInputProps("effectiveStartDate")}
                    style={{ padding: 8, width: "100%" }}
                  />
                </div>
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    Effective end date (optional)
                  </Text>
                  <input
                    type="date"
                    {...form.getInputProps("effectiveEndDate")}
                    style={{ padding: 8, width: "100%" }}
                  />
                </div>
              </Group>
              <TextInput
                label="Commission approval reference"
                placeholder="e.g. Commission letter dated 2025-01-15"
                required
                {...form.getInputProps("approvalReference")}
              />
              <Button type="submit" loading={createNegotiatedBenchmark.isPending} size="sm">
                Save
              </Button>
            </Stack>
          </form>
        )}

        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Metric</Table.Th>
              <Table.Th>Approved %</Table.Th>
              <Table.Th>Effective</Table.Th>
              <Table.Th>Approval Reference</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {negotiatedBenchmarks?.map((nb) => (
              <Table.Tr key={nb.id}>
                <Table.Td>{nb.metric}</Table.Td>
                <Table.Td>{nb.approvedPercentage}%</Table.Td>
                <Table.Td>
                  {new Date(nb.effectiveStartDate).toLocaleDateString()} –{" "}
                  {nb.effectiveEndDate ? new Date(nb.effectiveEndDate).toLocaleDateString() : "ongoing"}
                </Table.Td>
                <Table.Td>{nb.approvalReference}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {negotiatedBenchmarks?.length === 0 && (
          <Text size="sm" c="dimmed">
            No negotiated benchmarks on file — standard institution-wide rates apply.
          </Text>
        )}
      </Stack>

      <AuditHistory entityType="Program" entityId={program.id} />
    </Stack>
  );
}
