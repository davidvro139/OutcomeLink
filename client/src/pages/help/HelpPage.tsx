import { Alert, Anchor, Box, Group, List, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { HelpMarkdown } from "../../help/HelpMarkdown";
import { HELP_DOCS, HELP_GROUPS, getHelpDoc, helpPath, searchHelp } from "../../help/helpContent";

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { dateStyle: "long" });
};

function TopicList({ activeSlug }: { activeSlug: string | undefined }) {
  return (
    <nav aria-label="Help topics">
      <Stack gap="md">
        {HELP_GROUPS.map((group) => {
          const docs = HELP_DOCS.filter((d) => d.group === group);
          if (docs.length === 0) return null;
          return (
            <div key={group}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>
                {group}
              </Text>
              <List listStyleType="none" spacing={2} m={0} p={0}>
                {docs.map((doc) => (
                  <List.Item key={doc.slug}>
                    <Anchor
                      component={Link}
                      to={helpPath(doc.slug)}
                      size="sm"
                      underline="always"
                      aria-current={doc.slug === activeSlug ? "page" : undefined}
                      fw={doc.slug === activeSlug ? 700 : 400}
                    >
                      {doc.title}
                    </Anchor>
                  </List.Item>
                ))}
              </List>
            </div>
          );
        })}
      </Stack>
    </nav>
  );
}

/** Help: the user guide, Q&A, About and Security text (docs/TODO.md), with search across all of it. */
export function HelpPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim().length > 1;

  // With no topic chosen, land on About — the "what is this tool" answer.
  const doc = getHelpDoc(slug ?? "about");

  // Jump to a deep-linked section once the article is on screen.
  useEffect(() => {
    if (!location.hash) {
      window.scrollTo?.({ top: 0 });
      return;
    }
    document.getElementById(location.hash.slice(1))?.scrollIntoView?.();
  }, [location.hash, slug]);

  return (
    <Stack p="xl" gap="lg">
      <Title order={1} size="h2">
        Help
      </Title>

      <Box maw={520}>
        <TextInput
          label="Search the help"
          placeholder="e.g. finalize, placement rate, import"
          leftSection={<IconSearch size={16} aria-hidden />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          type="search"
        />
        <Text size="sm" c="dimmed" mt={4} role="status" aria-live="polite">
          {searching
            ? `${results.length} result${results.length === 1 ? "" : "s"} for “${query.trim()}”`
            : ""}
        </Text>
      </Box>

      <Group align="flex-start" wrap="nowrap" gap="xl">
        <Box w={220} style={{ flexShrink: 0 }}>
          <TopicList activeSlug={doc?.slug} />
        </Box>

        <Box style={{ flex: 1, minWidth: 0 }} maw={820}>
          {searching ? (
            results.length === 0 ? (
              <Alert color="gray" title="No matches">
                Nothing in the help matches “{query.trim()}”. Try a shorter or different word.
              </Alert>
            ) : (
              <List listStyleType="none" spacing="md" m={0} p={0} aria-label="Search results">
                {results.map((r, i) => (
                  <List.Item key={`${r.doc.slug}-${r.heading?.id ?? "top"}-${i}`}>
                    <Anchor
                      component={Link}
                      to={helpPath(r.doc.slug, r.heading?.id)}
                      onClick={() => setQuery("")}
                      fw={600}
                      underline="always"
                    >
                      {r.heading ? r.heading.text : r.doc.title}
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {r.doc.group} · {r.doc.title}
                    </Text>
                    <Text size="sm">{r.snippet}</Text>
                  </List.Item>
                ))}
              </List>
            )
          ) : doc ? (
            <article aria-labelledby="help-article-title">
              <Title order={2} id="help-article-title">
                {doc.title}
              </Title>
              <Text size="xs" c="dimmed" mb="md">
                Last reviewed {formatDate(doc.reviewed)}
              </Text>
              <HelpMarkdown>{doc.body}</HelpMarkdown>
            </article>
          ) : (
            <Alert color="yellow" title="That help topic doesn't exist">
              Pick one from the list, or use the search.
            </Alert>
          )}
        </Box>
      </Group>
    </Stack>
  );
}
