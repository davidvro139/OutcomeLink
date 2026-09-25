<<<<<<< HEAD
import { CPL_METRICS, IMPROVEMENT_PLAN_STATUSES, type ImprovementPlanStatus } from "@outcomelink/shared";
=======
import {
  CPL_METRICS,
  IMPROVEMENT_PLAN_STATUSES,
  type ImprovementPlanStatus,
} from "@outcomelink/shared";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import {
  Accordion,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  type CreateImprovementPlanInput,
  useAddImprovementPlanUpdate,
  useCreateImprovementPlan,
  useImprovementPlan,
  useImprovementPlans,
  useUpdateImprovementPlan,
} from "../../api/accreditation";
import { usePrograms } from "../../api/programs";
import { useUsers } from "../../api/users";
<<<<<<< HEAD
=======
import { usePermissions } from "../../auth/usePermissions";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "gray",
  ACTIVE: "blue",
  MONITORING: "yellow",
  COMPLETED: "green",
  CLOSED: "dark",
};

// A looser local shape than CreateImprovementPlanInput: NumberInput and a
// native date input need a real initial value (empty string, not undefined)
// to be controlled from mount, or React warns about the input silently
// flipping from uncontrolled to controlled the moment a value is set — same
// class of bug fixed the same way elsewhere in this app (EnrollmentsTab,
// StudentsListPage). Converted to the strict API type on submit.
interface NewPlanFormValues {
  programId: number;
  metric: CreateImprovementPlanInput["metric"];
  reportingPeriodId: number;
  currentResult: number | "";
  target: number | "";
  responsibleUserId: number;
  problemDescription: string;
  rootCause: string;
  dueDate: string;
}

