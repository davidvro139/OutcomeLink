import { ROLES, ROLE_LABELS, type Role } from "@outcomelink/shared";
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useCampuses, usePrograms } from "../../api/programs";
import {
  type InviteUserInput,
  type StaffUser,
  type UpdateUserInput,
  useInviteUser,
  useResetUserPassword,
  useSetUserAccess,
  useSetUserActive,
  useUpdateUser,
  useUsers,
} from "../../api/users";
import { useAuth } from "../../auth/AuthContext";
import type { EmailResult } from "../../lib/emailStatus";

const CAN_MANAGE_USERS = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

// Mirrors server/src/lib/accessScope.ts's PROGRAM_SCOPED_ROLES — the only
// two roles getAccessibleProgramIds() ever actually consults, so program/
// campus assignment is only meaningful (and only shown) for these.
const PROGRAM_SCOPED_ROLES: Role[] = ["PROGRAM_ADMINISTRATOR", "READ_ONLY_AUDITOR"];

/**
 * The server emails the set-password link itself when it can, and returns
 * the raw token only when it couldn't (email not configured, or the send
 * failed) — then fall back to a copyable link, saying why if it was a failure.
 */
async function deliverSetPasswordLink(
  result: { token?: string } & EmailResult,
  label: string,
  email: string,
) {
  if (result.emailStatus === "SENT") {
    notifications.show({ message: `${label} emailed to ${email}`, color: "green" });
    return;
  }
  if (result.emailStatus === "FAILED") {
    notifications.show({
      message: `The email to ${email} failed (${result.emailReason}) — copying the link instead.`,
      color: "yellow",
    });
  }
  if (result.token) await copySetPasswordLink(result.token, label);
}

async function copySetPasswordLink(token: string, label: string) {
  const url = `${window.location.origin}/set-password/${token}`;
  try {
    await navigator.clipboard.writeText(url);
    notifications.show({ message: `${label} link copied to clipboard`, color: "blue" });
  } catch {
    notifications.show({ message: url, autoClose: false, color: "blue", title: `${label} link` });
  }
}

interface UserFormValues {
  name: string;
  email: string;
  role: Role;
  programIds: string[];
  campusIds: string[];
}

const EMPTY_FORM: UserFormValues = {
  name: "",
  email: "",
  role: "INSTRUCTOR_STAFF",
  programIds: [],
  campusIds: [],
};

