import {
  EMAIL_DELIVERY_STATUSES,
  EMAIL_PURPOSE_LABELS,
  EMAIL_PURPOSES,
  type EmailDeliveryStatus,
  type EmailPurpose,
} from "@outcomelink/shared";
import {
  Alert,
  Badge,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useState } from "react";
import { useEmailDeliveries, useEmailStatus } from "../../api/emailDeliveries";

const STATUS_LABELS: Record<EmailDeliveryStatus, string> = { SENT: "Sent", FAILED: "Failed" };

/** Every email the app actually tried to send, and how it went — the delivery history for invitations, surveys and notifications. */
export function EmailLogPanel() {
  const [status, setStatus] = useState<EmailDeliveryStatus | null>(null);
  const [purpose, setPurpose] = useState<EmailPurpose | null>(null);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useEmailDeliveries({
    status: status ?? undefined,
    purpose: purpose ?? undefined,
    page,
  });
  const { data: emailStatus } = useEmailStatus();

  return (
    <Stack gap="md">
      {emailStatus && !emailStatus.configured && (
        <Alert color="yellow" title="Email is not configured">
          The server has no SMTP settings, so nothing is being sent: invitations, password resets
          and surveys show a link to copy instead. Set SMTP_HOST and MAIL_FROM in the server
          environment to turn email on.
        </Alert>
      )}

      <Group>
        <Select
          label="Type"
          placeholder="All types"
          clearable
          w={220}
          data={EMAIL_PURPOSES.map((p) => ({ value: p, label: EMAIL_PURPOSE_LABELS[p] }))}
          value={purpose}
          onChange={(v) => {
            setPurpose(v as EmailPurpose | null);
            setPage(1);
          }}
        />
        <Select
          label="Status"
          placeholder="Any status"
          clearable
          w={160}
          data={EMAIL_DELIVERY_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          value={status}
          onChange={(v) => {
            setStatus(v as EmailDeliveryStatus | null);
            setPage(1);
          }}
        />
      </Group>

      {isLoading && <Loader />}

      {data && data.items.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          {status || purpose ? "No emails match these filters." : "No emails have been sent yet."}
        </Text>
      )}

      {data && data.items.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Sent</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>To</Table.Th>
              <Table.Th>Subject</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Error</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.items.map((d) => (
              <Table.Tr key={d.id}>
                <Table.Td>{new Date(d.createdAt).toLocaleString()}</Table.Td>
                <Table.Td>{EMAIL_PURPOSE_LABELS[d.purpose] ?? d.purpose}</Table.Td>
                <Table.Td>{d.toAddress}</Table.Td>
                <Table.Td maw={280}>
                  <Text size="sm" lineClamp={1}>
                    {d.subject}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={d.status === "SENT" ? "green" : "red"}>
                    {STATUS_LABELS[d.status]}
                  </Badge>
                </Table.Td>
                <Table.Td maw={280}>
                  <Tooltip label={d.errorMessage} disabled={!d.errorMessage} multiline maw={420}>
                    <Text size="sm" c="red" lineClamp={1}>
                      {d.errorMessage ?? ""}
                    </Text>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {data && data.pagination.totalPages > 1 && (
        <Pagination total={data.pagination.totalPages} value={page} onChange={setPage} />
      )}
    </Stack>
  );
}
