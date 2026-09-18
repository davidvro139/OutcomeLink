import { ActionIcon, Indicator, Menu, ScrollArea, Stack, Text } from "@mantine/core";
import { IconBell } from "@tabler/icons-react";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../api/notifications";

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
                >
                  <Text size="sm">{n.message}</Text>
                  <Text size="xs" c="dimmed">
                    {new Date(n.createdAt).toLocaleString()}
                  </Text>
                </Menu.Item>
              ))}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  );
}
