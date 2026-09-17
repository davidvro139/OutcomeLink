import { BarChart, PieChart } from "@mantine/charts";
import { Anchor, Badge, Box, Button, Group, Loader, Modal, Paper, SimpleGrid, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  useFollowUpEffectivenessReport,
  useOutcomeFunnelReport,
  usePlacementQualityReport,
  useTimeToEmploymentReport,
  useUnknownOutcomesReport,
} from "../../api/reports";
import { useStartGraduateCampaign } from "../../api/surveys";

const CAN_START_CAMPAIGN = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
  "INSTRUCTOR_STAFF",
];

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase">
        {label}
      </Text>
      <Title order={2} c={color}>
        {value}
      </Title>
    </Paper>
  );
}

function TimeToEmploymentPanel({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data, isLoading } = useTimeToEmploymentReport(reportingPeriodId);
  if (isLoading) return <Loader />;
  if (!data) return null;

  if (data.overall.count === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No completers this period have both a completion date and a recorded employment start date yet.
      </Text>
    );
  }

  const distributionData = [
    { bucket: "0–30 days", count: data.distribution.immediate30 },
    { bucket: "31–60 days", count: data.distribution.days31to60 },
    { bucket: "61–90 days", count: data.distribution.days61to90 },
    { bucket: "90+ days", count: data.distribution.over90 },
  ];

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <StatCard label="Placements measured" value={data.overall.count} />
        <StatCard label="Average days to employment" value={data.overall.averageDays ?? "—"} />
        <StatCard label="Median days to employment" value={data.overall.medianDays ?? "—"} />
      </SimpleGrid>

      <BarChart
        h={220}
        data={distributionData}
        dataKey="bucket"
        series={[{ name: "count", color: "blue.6" }]}
      />

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Program</Table.Th>
            <Table.Th>Placements</Table.Th>
            <Table.Th>Average days</Table.Th>
            <Table.Th>Median days</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.byProgram.map((row) => (
            <Table.Tr key={row.program.id}>
              <Table.Td>{row.program.name}</Table.Td>
              <Table.Td>{row.count}</Table.Td>
              <Table.Td>{row.averageDays ?? "—"}</Table.Td>
              <Table.Td>{row.medianDays ?? "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function PlacementQualityPanel({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data, isLoading } = usePlacementQualityReport(reportingPeriodId);
  if (isLoading) return <Loader />;
  if (!data) return null;

  if (data.totalPlacements === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No employment records starting within this period yet.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Institution-wide — employment records don't carry a program of their own, so this view can't be
        broken down by program (the Data Validation tab flags this same limit for a couple of other
        checks).
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <StatCard label="Placements" value={data.totalPlacements} />
        <StatCard label="Full-time rate" value={`${data.fullTimeRate}%`} />
        <StatCard label="Related-to-training rate" value={`${data.relatedRate}%`} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <StatCard label="Verified rate" value={`${data.verifiedRate}%`} />
        <StatCard label="Average wage" value={data.averageWage !== null ? `$${data.averageWage.toLocaleString()}` : "—"} />
        <StatCard label="Median wage" value={data.medianWage !== null ? `$${data.medianWage.toLocaleString()}` : "—"} />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        Wage figures are based on {data.wageRecordCount} of {data.totalPlacements} placements with a wage
        on file.
      </Text>
    </Stack>
  );
}

function OutcomeFunnelPanel({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data, isLoading } = useOutcomeFunnelReport(reportingPeriodId);
  if (isLoading) return <Loader />;
  if (!data) return null;

  if (data.stages[0]!.count === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No completers classified for this period yet — compute the period first.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        How far this period's completers make it toward a fully documented, evidenced outcome.
      </Text>
      <BarChart
        h={260}
        data={data.stages}
        dataKey="stage"
        series={[{ name: "count", color: "teal.6" }]}
        gridAxis="y"
      />
      <Table striped>
        <Table.Tbody>
          {data.stages.map((s) => (
            <Table.Tr key={s.stage}>
              <Table.Td>{s.stage}</Table.Td>
              <Table.Td>{s.count}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function GraduateCampaignButton({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { user } = useAuth();
  const startCampaign = useStartGraduateCampaign();
  const [opened, { open, close }] = useDisclosure(false);

  if (!user || !CAN_START_CAMPAIGN.includes(user.role)) return null;

  async function handleStart() {
    try {
      const result = await startCampaign.mutateAsync({ reportingPeriodId });
      notifications.show({
        message:
          result.skipped.length > 0
            ? `Sent ${result.sentCount} of ${result.targetedCount} targeted students; ${result.skipped.length} already had a pending survey.`
            : `Sent graduate surveys to all ${result.sentCount} targeted students.`,
        color: "green",
        autoClose: false,
      });
      close();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to start outreach campaign",
        color: "red",
      });
    }
  }

  return (
    <>
      <Button size="xs" variant="light" color="grape" onClick={open}>
        Start Outreach Campaign
      </Button>
      <Modal opened={opened} onClose={close} title="Start Graduate Outreach Campaign">
        <Stack gap="md">
          <Text size="sm">
            Sends a graduate survey to every student this period with an unresolved outcome —
            seeking/unknown status or no outcome record at all — skipping anyone who already has a
            survey pending. This is the deferred "Quarterly graduate outreach campaign" item; run it
            whenever it's appropriate rather than on an actual schedule.
          </Text>
          <Button onClick={handleStart} loading={startCampaign.isPending} color="grape">
            Send Surveys Now
          </Button>
        </Stack>
      </Modal>
    </>
  );
}

function UnknownOutcomesPanel({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data, isLoading } = useUnknownOutcomesReport(reportingPeriodId);
  if (isLoading) return <Loader />;
  if (!data) return null;

  if (data.totalSeekingOrUnknown === 0 && data.totalMissingRecord === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No students with an unresolved outcome this period.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <GraduateCampaignButton reportingPeriodId={reportingPeriodId} />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <StatCard label="Seeking / unknown" value={data.totalSeekingOrUnknown} color="orange" />
        <StatCard label="Missing outcome record" value={data.totalMissingRecord} color="red" />
      </SimpleGrid>

      <Title order={5}>By program</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Program</Table.Th>
            <Table.Th>Seeking / unknown</Table.Th>
            <Table.Th>Missing record</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.byProgram.map((row) => (
            <Table.Tr key={row.program?.id ?? "none"}>
              <Table.Td>{row.program?.name ?? "No program on file"}</Table.Td>
              <Table.Td>{row.seekingOrUnknown}</Table.Td>
              <Table.Td>{row.missingRecord}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Title order={5}>Students seeking or with unknown status</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Student</Table.Th>
            <Table.Th>Program</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.students.map((row) => (
            <Table.Tr key={row.student.id}>
              <Table.Td>
                <Anchor component={Link} to={`/students/${row.student.id}`}>
                  {row.student.firstName} {row.student.lastName}
                </Anchor>
              </Table.Td>
              <Table.Td>{row.program?.name ?? "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function FollowUpEffectivenessPanel() {
  const { data, isLoading } = useFollowUpEffectivenessReport();
  if (isLoading) return <Loader />;
  if (!data) return null;

  if (data.totalAttempts === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No follow-up attempts logged yet.
      </Text>
    );
  }

  const pieData = data.byOutcome.map((o, i) => ({
    name: o.outcome.replaceAll("_", " "),
    value: o.count,
    color: ["blue.6", "teal.6", "grape.6", "orange.6", "red.6", "cyan.6", "yellow.6", "pink.6", "lime.6", "gray.6"][
      i % 10
    ],
  }));

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Not scoped to a reporting period — follow-up campaigns for one period's completers commonly run
        into the next, and staff effectiveness is a cross-period question anyway.
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <StatCard label="Total attempts" value={data.totalAttempts} />
        <StatCard label="Resolving rate" value={`${data.resolvingRate}%`} color="teal" />
      </SimpleGrid>

      <Group align="flex-start" wrap="wrap">
        <Stack gap="xs" align="center">
          <PieChart size={220} data={pieData} withLabelsLine withLabels labelsType="percent" withTooltip />
          <Stack gap={4}>
            {pieData.map((slice) => (
              <Group key={slice.name} gap="xs" wrap="nowrap">
                <Box w={10} h={10} bg={slice.color} style={{ borderRadius: 2, flexShrink: 0 }} />
                <Text size="xs">
                  {slice.name} ({slice.value})
                </Text>
              </Group>
            ))}
          </Stack>
        </Stack>
        <Table striped highlightOnHover flex={1} miw={280}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Staff</Table.Th>
              <Table.Th>Attempts</Table.Th>
              <Table.Th>Resolving rate</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.byStaff.map((row) => (
              <Table.Tr key={row.staffUser.id}>
                <Table.Td>{row.staffUser.name}</Table.Td>
                <Table.Td>{row.attempts}</Table.Td>
                <Table.Td>
                  <Badge color={row.resolvingRate >= 50 ? "teal" : "gray"}>{row.resolvingRate}%</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Group>
    </Stack>
  );
}

/**
 * Phase 2 P8 (docs/TODO.md): drill-down reports answering questions the CPL
 * Dashboard and Readiness tab don't — speed and quality of placements, where
 * the outcome-documentation pipeline leaks, and whether follow-up effort is
 * paying off.
 */
export function ReportsTab({ reportingPeriodId }: { reportingPeriodId: number }) {
  return (
    <Tabs defaultValue="time-to-employment" orientation="vertical" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="time-to-employment">Time to Employment</Tabs.Tab>
        <Tabs.Tab value="placement-quality">Placement Quality</Tabs.Tab>
        <Tabs.Tab value="outcome-funnel">Outcome Funnel</Tabs.Tab>
        <Tabs.Tab value="unknown-outcomes">Unknown Outcomes</Tabs.Tab>
        <Tabs.Tab value="follow-up-effectiveness">Follow-Up Effectiveness</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="time-to-employment" pl="md">
        <TimeToEmploymentPanel reportingPeriodId={reportingPeriodId} />
      </Tabs.Panel>
      <Tabs.Panel value="placement-quality" pl="md">
        <PlacementQualityPanel reportingPeriodId={reportingPeriodId} />
      </Tabs.Panel>
      <Tabs.Panel value="outcome-funnel" pl="md">
        <OutcomeFunnelPanel reportingPeriodId={reportingPeriodId} />
      </Tabs.Panel>
      <Tabs.Panel value="unknown-outcomes" pl="md">
        <UnknownOutcomesPanel reportingPeriodId={reportingPeriodId} />
      </Tabs.Panel>
      <Tabs.Panel value="follow-up-effectiveness" pl="md">
        <FollowUpEffectivenessPanel />
      </Tabs.Panel>
    </Tabs>
  );
}
