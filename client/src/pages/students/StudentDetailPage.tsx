import { Badge, Group, Loader, Stack, Switch, Tabs, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useParams } from "react-router-dom";
import { useStudent, useUpsertCommunicationPreference } from "../../api/students";
import { AuditHistory } from "../../components/AuditHistory";
import { EmploymentTab } from "./EmploymentTab";
import { EnrollmentsTab } from "./EnrollmentsTab";
import { FollowUpsTab } from "./FollowUpsTab";

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const studentId = Number(id);
  const { data: student, isLoading } = useStudent(studentId);
  const upsertPreference = useUpsertCommunicationPreference(studentId);

  if (isLoading) return <Loader m="xl" />;
  if (!student) return null;

  async function handleDoNotContactToggle(checked: boolean) {
    try {
      await upsertPreference.mutateAsync({ doNotContact: checked });
      notifications.show({
        message: checked ? "Marked do-not-contact" : "Do-not-contact cleared",
        color: "blue",
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to update preference",
        color: "red",
      });
    }
  }

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>
            {student.firstName} {student.lastName}
          </Title>
          <Text c="dimmed">
            {student.internalStudentId} · {student.email ?? "no email on file"}
          </Text>
        </div>
        <Group>
          {student.communicationPreference?.doNotContact && (
            <Badge color="red">Do Not Contact</Badge>
          )}
          <Switch
            label="Do not contact"
            checked={student.communicationPreference?.doNotContact ?? false}
            onChange={(e) => handleDoNotContactToggle(e.currentTarget.checked)}
          />
        </Group>
      </Group>

      <Tabs defaultValue="enrollments">
        <Tabs.List>
          <Tabs.Tab value="enrollments">Enrollments & Outcomes</Tabs.Tab>
          <Tabs.Tab value="employment">Employment</Tabs.Tab>
          <Tabs.Tab value="followups">Follow-ups</Tabs.Tab>
          <Tabs.Tab value="audit">Audit History</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="enrollments" pt="md">
          <EnrollmentsTab studentId={studentId} />
        </Tabs.Panel>
        <Tabs.Panel value="employment" pt="md">
          <EmploymentTab studentId={studentId} />
        </Tabs.Panel>
        <Tabs.Panel value="followups" pt="md">
          <FollowUpsTab studentId={studentId} />
        </Tabs.Panel>
        <Tabs.Panel value="audit" pt="md">
          <AuditHistory entityType="Student" entityId={studentId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