export function ImprovementPlansTab({ reportingPeriodId }: { reportingPeriodId: number }) {
<<<<<<< HEAD
=======
  const { canWrite } = usePermissions();
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const { data: plans, isLoading } = useImprovementPlans({ reportingPeriodId });
  const { data: programs } = usePrograms();
  const { data: users } = useUsers();
  const createPlan = useCreateImprovementPlan();
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);

  const form = useForm<NewPlanFormValues>({
    initialValues: {
      programId: 0,
      metric: "COMPLETION",
      reportingPeriodId,
      currentResult: "",
      target: "",
      responsibleUserId: 0,
      problemDescription: "",
      rootCause: "",
      dueDate: "",
    },
    validate: {
      programId: (value) => (value ? null : "Program is required"),
      responsibleUserId: (value) => (value ? null : "A responsible person is required"),
    },
  });

  async function handleSubmit(values: NewPlanFormValues) {
    try {
      await createPlan.mutateAsync({
        ...values,
        currentResult: values.currentResult === "" ? undefined : values.currentResult,
        target: values.target === "" ? undefined : values.target,
        dueDate: values.dueDate || undefined,
      });
      notifications.show({ message: "Improvement plan created", color: "green" });
      form.reset();
      closeForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create improvement plan",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Improvement Plans</Text>
<<<<<<< HEAD
        <Button size="xs" variant="light" onClick={openForm}>
          New Plan
        </Button>
=======
        {canWrite && (
          <Button size="xs" variant="light" onClick={openForm}>
            New Plan
          </Button>
        )}
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
      </Group>

      {isLoading && <Loader />}

      {plans && plans.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No improvement plans for this reporting period yet.
        </Text>
      )}

      <Accordion variant="separated">
        {plans?.map((plan) => (
          <Accordion.Item key={plan.id} value={String(plan.id)}>
            <Accordion.Control>
              <Group justify="space-between" pr="md">
                <div>
                  <Text fw={500}>
                    {plan.program.name} — {plan.metric}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {plan.currentResult ? `${plan.currentResult}%` : "no baseline"}
                    {" → "}
                    {plan.target ? `${plan.target}% target` : "no target set"} · Responsible:{" "}
                    {plan.responsibleUser.name}
                  </Text>
                </div>
                <Badge color={STATUS_COLORS[plan.status]}>{plan.status}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <PlanDetail planId={plan.id} />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      <Modal opened={formOpened} onClose={closeForm} title="New Improvement Plan" size="lg">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="sm">
            <Select
              label="Program"
              required
              data={programs?.items.map((p) => ({ value: String(p.id), label: p.name })) ?? []}
              value={form.values.programId ? String(form.values.programId) : null}
              onChange={(v) => form.setFieldValue("programId", v ? Number(v) : 0)}
            />
            <Select
              label="Metric"
              data={CPL_METRICS.map((m) => ({ value: m, label: m }))}
              {...form.getInputProps("metric")}
              allowDeselect={false}
            />
            <Group grow>
<<<<<<< HEAD
              <NumberInput label="Current result (%)" min={0} max={100} {...form.getInputProps("currentResult")} />
=======
              <NumberInput
                label="Current result (%)"
                min={0}
                max={100}
                {...form.getInputProps("currentResult")}
              />
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
              <NumberInput label="Target (%)" min={0} max={100} {...form.getInputProps("target")} />
            </Group>
            <Textarea
              label="Problem description"
              autosize
              minRows={2}
              {...form.getInputProps("problemDescription")}
            />
<<<<<<< HEAD
            <Textarea label="Root cause" autosize minRows={2} {...form.getInputProps("rootCause")} />
=======
            <Textarea
              label="Root cause"
              autosize
              minRows={2}
              {...form.getInputProps("rootCause")}
            />
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
            <Select
              label="Responsible person"
              required
              data={users?.map((u) => ({ value: String(u.id), label: u.name })) ?? []}
              value={form.values.responsibleUserId ? String(form.values.responsibleUserId) : null}
              onChange={(v) => form.setFieldValue("responsibleUserId", v ? Number(v) : 0)}
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Due date
              </Text>
<<<<<<< HEAD
              <input type="date" {...form.getInputProps("dueDate")} style={{ padding: 8, width: "100%" }} />
=======
              <input
                type="date"
                {...form.getInputProps("dueDate")}
                style={{ padding: 8, width: "100%" }}
              />
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
            </div>
            <Button type="submit" loading={createPlan.isPending}>
              Create Plan
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

function PlanDetail({ planId }: { planId: number }) {
<<<<<<< HEAD
=======
  const { canWrite } = usePermissions();
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const { data: plan } = useImprovementPlan(planId);
  const updatePlan = useUpdateImprovementPlan(planId);
  const addUpdate = useAddImprovementPlanUpdate(planId);
  const [updateFormOpened, { toggle: toggleUpdateForm }] = useDisclosure(false);

  const updateForm = useForm<{ updateText: string; correctiveAction?: string }>({
    initialValues: { updateText: "", correctiveAction: "" },
    validate: { updateText: (value) => (value.trim() ? null : "Update text is required") },
  });

  async function handleStatusChange(status: string | null) {
    if (!status) return;
    try {
      await updatePlan.mutateAsync({ status: status as ImprovementPlanStatus });
      notifications.show({ message: "Status updated", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to update status",
        color: "red",
      });
    }
  }

  async function handleAddUpdate(values: { updateText: string; correctiveAction?: string }) {
    try {
      await addUpdate.mutateAsync(values);
      notifications.show({ message: "Update added", color: "green" });
      updateForm.reset();
      toggleUpdateForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to add update",
        color: "red",
      });
    }
  }

  if (!plan) return <Loader size="sm" />;

  return (
    <Stack gap="sm">
      <Group>
<<<<<<< HEAD
        <Select
          label="Status"
          w={200}
          data={IMPROVEMENT_PLAN_STATUSES.map((s) => ({ value: s, label: s }))}
          defaultValue={plan.status}
          onChange={handleStatusChange}
          allowDeselect={false}
        />
=======
        {canWrite ? (
          <Select
            label="Status"
            w={200}
            data={IMPROVEMENT_PLAN_STATUSES.map((s) => ({ value: s, label: s }))}
            defaultValue={plan.status}
            onChange={handleStatusChange}
            allowDeselect={false}
          />
        ) : (
          <Text size="sm">Status: {plan.status}</Text>
        )}
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
      </Group>

      {plan.problemDescription && (
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Problem
          </Text>
          <Text size="sm">{plan.problemDescription}</Text>
        </div>
      )}
      {plan.rootCause && (
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Root Cause
          </Text>
          <Text size="sm">{plan.rootCause}</Text>
        </div>
      )}

      <Group justify="space-between">
        <Text size="sm" fw={500}>
          Progress Updates
        </Text>
<<<<<<< HEAD
        <Button size="xs" variant="subtle" onClick={toggleUpdateForm}>
          {updateFormOpened ? "Cancel" : "Add Update"}
        </Button>
=======
        {canWrite && (
          <Button size="xs" variant="subtle" onClick={toggleUpdateForm}>
            {updateFormOpened ? "Cancel" : "Add Update"}
          </Button>
        )}
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
      </Group>

      {updateFormOpened && (
        <form onSubmit={updateForm.onSubmit(handleAddUpdate)}>
          <Stack gap="xs" p="sm" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
<<<<<<< HEAD
            <Textarea label="Update" required autosize minRows={2} {...updateForm.getInputProps("updateText")} />
=======
            <Textarea
              label="Update"
              required
              autosize
              minRows={2}
              {...updateForm.getInputProps("updateText")}
            />
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
            <Textarea
              label="Corrective action"
              autosize
              minRows={2}
              {...updateForm.getInputProps("correctiveAction")}
            />
            <Button type="submit" size="xs" loading={addUpdate.isPending}>
              Save Update
            </Button>
          </Stack>
        </form>
      )}

      {plan.updates?.map((u) => (
<<<<<<< HEAD
        <Stack key={u.id} gap={2} p="xs" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
=======
        <Stack
          key={u.id}
          gap={2}
          p="xs"
          bg="var(--mantine-color-default)"
          style={{ borderRadius: 8 }}
        >
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
          <Text size="xs" c="dimmed">
            {u.createdBy} · {new Date(u.createdAt).toLocaleString()}
          </Text>
          <Text size="sm">{u.updateText}</Text>
          {u.correctiveAction && (
            <Text size="sm" c="dimmed">
              Corrective action: {u.correctiveAction}
            </Text>
          )}
        </Stack>
      ))}
      {plan.updates?.length === 0 && (
        <Text size="sm" c="dimmed">
          No updates logged yet.
        </Text>
      )}
    </Stack>
  );
}
