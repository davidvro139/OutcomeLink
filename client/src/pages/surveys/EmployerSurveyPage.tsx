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
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  type SubmitEmployerSurveyResponseInput,
  usePublicEmployerSurvey,
  useSubmitEmployerSurveyResponse,
} from "../../api/surveys";
import { ApiRequestError } from "../../lib/apiClient";

const VERIFICATION_OPTIONS = [
  { value: "CONFIRMED", label: "Yes, still employed here" },
  { value: "NOT_CONFIRMED", label: "No / unable to confirm" },
];

function RatingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Text size="sm" fw={500} mb={4}>
        {label}
      </Text>
      <Rating value={value ?? 0} onChange={onChange} />
    </div>
  );
}

/** Phase 2 P9 (docs/TODO.md): public, unauthenticated Employer Survey form, reached via a shared link keyed by EmployerSurvey.responseToken. */
export function EmployerSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const { data: survey, isLoading, isError, error } = usePublicEmployerSurvey(token);
  const submit = useSubmitEmployerSurveyResponse(token ?? "");
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<SubmitEmployerSurveyResponseInput>({
    initialValues: {
      employmentVerification: undefined,
      technicalPreparednessRating: undefined,
      communicationRating: undefined,
      problemSolvingRating: undefined,
      professionalismRating: undefined,
      overallSatisfactionRating: undefined,
      likelihoodToHireAgainRating: undefined,
      skillsGapNotes: "",
      comments: "",
    },
  });

  async function handleSubmit(values: SubmitEmployerSurveyResponseInput) {
    try {
      await submit.mutateAsync({
        ...values,
        skillsGapNotes: values.skillsGapNotes?.trim() || undefined,
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
            <Title order={2}>Employer Feedback Survey</Title>
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
              Your feedback has been recorded. Thank you for supporting our graduate outcomes
              reporting.
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
                  {survey.employerName}, we'd like to hear how {survey.studentFirstName}{" "}
                  {survey.studentLastName} is doing on the job.
                </Text>

                <Radio.Group
                  label={`Is ${survey.studentFirstName} still employed with your organization?`}
                  {...form.getInputProps("employmentVerification")}
                >
                  <Group mt="xs">
                    {VERIFICATION_OPTIONS.map((o) => (
                      <Radio key={o.value} value={o.value} label={o.label} />
                    ))}
                  </Group>
                </Radio.Group>

                <RatingField
                  label="Technical skill preparedness"
                  value={form.values.technicalPreparednessRating}
                  onChange={(v) => form.setFieldValue("technicalPreparednessRating", v)}
                />
                <RatingField
                  label="Communication skills"
                  value={form.values.communicationRating}
                  onChange={(v) => form.setFieldValue("communicationRating", v)}
                />
                <RatingField
                  label="Problem-solving skills"
                  value={form.values.problemSolvingRating}
                  onChange={(v) => form.setFieldValue("problemSolvingRating", v)}
                />
                <RatingField
                  label="Professionalism"
                  value={form.values.professionalismRating}
                  onChange={(v) => form.setFieldValue("professionalismRating", v)}
                />
                <RatingField
                  label="Overall satisfaction with this hire"
                  value={form.values.overallSatisfactionRating}
                  onChange={(v) => form.setFieldValue("overallSatisfactionRating", v)}
                />
                <RatingField
                  label="How likely are you to hire another graduate from this program?"
                  value={form.values.likelihoodToHireAgainRating}
                  onChange={(v) => form.setFieldValue("likelihoodToHireAgainRating", v)}
                />

                <Textarea
                  label="Any skills gaps you've noticed?"
                  minRows={2}
                  {...form.getInputProps("skillsGapNotes")}
                />
                <Textarea label="Any other comments?" minRows={2} {...form.getInputProps("comments")} />

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