function UserFormModal({
  opened,
  onClose,
  editingUser,
}: {
  opened: boolean;
  onClose: () => void;
  editingUser: StaffUser | null;
}) {
  const [form, setForm] = useState<UserFormValues>(EMPTY_FORM);
  const { data: programs } = usePrograms();
  const { data: campuses } = useCampuses();
  const inviteUser = useInviteUser();
  const updateUser = useUpdateUser(editingUser?.id ?? -1);
  const setAccess = useSetUserAccess(editingUser?.id ?? -1);

  // Re-seed the form whenever a different user is opened for editing (or
  // the modal opens fresh for Invite) — cheaper and less error-prone than
  // trying to keep it in sync with every possible prop change.
  const [seededFor, setSeededFor] = useState<number | null | "new">(null);
  const wantSeed = editingUser ? editingUser.id : opened ? "new" : null;
  if (opened && wantSeed !== seededFor) {
    setSeededFor(wantSeed);
    setForm(
      editingUser
        ? {
            name: editingUser.name,
            email: editingUser.email ?? "",
            role: editingUser.role,
            programIds: (editingUser.programIds ?? []).map(String),
            campusIds: (editingUser.campusIds ?? []).map(String),
          }
        : EMPTY_FORM,
    );
  }

  async function handleSubmit() {
    try {
      if (editingUser) {
        const input: UpdateUserInput = { name: form.name, email: form.email, role: form.role };
        await updateUser.mutateAsync(input);
        if (PROGRAM_SCOPED_ROLES.includes(form.role)) {
          await setAccess.mutateAsync({
            programIds: form.programIds.map(Number),
            campusIds: form.campusIds.map(Number),
          });
        }
        notifications.show({ message: "User updated", color: "green" });
      } else {
        const input: InviteUserInput = { name: form.name, email: form.email, role: form.role };
        const result = await inviteUser.mutateAsync(input);
        await deliverSetPasswordLink(result, "Invitation", form.email);
      }
      onClose();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to save user",
        color: "red",
      });
    }
  }

  const isSaveDisabled = !form.name.trim() || !form.email.trim();
  const isPending = inviteUser.isPending || updateUser.isPending || setAccess.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editingUser ? "Edit User" : "Invite User"}
      size="lg"
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
        />
        <TextInput
          label="Email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.currentTarget.value })}
        />
        <Select
          label="Role"
          data={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          value={form.role}
          onChange={(v) => setForm({ ...form, role: v as Role })}
          allowDeselect={false}
        />

        {editingUser && PROGRAM_SCOPED_ROLES.includes(form.role) && (
          <>
            <Text size="sm" c="dimmed">
              This role only sees data for its assigned programs/campuses — leave both empty and
              they'll see nothing until assigned.
            </Text>
            <MultiSelect
              label="Accessible programs"
              data={(programs?.items ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
              value={form.programIds}
              onChange={(v) => setForm({ ...form, programIds: v })}
              searchable
              clearable
            />
            <MultiSelect
              label="Accessible campuses"
              description="Grants every program at the selected campus, in addition to any picked above"
              data={(campuses?.items ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
              value={form.campusIds}
              onChange={(v) => setForm({ ...form, campusIds: v })}
              searchable
              clearable
            />
          </>
        )}
        {editingUser && !PROGRAM_SCOPED_ROLES.includes(form.role) && (
          <Text size="xs" c="dimmed">
            {ROLE_LABELS[form.role]} sees all of the institution's data — program/campus assignment
            doesn't apply to this role.
          </Text>
        )}

        <Button onClick={handleSubmit} loading={isPending} disabled={isSaveDisabled}>
          {editingUser ? "Save" : "Send Invite"}
        </Button>
      </Stack>
    </Modal>
  );
}

/** User Administration (docs/TODO.md): invitations, deactivation, password reset, and program/campus assignment. */
export function UsersPage() {
  const { user } = useAuth();
  const canManage = !!user && CAN_MANAGE_USERS.includes(user.role);
  const { data: users, isLoading } = useUsers({ includeInactive: true });

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);

  if (!canManage) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        You don't have access to this page.
      </Text>
    );
  }

  function openInviteModal() {
    setEditingUser(null);
    openModal();
  }

  function openEditModal(u: StaffUser) {
    setEditingUser(u);
    openModal();
  }

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <Title order={2}>Users</Title>
        <Button onClick={openInviteModal}>Invite User</Button>
      </Group>

      {isLoading && <Loader />}

      {users && users.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} onEdit={() => openEditModal(u)} />
            ))}
          </Table.Tbody>
        </Table>
      )}

      <UserFormModal opened={modalOpened} onClose={closeModal} editingUser={editingUser} />
    </Stack>
  );
}

function UserRow({ user, onEdit }: { user: StaffUser; onEdit: () => void }) {
  const setActive = useSetUserActive(user.id);
  const resetPassword = useResetUserPassword(user.id);

  async function handleToggleActive() {
    try {
      await setActive.mutateAsync(!user.active);
      notifications.show({
        message: user.active ? "User deactivated" : "User reactivated",
        color: "green",
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to update user",
        color: "red",
      });
    }
  }

  async function handleResetPassword() {
    try {
      const result = await resetPassword.mutateAsync();
      await deliverSetPasswordLink(result, "Password reset", user.email ?? "the user");
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to reset password",
        color: "red",
      });
    }
  }

  return (
    <Table.Tr>
      <Table.Td>{user.name}</Table.Td>
      <Table.Td>{user.email ?? "—"}</Table.Td>
      <Table.Td>{ROLE_LABELS[user.role]}</Table.Td>
      <Table.Td>
        <Badge color={user.active ? "green" : "gray"}>{user.active ? "Active" : "Inactive"}</Badge>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" variant="subtle" onClick={onEdit}>
            Edit
          </Button>
          <Button
            size="xs"
            variant="subtle"
            onClick={handleResetPassword}
            loading={resetPassword.isPending}
          >
            Reset Password
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color={user.active ? "red" : "teal"}
            onClick={handleToggleActive}
            loading={setActive.isPending}
          >
            {user.active ? "Deactivate" : "Reactivate"}
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}
