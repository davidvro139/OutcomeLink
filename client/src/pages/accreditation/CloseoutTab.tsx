import type { CloseoutAction, CloseoutStep, CloseoutStepState } from "@outcomelink/shared";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCircle, IconLock, IconMinus } from "@tabler/icons-react";
import { useState } from "react";
import {
  useCloseout,
  useComputeReportingPeriod,
  useFinalizeReportingPeriod,
  useSetOutcomesDeadline,
  useSignOffReportingPeriod,
  useSubmitReportingPeriod,
  useValidateReportingPeriod,
} from "../../api/accreditation";
import { ApiRequestError } from "../../lib/apiClient";
import { usePermissions } from "../../auth/usePermissions";

const STATE_STYLE: Record<CloseoutStepState, { color: string; label: string }> = {
  DONE: { color: "green", label: "Done" },
  TODO: { color: "blue", label: "To do" },
  BLOCKED: { color: "gray", label: "Waiting" },
  OPTIONAL: { color: "gray", label: "Optional" },
  LOCKED: { color: "teal", label: "Locked" },
};

function StateIcon({ state }: { state: CloseoutStepState }) {
  const { color } = STATE_STYLE[state];
  return (
    <ThemeIcon
      radius="xl"
      size={28}
      color={color}
      variant={state === "DONE" || state === "LOCKED" ? "filled" : "light"}
    >
      {state === "DONE" ? (
        <IconCheck size={16} />
      ) : state === "LOCKED" ? (
        <IconLock size={14} />
      ) : state === "OPTIONAL" ? (
        <IconMinus size={14} />
      ) : (
        <IconCircle size={12} />
      )}
    </ThemeIcon>
  );
}

const ACTION_LABELS: Record<CloseoutAction, string> = {
  SET_DEADLINE: "Set deadline",
  COMPUTE: "Compute now",
  VALIDATE: "Run validation",
  SIGN_OFF: "Sign off",
  FINALIZE: "Finalize…",
  SUBMIT: "Mark submitted",
};

const LINK_TABS: Record<string, string> = {
  validation: "Open Data Validation",
  "improvement-plans": "Open Improvement Plans",
  dashboard: "View CPL results",
  readiness: "View readiness",
};

/**
 * The guided close-out for a reporting period (docs/TODO.md): the ordered
 * steps, what is done, what is blocking, and the action for each in place.
 * Finalize is guarded by the server — signed off on the current results, and
 * an override reason when blockers remain.
 */
