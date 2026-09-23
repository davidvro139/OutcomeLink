import { ActionIcon, Anchor, Group, Indicator, Menu, ScrollArea, Stack, Text } from "@mantine/core";
import { IconBell } from "@tabler/icons-react";
import { notifications as notify } from "@mantine/notifications";
import { ApiRequestError } from "../lib/apiClient";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type Notification,
} from "../api/notifications";
import { downloadReportExportJob } from "../api/reportExportJobs";
import { downloadScheduledReportRun } from "../api/scheduledReports";

async function handleDownload(n: Notification) {
  try {
    const id = n.referenceEntityId!;
    await (n.type === "REPORT_EXPORT_READY" ? downloadReportExportJob(id) : downloadScheduledReportRun(id));
  } catch (err) {
    // apiRequestBlob throws with the raw HTTP status text ("Not Found"), not the server's JSON
    // error message — a 404 here specifically means the run (or its file) no longer exists, so
    // say that plainly rather than surfacing the unhelpful status text verbatim.
    const message =
      err instanceof ApiRequestError && err.status === 404
        ? "This report is no longer available."
        : err instanceof Error
          ? err.message
          : "Failed to download report";
    notify.show({ message, color: "red" });
  }
}

// A failed run's notification also has this type + a referenceEntityId (pointing at the FAILED
// run, with no file) — the Download link still shows for it, but the click surfaces the server's
// "no generated file" error rather than silently doing nothing, which is honest enough not to be
// worth an extra request just to distinguish success from failure up front.
function isDownloadableReport(n: Notification): boolean {
  return (n.type === "SCHEDULED_REPORT_READY" || n.type === "REPORT_EXPORT_READY") && n.referenceEntityId !== null;
}

/**
 * "Missing-outcomes digest" (docs/TODO.md deferred items) needed somewhere
 * to actually land — a per-user notification inbox didn't exist anywhere in
 * the app before this. Polls every 60s (`useNotifications`'s
 * `refetchInterval`) rather than pushing in real time, since there's no
 * websocket/SSE infrastructure to push through.
 */
export function NotificationBell() {
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Menu position="bottom-end" shadow="md" width={340}>
      <Menu.Target>
        <Indicator
          label={unreadCount > 9 ? "9+" : unreadCount}
          size={16}
          color="red"
          disabled={unreadCount === 0}
        >
          <ActionIcon variant="subtle" size="lg" aria-label="Notifications">
            <IconBell size={20} />
          </ActionIcon>
        </Indicator>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          Notifications
          {unreadCount > 0 && (
            <Text
              component="span"
              size="xs"
              c="blue"
              ml="sm"
              style={{ cursor: "pointer" }}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Text>
          )}
        </Menu.Label>
        <ScrollArea.Autosize mah={360}>
          {!data || data.notifications.length === 0 ? (
            <Text size="sm" c="dimmed" p="sm">
              No notifications yet.
            </Text>
          ) : (
            <Stack gap={0}>
              {data.notifications.map((n) => (
                <Menu.Item
                  key={n.id}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                  }}
                  fw={n.readAt ? 400 : 600}
                  bg={n.readAt ? undefined : "var(--mantine-color-blue-light)"}
                  closeMenuOnClick={!isDownloadableReport(n)}
                >
                  <Text size="sm">{n.message}</Text>
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Text size="xs" c="dimmed">
                      {new Date(n.createdAt).toLocaleString()}
                    </Text>
                    {isDownloadableReport(n) && (
                      <Anchor
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownload(n);
                        }}
                      >
                        Download
                      </Anchor>
                    )}
                  </Group>
                </Menu.Item>
              ))}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  );
}
