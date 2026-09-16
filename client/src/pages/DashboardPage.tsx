import { Loader, Stack, Tabs, Text, Title } from "@mantine/core";
import { useAuth } from "../auth/AuthContext";
import { useReportingPeriods } from "../api/accreditation";
import { ReadinessTab } from "./accreditation/ReadinessTab";
import { DataQualityDashboard } from "./dashboards/DataQualityDashboard";
import { ExecutiveDashboard } from "./dashboards/ExecutiveDashboard";

const EXECUTIVE_ROLES = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];
const DATA_QUALITY_ROLES = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

/**
 * Phase 2 P6 (docs/TODO.md): role-based landing dashboards (Executive,
 * Program Health, Data Quality) replacing the earlier MVP-era placeholder
 * page. Program Health reuses ReadinessTab directly rather than duplicating
 * its logic — it's the same "is this program in good shape" question asked
 * from the landing page instead of from inside one reporting period.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { data: periods, isLoading } = useReportingPeriods();
  const currentPeriod = periods?.[0];

  const canSeeExecutive = user && EXECUTIVE_ROLES.includes(user.role);
  const canSeeDataQuality = user && DATA_QUALITY_ROLES.includes(user.role);
  const defaultTab = canSeeExecutive ? "executive" : "program-health";

  return (
    <Stack p="xl" gap="md">
      <Title order={2}>Welcome, {user?.name}</Title>

      {isLoading && <Loader />}

      {!isLoading && !currentPeriod && (
        <Text c="dimmed">No reporting periods exist yet — set one up under Accreditation.</Text>
      )}

      {currentPeriod && (
        <Tabs defaultValue={defaultTab}>
          <Tabs.List>
            {canSeeExecutive && <Tabs.Tab value="executive">Executive</Tabs.Tab>}
            <Tabs.Tab value="program-health">Program Health</Tabs.Tab>
            {canSeeDataQuality && <Tabs.Tab value="data-quality">Data Quality</Tabs.Tab>}
          </Tabs.List>

          {canSeeExecutive && (
            <Tabs.Panel value="executive" pt="md">
              <ExecutiveDashboard />
            </Tabs.Panel>
          )}
          <Tabs.Panel value="program-health" pt="md">
            <ReadinessTab reportingPeriodId={currentPeriod.id} />
          </Tabs.Panel>
          {canSeeDataQuality && (
            <Tabs.Panel value="data-quality" pt="md">
              <DataQualityDashboard />
            </Tabs.Panel>
          )}
        </Tabs>
      )}
    </Stack>
  );
}
