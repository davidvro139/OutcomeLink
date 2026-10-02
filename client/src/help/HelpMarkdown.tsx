import { Stack, Text, TypographyStylesProvider } from "@mantine/core";

/**
 * Renders a Help document. Temporarily disabled markdown rendering due to
 * module resolution issues. Will display as plain text with line breaks.
 * TODO: Fix react-markdown/remark-gfm module resolution and restore.
 */
export function HelpMarkdown({ children }: { children: string }) {
  return (
    <TypographyStylesProvider>
      <Stack gap="md">
        {children.split('\n\n').map((para, i) => (
          <Text key={i} style={{ whiteSpace: 'pre-wrap' }}>
            {para}
          </Text>
        ))}
      </Stack>
    </TypographyStylesProvider>
  );
}
