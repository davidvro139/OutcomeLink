import { Alert, Button, Loader, Modal, Radio, Stack, Table, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useDuplicateCandidates, useMergeStudent, useStudent } from "../../api/students";

/**
 * Phase 2 P10 (docs/TODO.md): the "Merge" action a POSSIBLE_DUPLICATE_STUDENT
 * validation issue links to. `flaggedStudentId` is whichever student the
 * clicked issue row names; the candidate list comes from
 * GET /api/students/:id/duplicate-candidates, which uses the exact same
 * normalized-name match validationEngine.ts does, so this list can never
 * disagree with the issue that sent staff here.
 */
export function MergeDuplicatesModal({
  opened,
  onClose,
  flaggedStudentId,
  onMerged,
}: {
  opened: boolean;
  onClose: () => void;
  flaggedStudentId: number;
  onMerged: () => void;
}) {
  const { data: flaggedStudent } = useStudent(flaggedStudentId);
  const { data: candidates, isLoading } = useDuplicateCandidates(flaggedStudentId);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [survivorChoice, setSurvivorChoice] = useState<"flagged" | "candidate">("flagged");
  const [reason, setReason] = useState("");

  const selectedCandidate = candidates?.find((c) => String(c.id) === candidateId);
  const survivorId =
    survivorChoice === "flagged" ? flaggedStudentId : (selectedCandidate?.id ?? null);
  const mergedId = survivorChoice === "flagged" ? selectedCandidate?.id : flaggedStudentId;

  const mergeStudent = useMergeStudent(survivorId ?? 0);

  function handleClose() {
    setCandidateId(null);
    setSurvivorChoice("flagged");
    setReason("");
    onClose();
  }

  async function handleConfirm() {
    if (!survivorId || !mergedId) return;
    try {
      await mergeStudent.mutateAsync({ mergedStudentId: mergedId, reason });
      notifications.show({
        message:
          "Students merged. Other stale duplicate warnings for this pair will clear on the next validation run.",
        color: "green",
      });
      onMerged();
      handleClose();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to merge students",
        color: "red",
      });
    }
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="Merge Duplicate Students" size="lg">
      <Stack gap="md">
        {isLoading && <Loader />}

        {!isLoading && candidates && candidates.length === 0 && (
          <Alert color="blue">
            No other student record currently matches this name — this may have already been
            resolved. Try re-running validation.
          </Alert>
        )}

        {!isLoading && candidates && candidates.length > 0 && flaggedStudent && (
          <>
            <Text size="sm" c="dimmed">
              Choose which of these matching records is the duplicate. Every enrollment, employment
              record, follow-up, and other history from the merged-away record moves onto the
              surviving one; the merged-away record itself is kept for audit history, not deleted.
            </Text>

            <Radio.Group
              label="Compare with"
              value={candidateId}
              onChange={setCandidateId}
            >
              <Stack gap={4} mt={4}>
                {candidates.map((candidate) => (
                  <Radio
                    key={candidate.id}
                    value={String(candidate.id)}
                    label={`${candidate.firstName} ${candidate.lastName} — ${candidate.internalStudentId}${candidate.email ? ` (${candidate.email})` : ""}`}
                  />
                ))}
              </Stack>
            </Radio.Group>

            {selectedCandidate && (
              <>
                <Table withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th></Table.Th>
                      <Table.Th>Flagged record</Table.Th>
                      <Table.Th>Selected match</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td>Internal ID</Table.Td>
                      <Table.Td>{flaggedStudent.internalStudentId}</Table.Td>
                      <Table.Td>{selectedCandidate.internalStudentId}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Email</Table.Td>
                      <Table.Td>{flaggedStudent.email ?? "—"}</Table.Td>
                      <Table.Td>{selectedCandidate.email ?? "—"}</Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>

                <Radio.Group
                  label="Which record should survive the merge?"
                  value={survivorChoice}
                  onChange={(v) => setSurvivorChoice(v as "flagged" | "candidate")}
                >
                  <Stack gap={4} mt={4}>
                    <Radio
                      value="flagged"
                      label={`Keep ${flaggedStudent.firstName} ${flaggedStudent.lastName} (${flaggedStudent.internalStudentId})`}
                    />
                    <Radio
                      value="candidate"
                      label={`Keep ${selectedCandidate.firstName} ${selectedCandidate.lastName} (${selectedCandidate.internalStudentId})`}
                    />
                  </Stack>
                </Radio.Group>

                <Textarea
                  label="Reason"
                  required
                  placeholder="Why are these the same person? (e.g. matching enrollment dates, shared employer, family confirmed)"
                  value={reason}
                  onChange={(e) => setReason(e.currentTarget.value)}
                  minRows={2}
                />

                <Button
                  color="red"
                  onClick={handleConfirm}
                  loading={mergeStudent.isPending}
                  disabled={!reason.trim()}
                >
                  Merge Records
                </Button>
              </>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