export function CloseoutTab({
  reportingPeriodId,
  onOpenTab,
}: {
  reportingPeriodId: number;
  onOpenTab: (tab: string) => void;
}) {
  const { canAdminister } = usePermissions();
  const { data, isLoading } = useCloseout(reportingPeriodId);
  const compute = useComputeReportingPeriod(reportingPeriodId);
  const validate = useValidateReportingPeriod(reportingPeriodId);
  const signOff = useSignOffReportingPeriod(reportingPeriodId);
  const finalize = useFinalizeReportingPeriod(reportingPeriodId);
  const submit = useSubmitReportingPeriod(reportingPeriodId);
  const setDeadline = useSetOutcomesDeadline(reportingPeriodId);

  const [signOffOpen, setSignOffOpen] = useState(false);
  const [signOffNote, setSignOffNote] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadline, setDeadlineValue] = useState("");

  if (isLoading || !data) return <Loader />;

  const needsOverride = data.needsOverride;

  async function run<T>(promise: Promise<T>, success: string) {
    try {
      await promise;
      notifications.show({ message: success, color: "green" });
      return true;
    } catch (err) {
      notifications.show({
        message:
          err instanceof ApiRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : "That didn't work",
        color: "red",
      });
      return false;
    }
  }

  async function handleAction(action: CloseoutAction) {
    switch (action) {
      case "COMPUTE":
        return void (await run(compute.mutateAsync(undefined), "Results computed"));
      case "VALIDATE":
        return void (await run(validate.mutateAsync(undefined), "Validation complete"));
      case "SUBMIT":
        return void (await run(submit.mutateAsync(undefined), "Marked as submitted"));
      case "SIGN_OFF":
        return setSignOffOpen(true);
      case "FINALIZE":
        return setFinalizeOpen(true);
      case "SET_DEADLINE":
        return setDeadlineOpen(true);
    }
  }

  async function handleSignOff() {
    if (await run(signOff.mutateAsync({ note: signOffNote.trim() || undefined }), "Signed off")) {
      setSignOffOpen(false);
      setSignOffNote("");
    }
  }

  async function handleFinalize() {
    const ok = await run(
      finalize.mutateAsync(needsOverride ? { overrideReason: overrideReason.trim() } : undefined),
      "Reporting period finalized",
    );
    if (ok) {
      setFinalizeOpen(false);
      setOverrideReason("");
    }
  }

  async function handleDeadline() {
    if (
      await run(setDeadline.mutateAsync(new Date(deadline).toISOString()), "Outcomes deadline set")
    ) {
      setDeadlineOpen(false);
    }
  }

  const busy = (action: CloseoutAction) =>
    (action === "COMPUTE" && compute.isPending) ||
    (action === "VALIDATE" && validate.isPending) ||
    (action === "SUBMIT" && submit.isPending);

  function StepRow({ step }: { step: CloseoutStep }) {
    const style = STATE_STYLE[step.state];
    return (
      <Group wrap="nowrap" align="flex-start" gap="md" aria-label={`${step.title}: ${style.label}`}>
        <StateIcon state={step.state} />
        <Stack gap={2} style={{ flex: 1 }}>
          <Group gap="xs">
            <Text fw={500}>{step.title}</Text>
            <Badge size="xs" variant="light" color={style.color}>
              {style.label}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {step.detail}
          </Text>
        </Stack>
        <Group gap="xs" wrap="nowrap">
          {step.link && step.state !== "LOCKED" && (
            <Button variant="subtle" size="xs" onClick={() => onOpenTab(step.link!)}>
              {LINK_TABS[step.link]}
            </Button>
          )}
          {step.action && canAdminister && (
            <Button
              size="xs"
              onClick={() => handleAction(step.action!)}
              loading={busy(step.action)}
              // Compute and validation both rewrite the results, so never run one while the other is in flight.
              disabled={(compute.isPending || validate.isPending) && !busy(step.action)}
            >
              {ACTION_LABELS[step.action]}
            </Button>
          )}
        </Group>
      </Group>
    );
  }

  return (
    <Stack gap="md" maw={900}>
      <Text size="sm" c="dimmed">
        Work down the list: each step shows what's done, what's holding the period back, and the
        action to take. Finalizing needs a current sign-off; if errors, stale results or off-track
        programs without a plan remain, an administrator can still finalize by giving a reason,
        which is recorded.
      </Text>

      {data.locked && (
        <Alert
          color="teal"
          title={
            data.status === "SUBMITTED"
              ? "This period has been submitted"
              : "This period is finalized"
          }
        >
          <Text size="sm">
            {data.signOff
              ? `Signed off by ${data.signOff.by}${data.signOff.note ? ` — “${data.signOff.note}”` : ""}. `
              : ""}
            {!data.signOff
              ? "It was finalized before sign-off and close-out checks existed, so none were recorded."
              : data.finalizeOverrideReason
                ? `It was finalized with blockers outstanding. Reason: “${data.finalizeOverrideReason}”.`
                : "It was finalized with no blockers outstanding."}{" "}
            Reopen the period to change anything.
          </Text>
        </Alert>
      )}

      {!data.locked && data.blockers.length > 0 && (
        <Alert
          color="red"
          title={`${data.blockers.length} thing${data.blockers.length === 1 ? "" : "s"} blocking a clean finalize`}
        >
          <Stack gap={2}>
            {data.blockers.map((b) => (
              <Text key={b.code} size="sm">
                • {b.message}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {!data.locked && data.blockers.length === 0 && (
        <Alert color="green" title="Nothing is blocking finalize">
          Results are current, validation is clean and every off-track program has a plan.
        </Alert>
      )}

      <Stack gap="lg">
        <Title order={5}>Close-out steps</Title>
        {data.steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </Stack>

      <Modal opened={signOffOpen} onClose={() => setSignOffOpen(false)} title="Sign off the review">
        <Stack gap="md">
          <Text size="sm">
            You are confirming that you have reviewed the current results for this period. The
            sign-off applies to these exact results — if results are recomputed or student data
            changes afterwards, it has to be repeated.
          </Text>
          {data.blockers.length > 0 && (
            <Alert color="yellow">
              {data.blockers.length} blocker{data.blockers.length === 1 ? "" : "s"} remain. You can
              still sign off, but finalizing will need an override reason.
            </Alert>
          )}
          <Textarea
            label="Note (optional)"
            value={signOffNote}
            onChange={(e) => setSignOffNote(e.currentTarget.value)}
          />
          <Button onClick={handleSignOff} loading={signOff.isPending}>
            Sign off
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        title="Finalize this period"
      >
        <Stack gap="md">
          <Text size="sm">
            Finalizing locks the period against recomputation and outcome edits until it is
            reopened.
          </Text>
          {needsOverride && (
            <>
              <Alert color="red" title="Blockers are outstanding">
                <Stack gap={2}>
                  {data.blockers.map((b) => (
                    <Text key={b.code} size="sm">
                      • {b.message}
                    </Text>
                  ))}
                </Stack>
              </Alert>
              <Textarea
                label="Override reason"
                required
                description="Why is it right to finalize anyway? This is recorded on the period and in its audit trail."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.currentTarget.value)}
              />
            </>
          )}
          <Button
            color="teal"
            onClick={handleFinalize}
            loading={finalize.isPending}
            disabled={needsOverride && !overrideReason.trim()}
          >
            {needsOverride ? "Finalize anyway" : "Finalize"}
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={deadlineOpen}
        onClose={() => setDeadlineOpen(false)}
        title="Set the outcomes deadline"
      >
        <Stack gap="md">
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadlineValue(e.currentTarget.value)}
            style={{ padding: 8 }}
          />
          <Button onClick={handleDeadline} loading={setDeadline.isPending} disabled={!deadline}>
            Save deadline
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
