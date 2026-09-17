import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Radio,
  Rating,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  type SubmitGraduateSurveyResponseInput,
  usePublicGraduateSurvey,
  useSubmitGraduateSurveyResponse,
} from "../../api/surveys";
import { ApiRequestError } from "../../lib/apiClient";

const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "EMPLOYED", label: "Employed" },
  { value: "UNEMPLOYED", label: "Not currently employed" },
  { value: "UNKNOWN", label: "Prefer not to say" },
];

const RELATED_OPTIONS = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "UNSURE", label: "Not sure" },
];

const CONTINUING_ED_OPTIONS = [
  { value: "NOT_ENROLLED", label: "Not currently enrolled" },
  { value: "ENROLLED", label: "Currently enrolled" },
];

/** Phase 2 P9 (docs/TODO.md): public, unauthenticated Graduate Survey form, reached via an emailed/shared link keyed by GraduateSurvey.responseToken. */
export function GraduateSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const { data: survey, isLoading, isError, error } = usePublicGraduateSurvey(token);
  const submit = useSubmitGraduateSurveyResponse(token ?? "");
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<SubmitGraduateSurveyResponseInput>({
    initialValues: {
      employmentStatus: undefined,
      employer: "",
      jobTitle: "",
      relatedToTrainingResponse: undefined,
      continuingEducation: undefined,
      satisfactionRating: undefined,
      skillsPreparednessRating: undefined,
      comments: "",
    },
  });

  async function handleSubmit(values: SubmitGraduateSurveyResponseInput) {
    try {
      await submit.mutateAsync({
        ...values,
        employer: values.employer?.trim() || undefined,
        jobTitle: values.jobTitle?.trim() || undefined,
        comments: values.comments?.trim() || undefined,
      });
      setSubmitted(true);
    } catch {
      // Surfaced below via submit.isError / submit.error.
    }
  }

  return (
    <Center mih="100vh" bg="var(--mantine-color-body)" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={520}>
        <Stack gap="lg">
          <div>
            <Title order={2}>Graduate Outcomes Survey</Title>
            <Text c="dimmed" size="sm">
              OutcomeLink
            </Text>
          </div>

          {isLoading && (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          )}

          {isError && (
            <Alert color="red" title="Survey not found">
              {error instanceof ApiRequestError
                ? error.message
                : "This survey link is invalid or has expired."}
            </Alert>
          )}

          {survey && submitted && (
            <Alert color="teal" title="Thank you!">
              Your response has been recorded. Thank you for helping your program report accurate
              outcomes.
            </Alert>
          )}

          {survey && !submitted && survey.alreadyResponded && (
            <Alert color="blue" title="Already completed">
              This survey has already been completed. Thank you!
            </Alert>
          )}

          {survey && !submitted && !survey.alreadyResponded && (
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="md">
                <Text size="sm">
                  Hi {survey.studentFirstName}, we'd like to hear how things are going since you
                  completed your program. This should only take a couple of minutes.
                </Text>

                <Radio.Group
                  label="Are you currently employed?"
                  {...form.getInputProps("employmentStatus")}
                >
                  <Group mt="xs">
                    {EMPLOYMENT_STATUS_OPTIONS.map((o) => (
                      <Radio key={o.value} value={o.value} label={o.label} />
                    ))}
                  </Group>
                </Radio.Group>

                {form.values.employmentStatus === "EMPLOYED" && (
                  <>
                    <TextInput label="Employer name" {...form.getInputProps("employer")} />
                    <TextInput label="Job title" {...form.getInputProps("jobTitle")} />
                    <Radio.Group
                      label="Is this job related to your field of study?"
                      {...form.getInputProps("relatedToTrainingResponse")}
                    >
                      <Group mt="xs">
                        {RELATED_OPTIONS.map((o) => (
                          <Radio key={o.value} value={o.value} label={o.label} />
                        ))}
                      </Group>
                    </Radio.Group>
                  </>
                )}

                <Radio.Group
                  label="Are you currently enrolled in further education?"
                  {...form.getInputProps("continuingEducation")}
                >
                  <Group mt="xs">
                    {CONTINUING_ED_OPTIONS.map((o) => (
                      <Radio key={o.value} value={o.value} label={o.label} />
                    ))}
                  </Group>
                </Radio.Group>

                <div>
                  <Text size="sm" fw={500} mb={4}>
                    How satisfied are you with your program overall?
                  </Text>
                  <Rating
                    value={form.values.satisfactionRating ?? 0}
                    onChange={(v) => form.setFieldValue("satisfactionRating", v)}
                  />
                </div>

                <div>
                  <Text size="sm" fw={500} mb={4}>
                    How well did your program prepare you with the skills needed for your job?
                  </Text>
                  <Rating
                    value={form.values.skillsPreparednessRating ?? 0}
                    onChange={(v) => form.setFieldValue("skillsPreparednessRating", v)}
                  />
                </div>

                <Textarea
                  label="Any other comments?"
                  minRows={3}
                  {...form.getInputProps("comments")}
                />

                {submit.isError && (
                  <Alert color="red">
                    {submit.error instanceof ApiRequestError
                      ? submit.error.message
                      : "Failed to submit your response. Please try again."}
                  </Alert>
                )}

                <Button type="submit" loading={submit.isPending} fullWidth>
                  Submit
                </Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
