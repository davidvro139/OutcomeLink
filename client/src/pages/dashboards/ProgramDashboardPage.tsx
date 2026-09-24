import { RISK_STATUS_LABELS, type RiskStatus } from "@outcomelink/shared";
import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useReportingPeriods } from "../../api/accreditation";
import {
  type AttentionItem,
  downloadProgramDashboard,
  useProgramDashboard,
  useRecomputeDashboard,
} from "../../api/programDashboard";
import { useAuth } from "../../auth/AuthContext";
import { ProgramCard } from "./ProgramCard";
import { STATUS_COLORS } from "./riskDisplay";
import { formatDateOnly } from "../../lib/dates";

/** Roles that may refresh the stored results — mirrors the server's recompute route. */
const CAN_RECOMPUTE = [
  "PROGRAM_ADMINISTRATOR",
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
];

const SEVERITY_COLORS = { 3: "red", 2: "yellow", 1: "gray" } as const;
const LINK_TABS = { reports: "reports", validation: "validation", results: "dashboard" } as const;

function SummaryTile({ status, count }: { status: RiskStatus; count: number }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase">
        {RISK_STATUS_LABELS[status]}
      </Text>
      <Group gap="xs" align="baseline">
        <Title order={2} c={count > 0 && status !== "NO_DATA" ? STATUS_COLORS[status] : undefined}>
          {count}
        </Title>
        <Text size="sm" c="dimmed">
          {count === 1 ? "program" : "programs"}
        </Text>
      </Group>
    </Paper>
  );
}

const ATTENTION_PREVIEW = 8;

function AttentionList({ items, periodId }: { items: AttentionItem[]; periodId: number }) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) {
    return (
      <Alert color="green" title="Nothing needs attention">
        Every program with data is meeting its benchmarks, and there are no open issues.
      </Alert>
    );
  }
  return (
    <Paper withBorder p="md" radius="md">
      <Title order={5} mb="xs">
        Needs attention
      </Title>
      <Stack gap="xs">
        {(showAll ? items : items.slice(0, ATTENTION_PREVIEW)).map((item, index) => (
          <Group key={index} gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon
              size={10}
              radius="xl"
              color={SEVERITY_COLORS[item.severity]}
              mt={6}
              aria-hidden
            />
            <Text size="sm" style={{ flex: 1 }}>
              {item.message}
            </Text>
            {item.link && (
              <Anchor
                component={Link}
                size="sm"
                to={`/accreditation/reporting-periods/${periodId}?tab=${LINK_TABS[item.link]}`}
                style={{ whiteSpace: "nowrap" }}
              >
                Open
              </Anchor>
            )}
          </Group>
        ))}
      </Stack>
      {items.length > ATTENTION_PREVIEW && (
        <Button variant="subtle" size="compact-sm" mt="xs" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      )}
    </Paper>
  );
}

/** Program-director dashboard (docs/TODO.md): each program against its benchmarks, whether it can still get there before the deadline, and what to do next. */
export function ProgramDashboardPage() {
  const { user } = useAuth();
  const { data: periods } = useReportingPeriods();
  const [periodId, setPeriodId] = useState<number | undefined>(undefined);
  const { data, isLoading, isError, error } = useProgramDashboard(periodId);
  const recompute = useRecomputeDashboard();
  const [exporting, setExporting] = useState(false);

  const canRecompute = !!user && CAN_RECOMPUTE.includes(user.role);
  const period = data?.period ?? null;

  async function handleRecompute() {
    if (!period) return;
    try {
      await recompute.mutateAsync(period.id);
      notifications.show({ message: "Results refreshed", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Could not refresh the results",
        color: "red",
      });
    }
  }

  async function handleExport() {
    if (!period) return;
    setExporting(true);
    try {
      await downloadProgramDashboard(period.id, period.label);
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Export failed",
        color: "red",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Stack p="xl" gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>My Programs</Title>
          <Text c="dimmed" size="sm">
            Where each program stands against its benchmarks, and whether it can still get there.
          </Text>
        </div>
        <Group>
          <Select
            label="Reporting period"
            w={240}
            allowDeselect={false}
            data={(periods ?? []).map((p) => ({ value: String(p.id), label: p.label }))}
            value={String(periodId ?? period?.id ?? "")}
            onChange={(v) => setPeriodId(v ? Number(v) : undefined)}
          />
          <Button variant="light" onClick={handleExport} loading={exporting} disabled={!period}>
            Export to Excel
          </Button>
        </Group>
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red">
          {error instanceof Error ? error.message : "Could not load the dashboard"}
        </Alert>
      )}

      {data && !period && (
        <Text c="dimmed" ta="center" py="xl">
          No reporting periods exist yet — set one up under Accreditation.
        </Text>
      )}

      {data && period && (
        <>
          <Group gap="lg">
            <Text size="sm">
              <b>{period.label}</b> · {period.status.replace(/_/g, " ").toLowerCase()}
            </Text>
            {period.outcomesDeadline && (
              <Text size="sm" c={(period.daysUntilOutcomesDeadline ?? 0) <= 14 ? "red" : undefined}>
                Outcomes deadline {formatDateOnly(period.outcomesDeadline)} —{" "}
                {period.daysUntilOutcomesDeadline !== null && period.daysUntilOutcomesDeadline >= 0
                  ? `${period.daysUntilOutcomesDeadline} day${period.daysUntilOutcomesDeadline === 1 ? "" : "s"} left`
                  : "passed"}
              </Text>
            )}
          </Group>

          <Alert
            color={data.freshness.neverComputed || data.freshness.stale ? "yellow" : "gray"}
            title={
              data.freshness.neverComputed
                ? "Results have not been computed yet"
                : `Results computed ${data.freshness.ageDays === 0 ? "today" : `${data.freshness.ageDays} day${data.freshness.ageDays === 1 ? "" : "s"} ago`}`
            }
          >
            <Group justify="space-between" align="center">
              <Text size="sm">
                These figures come from the last computed results
                {data.freshness.computedAt
                  ? ` (${new Date(data.freshness.computedAt).toLocaleString()})`
                  : ""}
                , not live data. Recompute to include changes made since.
              </Text>
              {canRecompute && (
                <Button
                  size="xs"
                  onClick={handleRecompute}
                  loading={recompute.isPending}
                  style={{ flexShrink: 0 }}
                >
                  Recompute now
                </Button>
              )}
            </Group>
          </Alert>

          <SimpleGrid cols={{ base: 2, md: 4 }}>
            {(["MEETING", "AT_RISK", "OFF_TRACK", "NO_DATA"] as RiskStatus[]).map((status) => (
              <SummaryTile key={status} status={status} count={data.summary[status]} />
            ))}
          </SimpleGrid>

          {data.programs.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No programs are assigned to you. Ask an administrator to assign programs on the Users
              page.
            </Text>
          ) : (
            <>
              <AttentionList items={data.attention} periodId={period.id} />
              <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
                {data.programs.map((program) => (
                  <ProgramCard key={program.programId} program={program} />
                ))}
              </SimpleGrid>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
