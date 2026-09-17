import { COMMUNICATION_EVENT_TYPE_LABELS, type CommunicationEventType } from "@outcomelink/shared";
import { Loader, Stack, Text, ThemeIcon, Timeline } from "@mantine/core";
import {
  IconBell,
  IconClipboardCheck,
  IconMailOpened,
  IconPhoneCall,
  IconSend,
  type Icon,
} from "@tabler/icons-react";
import { useCommunicationTimeline } from "../../api/communicationTimeline";

const EVENT_ICONS: Record<CommunicationEventType, Icon> = {
  FOLLOW_UP_ATTEMPT: IconPhoneCall,
  GRADUATE_SURVEY_SENT: IconSend,
  GRADUATE_SURVEY_RESPONSE: IconMailOpened,
  EMPLOYER_SURVEY_SENT: IconSend,
  EMPLOYER_SURVEY_RESPONSE: IconMailOpened,
  VERIFICATION_CONTACT: IconClipboardCheck,
  NOTIFICATION: IconBell,
};

const EVENT_COLORS: Record<CommunicationEventType, string> = {
  FOLLOW_UP_ATTEMPT: "blue",
  GRADUATE_SURVEY_SENT: "grape",
  GRADUATE_SURVEY_RESPONSE: "teal",
  EMPLOYER_SURVEY_SENT: "grape",
  EMPLOYER_SURVEY_RESPONSE: "teal",
  VERIFICATION_CONTACT: "orange",
  NOTIFICATION: "gray",
};

/**
 * Phase 2 P13 (docs/TODO.md): a single chronological view over every recorded
 * follow-up attempt and survey send/response for this student. Only sources
 * with a real write pathway appear here — Verification Contact and
 * Notification event types exist in the schema but nothing creates those
 * underlying records yet (no VerificationRecord endpoint, and the
 * `notifications` module is still an empty placeholder), so this timeline
 * will never show them until those features land.
 */
export function CommunicationTimelineTab({ studentId }: { studentId: number }) {
  const { data: events, isLoading } = useCommunicationTimeline(studentId);

  if (isLoading) return <Loader />;

  if (!events || events.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No follow-up attempts or survey activity recorded for this student yet.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Timeline active={events.length} bulletSize={28} lineWidth={2}>
        {events.map((event) => {
          const IconComponent = EVENT_ICONS[event.eventType];
          return (
            <Timeline.Item
              key={event.id}
              bullet={
                <ThemeIcon color={EVENT_COLORS[event.eventType]} radius="xl" size={28}>
                  <IconComponent size={16} />
                </ThemeIcon>
              }
              title={COMMUNICATION_EVENT_TYPE_LABELS[event.eventType]}
            >
              <Text size="sm">{event.summaryText}</Text>
              <Text size="xs" c="dimmed" mt={2}>
                {new Date(event.occurredAt).toLocaleString()}
              </Text>
            </Timeline.Item>
          );
        })}
      </Timeline>
    </Stack>
  );
}
