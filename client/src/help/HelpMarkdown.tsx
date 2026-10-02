import { Anchor, Stack, Table, Text, Title, TypographyStylesProvider } from "@mantine/core";
import type { ReactNode } from "react";
// import ReactMarkdown, { type Components } from "react-markdown";
import { Link } from "react-router-dom";
// import remarkGfm from "remark-gfm";
import { slugifyHeading } from "./helpContent";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

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
