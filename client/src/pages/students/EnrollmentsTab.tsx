import {
  ALLOWABLE_SUBTRACTION_REASON_LABELS,
  ALLOWABLE_SUBTRACTION_REASONS,
  AVAILABILITY_STATUSES,
  CONTINUING_EDUCATION_STATUSES,
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  MILITARY_STATUSES,
  RELATED_TO_TRAINING_SOURCES,
  type AllowableSubtractionReason,
  type EnrollmentStatus,
} from "@outcomelink/shared";
import {
  Accordion,
  Badge,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useReportingPeriods } from "../../api/accreditation";
import { useCampuses, usePrograms } from "../../api/programs";
import {
  type CreateEnrollmentInput,
  useCreateEnrollment,
  useEnrollments,
  useUpdateEnrollment,
} from "../../api/students";
import {
  type CreateOutcomeRecordInput,
  useCreateOutcomeRecord,
  useOutcomeRecords,
} from "../../api/outcomes";
import { stripEmptyStrings } from "../../lib/forms";
import { StudentExplanationPanel } from "./StudentExplanationPanel";

export function EnrollmentsTab({ studentId }: { studentId: number }) {
  const { data: enrollments, isLoading } = useEnrollments(studentId);
  const { data: programs } = usePrograms();
  const { data: campuses } = useCampuses();
  const createEnrollment = useCreateEnrollment(studentId);
  const [formOpened, { toggle: toggleForm }] = useDisclosure(false);

  const form = useForm<CreateEnrollmentInput>({
    initialValues: {
      programId: 0,
      campusId: 0,
      startDate: "",
      enrollmentStatus: "ACTIVE",
      enrollmentObjective: "",
      reportableForAccreditation: true,
    },
    validate: {
      programId: (value) => (value ? null : "Program is required"),
      campusId: (value) => (value ? null : "Campus is required"),
      startDate: (value) => (value ? null : "Start date is required"),
    },
  });

  async function handleSubmit(values: CreateEnrollmentInput) {
    try {
      await createEnrollment.mutateAsync(stripEmptyStrings(values) as CreateEnrollmentInput);
      notifications.show({ message: "Enrollment created", color: "green" });
      form.reset();
      toggleForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create enrollment",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Enrollments</Text>
        <Button size="xs" variant="light" onClick={toggleForm}>
          {formOpened ? "Cancel" : "New Enrollment"}
        </Button>
      </Group>

      {formOpened && (
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="sm" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
            <Select
              label="Program"
              required
              data={programs?.items.map((p) => ({ value: String(p.id), label: p.name })) ?? []}
              value={form.values.programId ? String(form.values.programId) : null}
              onChange={(v) => form.setFieldValue("programId", v ? Number(v) : 0)}
            />
            <Select
              label="Campus"
              required
              data={campuses?.items.map((c) => ({ value: String(c.id), label: c.name })) ?? []}
              value={form.values.campusId ? String(form.values.campusId) : null}
              onChange={(v) => form.setFieldValue("campusId", v ? Number(v) : 0)}
            />
            <Group grow>
              <input type="date" {...form.getInputProps("startDate")} style={{ padding: 8 }} />
              <Select
                label="Status"
                data={ENROLLMENT_STATUSES.map((s) => ({
                  value: s,
                  label: ENROLLMENT_STATUS_LABELS[s],
                }))}
                {...form.getInputProps("enrollmentStatus")}
              />
            </Group>
            <TextInput
              label="Enrollment objective"
              description="Whatever your SIS calls it (e.g. Certificate Seeker, Occupational Upgrade, Secondary) — for your own records"
              placeholder="Optional"
              {...form.getInputProps("enrollmentObjective")}
            />
            <Checkbox
              label="Reportable for accreditation"
              description="Uncheck for enrollments out of scope for CPL reporting (e.g. a secondary/dual-enrolled student, or one enrolled purely for personal enrichment)"
              checked={form.values.reportableForAccreditation ?? true}
              onChange={(e) =>
                form.setFieldValue("reportableForAccreditation", e.currentTarget.checked)
              }
            />
            <Button type="submit" loading={createEnrollment.isPending} size="sm">
              Save Enrollment
            </Button>
          </Stack>
        </form>
      )}

      {isLoading && <Text size="sm">Loading...</Text>}

      <Accordion variant="separated">
        {enrollments?.map((enrollment) => (
          <Accordion.Item key={enrollment.id} value={String(enrollment.id)}>
            <Accordion.Control>
              <Group justify="space-between" pr="md">
                <Text>Enrollment #{enrollment.id}</Text>
                <Badge>{ENROLLMENT_STATUS_LABELS[enrollment.enrollmentStatus]}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <EnrollmentDetail
                studentId={studentId}
                enrollmentId={enrollment.id}
                enrollmentStatus={enrollment.enrollmentStatus}
                allowableSubtractionReason={enrollment.allowableSubtractionReason}
                enrollmentObjective={enrollment.enrollmentObjective}
                reportableForAccreditation={enrollment.reportableForAccreditation}
              />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}

function EnrollmentDetail({
  studentId,
  enrollmentId,
  enrollmentStatus,
  allowableSubtractionReason,
  enrollmentObjective,
  reportableForAccreditation,
}: {
  studentId: number;
  enrollmentId: number;
  enrollmentStatus: EnrollmentStatus;
  allowableSubtractionReason: AllowableSubtractionReason | null;
  enrollmentObjective: string | null;
  reportableForAccreditation: boolean;
}) {
  const updateEnrollment = useUpdateEnrollment(studentId);
  const { data: reportingPeriods } = useReportingPeriods();
  const { data: outcomeRecords } = useOutcomeRecords(studentId, enrollmentId);
  const createOutcome = useCreateOutcomeRecord(studentId, enrollmentId);
  const [outcomeFormOpen, { toggle: toggleOutcomeForm }] = useDisclosure(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [currentStatus, setCurrentStatus] = useState(enrollmentStatus);

  // Mantine's Select needs `null` (not `undefined`) as its controlled "nothing
  // selected" state, or React warns about an uncontrolled input becoming
  // controlled the moment a value is picked — so these optional fields use a
  // looser local type than CreateOutcomeRecordInput and get converted on submit.
  const form = useForm<{
    reportingPeriodId: number;
    employmentStatus: string | null;
    continuingEducationStatus: string | null;
    militaryStatus: string | null;
    availabilityForEmploymentStatus: string | null;
    licensureRequired: boolean;
    relatedToTraining?: boolean;
    relatedToTrainingSource: string | null;
  }>({
    initialValues: {
      reportingPeriodId: 0,
      employmentStatus: null,
      continuingEducationStatus: null,
      militaryStatus: null,
      availabilityForEmploymentStatus: null,
      licensureRequired: false,
      relatedToTrainingSource: null,
    },
  });

  async function handleStatusChange(newStatus: string | null) {
    if (!newStatus) return;
    setCurrentStatus(newStatus as EnrollmentStatus);
    await updateEnrollment.mutateAsync({
      id: enrollmentId,
      input: { enrollmentStatus: newStatus as EnrollmentStatus },
    });
  }

  async function handleReportableChange(reportable: boolean) {
    await updateEnrollment.mutateAsync({
      id: enrollmentId,
      input: { reportableForAccreditation: reportable },
    });
  }

  async function handleAllowableSubtractionReasonChange(reason: string | null) {
    await updateEnrollment.mutateAsync({
      id: enrollmentId,
      input: { allowableSubtractionReason: reason as AllowableSubtractionReason | null },
    });
  }

  async function handleOutcomeSubmit(values: typeof form.values) {
    const payload: CreateOutcomeRecordInput = {
      reportingPeriodId: values.reportingPeriodId,
      licensureRequired: values.licensureRequired,
      relatedToTraining: values.relatedToTraining,
      ...(values.employmentStatus
        ? {
            employmentStatus:
              values.employmentStatus as CreateOutcomeRecordInput["employmentStatus"],
          }
        : {}),
      ...(values.continuingEducationStatus
        ? {
            continuingEducationStatus:
              values.continuingEducationStatus as CreateOutcomeRecordInput["continuingEducationStatus"],
          }
        : {}),
      ...(values.militaryStatus
        ? { militaryStatus: values.militaryStatus as CreateOutcomeRecordInput["militaryStatus"] }
        : {}),
      ...(values.availabilityForEmploymentStatus
        ? {
            availabilityForEmploymentStatus:
              values.availabilityForEmploymentStatus as CreateOutcomeRecordInput["availabilityForEmploymentStatus"],
          }
        : {}),
      ...(values.relatedToTrainingSource
        ? {
            relatedToTrainingSource:
              values.relatedToTrainingSource as CreateOutcomeRecordInput["relatedToTrainingSource"],
          }
        : {}),
    };
    try {
      await createOutcome.mutateAsync(payload);
      notifications.show({ message: "Outcome record saved", color: "green" });
      form.reset();
      toggleOutcomeForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to save outcome record",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group align="flex-end">
        <Select
          label="Update status"
          data={ENROLLMENT_STATUSES.map((s) => ({ value: s, label: ENROLLMENT_STATUS_LABELS[s] }))}
          defaultValue={enrollmentStatus}
          onChange={handleStatusChange}
          w={260}
        />
        {currentStatus === "WITHDRAWN" && (
          <Select
            label="Allowable subtraction reason (if any)"
            description="Excludes this withdrawal from the completion rate entirely, rather than counting it against the institution"
            placeholder="None — counts as an ordinary withdrawal"
            data={ALLOWABLE_SUBTRACTION_REASONS.map((r) => ({
              value: r,
              label: ALLOWABLE_SUBTRACTION_REASON_LABELS[r],
            }))}
            defaultValue={allowableSubtractionReason}
            onChange={handleAllowableSubtractionReasonChange}
            clearable
            allowDeselect={false}
            w={360}
          />
        )}
      </Group>

      <Group>
        <Text size="sm" c="dimmed">
          Objective: {enrollmentObjective ?? "not specified"}
        </Text>
        <Checkbox
          label="Reportable for accreditation"
          description="Uncheck for enrollments out of scope for CPL reporting"
          checked={reportableForAccreditation}
          onChange={(e) => handleReportableChange(e.currentTarget.checked)}
        />
      </Group>

      <Group justify="space-between">
        <Text fw={500} size="sm">
          Outcome records
        </Text>
        <Button size="xs" variant="light" onClick={toggleOutcomeForm}>
          {outcomeFormOpen ? "Cancel" : "Add Outcome Record"}
        </Button>
      </Group>

      {outcomeFormOpen && (
        <form onSubmit={form.onSubmit(handleOutcomeSubmit)}>
          <Stack gap="sm" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
            <Select
              label="Reporting period"
              required
              data={reportingPeriods?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
              onChange={(v) => form.setFieldValue("reportingPeriodId", v ? Number(v) : 0)}
            />
            <Select
              label="Employment status"
              data={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: s }))}
              {...form.getInputProps("employmentStatus")}
            />
            <Checkbox
              label="Related to training"
              checked={form.values.relatedToTraining ?? false}
              onChange={(e) => form.setFieldValue("relatedToTraining", e.currentTarget.checked)}
            />
            {form.values.relatedToTraining && (
              <Select
                label="Who determined relatedness?"
                data={RELATED_TO_TRAINING_SOURCES.map((s) => ({
                  value: s,
                  label: s === "STUDENT_REPORTED" ? "Student reported" : "Instructor reported",
                }))}
                {...form.getInputProps("relatedToTrainingSource")}
                clearable
                allowDeselect={false}
              />
            )}
            <Select
              label="Continuing education"
              data={CONTINUING_EDUCATION_STATUSES.map((s) => ({ value: s, label: s }))}
              {...form.getInputProps("continuingEducationStatus")}
            />
            <Select
              label="Military status"
              data={MILITARY_STATUSES.map((s) => ({ value: s, label: s }))}
              {...form.getInputProps("militaryStatus")}
            />
            <Select
              label="Availability (if unavailable/refused)"
              data={AVAILABILITY_STATUSES.map((s) => ({ value: s, label: s }))}
              {...form.getInputProps("availabilityForEmploymentStatus")}
              clearable
            />
            <Checkbox
              label="Licensure required for this program"
              checked={form.values.licensureRequired ?? false}
              onChange={(e) => form.setFieldValue("licensureRequired", e.currentTarget.checked)}
            />
            <Button type="submit" loading={createOutcome.isPending} size="sm">
              Save Outcome Record
            </Button>
          </Stack>
        </form>
      )}

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Period</Table.Th>
            <Table.Th>Employment</Table.Th>
            <Table.Th>Related</Table.Th>
            <Table.Th>Licensure Req.</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {outcomeRecords?.map((record) => (
            <Table.Tr
              key={record.id}
              onClick={() => setSelectedPeriodId(record.reportingPeriodId)}
              style={{ cursor: "pointer" }}
            >
              <Table.Td>
                {reportingPeriods?.find((p) => p.id === record.reportingPeriodId)?.label ??
                  record.reportingPeriodId}
              </Table.Td>
              <Table.Td>{record.employmentStatus ?? "—"}</Table.Td>
              <Table.Td>
                {record.relatedToTraining === null ? "—" : record.relatedToTraining ? "Yes" : "No"}
              </Table.Td>
              <Table.Td>{record.licensureRequired ? "Yes" : "No"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {selectedPeriodId && (
        <StudentExplanationPanel reportingPeriodId={selectedPeriodId} enrollmentId={enrollmentId} />
      )}
    </Stack>
  );
}
