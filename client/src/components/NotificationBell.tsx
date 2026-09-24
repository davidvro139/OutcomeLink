import {
  ActionIcon,
  Button,
  Group,
  Indicator,
  List,
  Popover,
  ScrollArea,
  Text,
  VisuallyHidden,
} from "@mantine/core";
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
    await (n.type === "REPORT_EXPORT_READY"
      ? downloadReportExportJob(id)
      : downloadScheduledReportRun(id));
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
  return (
    (n.type === "SCHEDULED_REPORT_READY" || n.type === "REPORT_EXPORT_READY") &&
    n.referenceEntityId !== null
  );
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

  // A popover dialog rather than a menu: it holds a list of messages with their own buttons (mark read,
  // download), which isn't a menu of commands — and a menu role may only contain menu items.
  return (
    <Popover position="bottom-end" shadow="md" width={360} trapFocus>
      {/* The Indicator sits outside the Popover.Target: the target gets aria-haspopup/aria-expanded, which
          are invalid on the Indicator's <div>. */}
      <Indicator
        label={unreadCount > 9 ? "9+" : unreadCount}
        size={16}
        color="red"
        disabled={unreadCount === 0}
      >
        <Popover.Target>
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <IconBell size={20} />
          </ActionIcon>
        </Popover.Target>
      </Indicator>
      <Popover.Dropdown p={0} role="dialog" aria-label="Notifications">
        <Group justify="space-between" px="sm" py="xs">
          <Text fw={600} size="sm">
            Notifications
          </Text>
          {unreadCount > 0 && (
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </Group>
        <ScrollArea.Autosize mah={360}>
          {!data || data.notifications.length === 0 ? (
            <Text size="sm" c="dimmed" p="sm">
              No notifications yet.
            </Text>
          ) : (
            <List listStyleType="none" m={0} p={0}>
              {data.notifications.map((n) => (
                <List.Item
                  key={n.id}
                  px="sm"
                  py="xs"
                  bg={n.readAt ? undefined : "var(--mantine-color-blue-light)"}
                  style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
                >
                  <Text size="sm" fw={n.readAt ? 400 : 600}>
                    {!n.readAt && <VisuallyHidden>Unread: </VisuallyHidden>}
                    {n.message}
                  </Text>
                  <Group justify="space-between" align="center" wrap="nowrap" mt={2}>
                    <Text size="xs" c="dimmed">
                      {new Date(n.createdAt).toLocaleString()}
                    </Text>
                    <Group gap={4} wrap="nowrap">
                      {isDownloadableReport(n) && (
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          onClick={() => void handleDownload(n)}
                        >
                          Download
                        </Button>
                      )}
                      {!n.readAt && (
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          onClick={() => markRead.mutate(n.id)}
                        >
                          Mark read
                        </Button>
                      )}
                    </Group>
                  </Group>
                </List.Item>
              ))}
            </List>
          )}
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
