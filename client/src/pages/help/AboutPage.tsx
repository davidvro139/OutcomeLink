import { Anchor, Container, Paper, Stack, Text, Title } from "@mantine/core";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { HelpMarkdown } from "../../help/HelpMarkdown";
import { HELP_DOCS } from "../../help/helpContent";

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { dateStyle: "long" });
};

/**
 * What OutcomeLink is for and how it protects data — readable before signing
 * in, because an auditor, a prospective user or someone deciding whether to
 * trust the tool with student records wants that first. Shows only the
 * documents marked `public: true`.
 */
export function AboutPage() {
  const docs = HELP_DOCS.filter((d) => d.isPublic);
  useEffect(() => {
    document.title = "About OutcomeLink";
  }, []);

  return (
    <Container size="md" py="xl">
      <main>
        <Stack gap="xl">
          <div>
            <Title order={1}>About OutcomeLink</Title>
            <Anchor component={Link} to="/login" size="sm">
              Back to sign in
            </Anchor>
          </div>
          {docs.map((doc) => (
            <Paper
              key={doc.slug}
              withBorder
              p="lg"
              radius="md"
              component="section"
              aria-labelledby={`about-${doc.slug}`}
            >
              <Title order={2} id={`about-${doc.slug}`}>
                {doc.title}
              </Title>
              <Text size="xs" c="dimmed" mb="md">
                Last reviewed {formatDate(doc.reviewed)}
              </Text>
              <HelpMarkdown>{doc.body}</HelpMarkdown>
            </Paper>
          ))}
        </Stack>
      </main>
    </Container>
  );
}
