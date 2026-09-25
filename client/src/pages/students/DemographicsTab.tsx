import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GENDER_LABELS, GENDERS, RACE_ETHNICITY_LABELS, RACE_ETHNICITIES } from "@outcomelink/shared";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/apiClient";
import { stripEmptyStrings } from "../../lib/forms";
import { notifications } from "@mantine/notifications";

interface StudentDemographics {
  gender: string | null;
  raceEthnicity: string | null;
  economicallyDisadvantaged: boolean | null;
  firstGenerationStudent: boolean | null;
  disabilityStatus: boolean | null;
}

const BOOLEAN_OPTIONS = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
  { label: "Not on file", value: "null" },
];

function boolToTriState(value: boolean | null): string | null {
  if (value === true) return "true";
  if (value === false) return "false";
  return "null";
}

function triStateToBool(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function DemographicsTab({ studentId }: { studentId: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<StudentDemographics>({
    gender: null,
    raceEthnicity: null,
    economicallyDisadvantaged: null,
    firstGenerationStudent: null,
    disabilityStatus: null,
  });

  // Fetch demographics
  const { data: demographicsRes, isLoading } = useQuery({
    queryKey: ["students", studentId, "demographics"],
    queryFn: async () => {
      const res = await apiRequest(`/api/students/${studentId}/demographics`);
      return res as { demographics: StudentDemographics | null };
    },
  });

  // Initialize form with fetched data
  useEffect(() => {
    if (demographicsRes?.demographics) {
      setFormData(demographicsRes.demographics);
    }
  }, [demographicsRes]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: StudentDemographics) => {
      return apiRequest(`/api/students/${studentId}/demographics`, {
        method: "PUT",
        body: JSON.stringify(stripEmptyStrings(data)),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["students", studentId, "demographics"] });
      notifications.show({ color: "green", message: "Demographics saved" });
      setEditing(false);
    },
    onError: () => {
      notifications.show({ color: "red", message: "Failed to save demographics" });
    },
  });

  const isModified = useMemo(() => {
    return (
      formData.gender !== demographicsRes?.demographics?.gender ||
      formData.raceEthnicity !== demographicsRes?.demographics?.raceEthnicity ||
      formData.economicallyDisadvantaged !== demographicsRes?.demographics?.economicallyDisadvantaged ||
      formData.firstGenerationStudent !== demographicsRes?.demographics?.firstGenerationStudent ||
      formData.disabilityStatus !== demographicsRes?.demographics?.disabilityStatus
    );
  }, [formData, demographicsRes]);

  if (isLoading) return <Text>Loading...</Text>;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Demographics</Text>
        {!editing && <Button size="xs" variant="light" onClick={() => setEditing(true)}>Edit</Button>}
      </Group>

      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb={4}>Gender</Text>
          {editing ? (
            <Select
              placeholder="Select or leave blank"
              data={GENDERS.map((g) => ({ label: GENDER_LABELS[g], value: g }))}
              value={formData.gender}
              onChange={(v) => setFormData((p) => ({ ...p, gender: v }))}
              clearable
              searchable
            />
          ) : (
            <Text size="sm">{formData.gender ? GENDER_LABELS[formData.gender as keyof typeof GENDER_LABELS] : "Not on file"}</Text>
          )}
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>Race/Ethnicity</Text>
          {editing ? (
            <Select
              placeholder="Select or leave blank"
              data={RACE_ETHNICITIES.map((r) => ({ label: RACE_ETHNICITY_LABELS[r], value: r }))}
              value={formData.raceEthnicity}
              onChange={(v) => setFormData((p) => ({ ...p, raceEthnicity: v }))}
              clearable
              searchable
            />
          ) : (
            <Text size="sm">{formData.raceEthnicity ? RACE_ETHNICITY_LABELS[formData.raceEthnicity as keyof typeof RACE_ETHNICITY_LABELS] : "Not on file"}</Text>
          )}
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>Economically disadvantaged</Text>
          {editing ? (
            <Select
              placeholder="Select"
              data={BOOLEAN_OPTIONS}
              value={boolToTriState(formData.economicallyDisadvantaged)}
              onChange={(v) => setFormData((p) => ({ ...p, economicallyDisadvantaged: triStateToBool(v) }))}
            />
          ) : (
            <Text size="sm">
              {formData.economicallyDisadvantaged === true
                ? "Yes"
                : formData.economicallyDisadvantaged === false
                  ? "No"
                  : "Not on file"}
            </Text>
          )}
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>First-generation student</Text>
          {editing ? (
            <Select
              placeholder="Select"
              data={BOOLEAN_OPTIONS}
              value={boolToTriState(formData.firstGenerationStudent)}
              onChange={(v) => setFormData((p) => ({ ...p, firstGenerationStudent: triStateToBool(v) }))}
            />
          ) : (
            <Text size="sm">
              {formData.firstGenerationStudent === true
                ? "Yes"
                : formData.firstGenerationStudent === false
                  ? "No"
                  : "Not on file"}
            </Text>
          )}
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>Disability status</Text>
          {editing ? (
            <Select
              placeholder="Select"
              data={BOOLEAN_OPTIONS}
              value={boolToTriState(formData.disabilityStatus)}
              onChange={(v) => setFormData((p) => ({ ...p, disabilityStatus: triStateToBool(v) }))}
            />
          ) : (
            <Text size="sm">
              {formData.disabilityStatus === true
                ? "Yes"
                : formData.disabilityStatus === false
                  ? "No"
                  : "Not on file"}
            </Text>
          )}
        </div>
      </Stack>

      {editing && (
        <Group>
          <Button
            size="sm"
            onClick={() => updateMutation.mutate(formData)}
            loading={updateMutation.isPending}
            disabled={!isModified}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="light"
            onClick={() => {
              setEditing(false);
              if (demographicsRes?.demographics) {
                setFormData(demographicsRes.demographics);
              }
            }}
          >
            Cancel
          </Button>
        </Group>
      )}
    </Stack>
  );
}
