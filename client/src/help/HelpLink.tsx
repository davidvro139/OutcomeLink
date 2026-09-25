import { Anchor, Group } from "@mantine/core";
import { IconHelp } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { helpPath } from "./helpContent";

/**
 * A small "Help with this page" link that opens the matching guide section.
 * The (slug, headingId) target is checked against the real content by a unit
 * test, so a renamed heading can't leave a dead link behind.
 */
export function HelpLink({
  slug,
  headingId,
  label = "Help with this page",
}: {
  slug: string;
  headingId?: string;
  label?: string;
}) {
  return (
    <Anchor component={Link} to={helpPath(slug, headingId)} size="sm">
      <Group gap={4} wrap="nowrap" component="span" style={{ display: "inline-flex" }}>
        <IconHelp size={16} aria-hidden />
        {label}
      </Group>
    </Anchor>
  );
}

/** Every context help link the app renders, so the tests can verify each target exists. */
export const CONTEXT_HELP_TARGETS: { slug: string; headingId?: string }[] = [
  { slug: "program-health" },
  { slug: "closeout" },
  { slug: "importing" },
  { slug: "administration" },
  { slug: "reports" },
];
