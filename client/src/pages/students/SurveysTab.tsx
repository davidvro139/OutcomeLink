import { Badge, Button, Group, Rating, Select, Stack, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Fragment, useState } from "react";
import type { Employer } from "../../api/employers";
import { useEmploymentRecords } from "../../api/placements";
import {
  type EmployerSurvey,
  type GraduateSurvey,
  useEmployerSurveys,
  useGraduateSurveys,
  useSendEmployerSurvey,
  useSendGraduateSurvey,
} from "../../api/surveys";

const CHANNEL_OPTIONS = ["EMAIL", "SMS", "MAIL", "PHONE"];

function publicSurveyUrl(kind: "graduate" | "employer", token: string): string {
  return `${window.location.origin}/survey/${kind}/${token}`;
}

async function copyLink(kind: "graduate" | "employer", token: string) {
  const url = publicSurveyUrl(kind, token);
  try {
    await navigator.clipboard.writeText(url);
    notifications.show({ message: "Survey link copied to clipboard", color: "blue" });
  } catch {
    notifications.show({ message: url, autoClose: false, color: "blue", title: "Survey link" });
  }
}

function GraduateSurveysSection({ studentId }: { studentId: number }) {
  const { data: surveys, isLoading } = useGraduateSurveys(studentId);
  const sendSurvey = useSendGraduateSurvey(studentId);
  const [formOpened, { toggle: toggleForm, close: closeForm }] = useDisclosure(false);
  const [channel, setChannel] = useState<string | null>("EMAIL");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function handleSend() {
    try {
      await sendSurvey.mutateAsync({ channel: channel ?? undefined });
      notifications.show({ message: "Graduate survey created — copy the link below to send it", color: "green" });
      closeForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to send survey",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Graduate surveys</Text>
        <Button size="xs" variant="light" onClick={toggleForm}>
          {formOpened ? "Cancel" : "Send Graduate Survey"}
        </Button>
      </Group>

      {formOpened && (
        <Group align="flex-end" gap="sm" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
          <Select label="Channel" data={CHANNEL_OPTIONS} value={channel} onChange={setChannel} w={160} />
          <Button onClick={handleSend} loading={sendSurvey.isPending} size="sm">
            Create Survey Link
          </Button>
        </Group>
      )}

      {isLoading && <Text size="sm">Loading...</Text>}

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Sent</Table.Th>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {surveys?.map((survey: GraduateSurvey) => (
            <Fragment key={survey.id}>
              <Table.Tr
                key={survey.id}
                onClick={() => survey.response && setExpandedId(expandedId === survey.id ? null : survey.id)}
                style={{ cursor: survey.response ? "pointer" : undefined }}
              >
                <Table.Td>{new Date(survey.sentAt).toLocaleDateString()}</Table.Td>
                <Table.Td>{survey.channel ?? "—"}</Table.Td>
                <Table.Td>
                  <Badge color={survey.response ? "teal" : "gray"}>
                    {survey.response ? "Responded" : "Awaiting response"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {!survey.response && (
                    <Button size="xs" variant="subtle" onClick={() => copyLink("graduate", survey.responseToken)}>
                      Copy Link
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
              {expandedId === survey.id && survey.response && (
                <Table.Tr key={`${survey.id}-detail`}>
                  <Table.Td colSpan={4}>
                    <Stack gap={4} p="sm">
                      <Text size="sm">
                        <b>Employment status:</b> {survey.response.employmentStatus ?? "—"}
                      </Text>
                      <Text size="sm">
                        <b>Employer:</b> {survey.response.employer ?? "—"}
                      </Text>
                      <Text size="sm">
                        <b>Job title:</b> {survey.response.jobTitle ?? "—"}
                      </Text>
                      <Text size="sm">
                        <b>Related to training:</b> {survey.response.relatedToTrainingResponse ?? "—"}
                      </Text>
                      <Text size="sm">
                        <b>Continuing education:</b> {survey.response.continuingEducation ?? "—"}
                      </Text>
                      <Group gap="xl">
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            Satisfaction:
                          </Text>
                          <Rating value={survey.response.satisfactionRating ?? 0} readOnly />
                        </Group>
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            Skills preparedness:
                          </Text>
                          <Rating value={survey.response.skillsPreparednessRating ?? 0} readOnly />
                        </Group>
                      </Group>
                      {survey.response.comments && (
                        <Text size="sm">
                          <b>Comments:</b> {survey.response.comments}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              )}
            </Fragment>
          ))}
        </Table.Tbody>
      </Table>
      {surveys?.length === 0 && (
        <Text size="sm" c="dimmed">
          No graduate surveys sent yet.
        </Text>
      )}
    </Stack>
  );
}

function EmployerSurveysSection({ studentId }: { studentId: number }) {
  const { data: surveys, isLoading } = useEmployerSurveys(studentId);
  const { data: employmentRecords } = useEmploymentRecords(studentId);
  const sendSurvey = useSendEmployerSurvey(studentId);
  const [formOpened, { toggle: toggleForm, close: closeForm }] = useDisclosure(false);
  const [employerId, setEmployerId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const employerOptions = [
    ...new Map((employmentRecords ?? []).map((r) => [r.employerId, r.employer])).values(),
  ]
    .filter((e): e is Employer => !!e)
    .map((e) => ({ value: String(e.id), label: e.name }));

  async function handleSend() {
    if (!employerId) return;
    try {
      await sendSurvey.mutateAsync({ employerId: Number(employerId) });
      notifications.show({ message: "Employer survey created — copy the link below to send it", color: "green" });
      closeForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to send survey",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Employer surveys</Text>
        <Button size="xs" variant="light" onClick={toggleForm}>
          {formOpened ? "Cancel" : "Send Employer Survey"}
        </Button>
      </Group>

      {formOpened && (
        <Group align="flex-end" gap="sm" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
          <Select
            label="Employer"
            description="Only employers with an employment record on file for this student"
            data={employerOptions}
            value={employerId}
            onChange={setEmployerId}
            w={280}
            searchable
          />
          <Button onClick={handleSend} loading={sendSurvey.isPending} disabled={!employerId} size="sm">
            Create Survey Link
          </Button>
        </Group>
      )}

      {isLoading && <Text size="sm">Loading...</Text>}

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Employer</Table.Th>
            <Table.Th>Sent</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {surveys?.map((survey: EmployerSurvey) => (
            <Fragment key={survey.id}>
              <Table.Tr
                key={survey.id}
                onClick={() => survey.response && setExpandedId(expandedId === survey.id ? null : survey.id)}
                style={{ cursor: survey.response ? "pointer" : undefined }}
              >
                <Table.Td>{survey.employer.name}</Table.Td>
                <Table.Td>{new Date(survey.sentAt).toLocaleDateString()}</Table.Td>
                <Table.Td>
                  <Badge color={survey.response ? "teal" : "gray"}>
                    {survey.response ? "Responded" : "Awaiting response"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {!survey.response && (
                    <Button size="xs" variant="subtle" onClick={() => copyLink("employer", survey.responseToken)}>
                      Copy Link
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
              {expandedId === survey.id && survey.response && (
                <Table.Tr key={`${survey.id}-detail`}>
                  <Table.Td colSpan={4}>
                    <Stack gap={4} p="sm">
                      <Text size="sm">
                        <b>Employment verification:</b> {survey.response.employmentVerification ?? "—"}
                      </Text>
                      <Group gap="xl" wrap="wrap">
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            Technical preparedness:
                          </Text>
                          <Rating value={survey.response.technicalPreparednessRating ?? 0} readOnly />
                        </Group>
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            Communication:
                          </Text>
                          <Rating value={survey.response.communicationRating ?? 0} readOnly />
                        </Group>
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            Problem solving:
                          </Text>
                          <Rating value={survey.response.problemSolvingRating ?? 0} readOnly />
                        </Group>
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            Professionalism:
                          </Text>
                          <Rating value={survey.response.professionalismRating ?? 0} readOnly />
                        </Group>
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            Overall satisfaction:
                          </Text>
                          <Rating value={survey.response.overallSatisfactionRating ?? 0} readOnly />
                        </Group>
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            Would hire again:
                          </Text>
                          <Rating value={survey.response.likelihoodToHireAgainRating ?? 0} readOnly />
                        </Group>
                      </Group>
                      {survey.response.skillsGapNotes && (
                        <Text size="sm">
                          <b>Skills gap notes:</b> {survey.response.skillsGapNotes}
                        </Text>
                      )}
                      {survey.response.comments && (
                        <Text size="sm">
                          <b>Comments:</b> {survey.response.comments}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              )}
            </Fragment>
          ))}
        </Table.Tbody>
      </Table>
      {surveys?.length === 0 && (
        <Text size="sm" c="dimmed">
          No employer surveys sent yet.
        </Text>
      )}
    </Stack>
  );
}

/**
 * Phase 2 P9 (docs/TODO.md): send/response flow for Graduate and Employer
 * surveys. Responses are self-reported and display-only here by design (spec
 * §43, docs/DATA_MODEL.md §9) — they never write to StudentOutcomeRecord or
 * EmploymentRecord automatically; a staff member reviewing a response still
 * has to go enter/verify the real outcome data themselves on the existing
 * tabs. There's no real email/SMS delivery infrastructure yet (the
 * `notifications` module is still an empty placeholder), so sending a survey
 * creates the link and staff copy/share it manually, same as every other
 * "no delivery backend yet" gap in this app.
 */
export function SurveysTab({ studentId }: { studentId: number }) {
  return (
    <Stack gap="xl">
      <GraduateSurveysSection studentId={studentId} />
      <EmployerSurveysSection studentId={studentId} />
    </Stack>
  );
}
