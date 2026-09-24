import { Anchor, Table, Title, TypographyStylesProvider } from "@mantine/core";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Link } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { slugifyHeading } from "./helpContent";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

const components: Components = {
  // Content headings start at ## — the page supplies the one <h1> — and get ids so a section can be linked to.
  h2: ({ children }) => (
    <Title order={2} size="h3" id={slugifyHeading(textOf(children))} mt="xl" mb="xs">
      {children}
    </Title>
  ),
  h3: ({ children }) => (
    <Title order={3} size="h4" id={slugifyHeading(textOf(children))} mt="lg" mb="xs">
      {children}
    </Title>
  ),
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Anchor component={Link} to={href} style={{ textDecoration: "underline" }}>
        {children}
      </Anchor>
    ) : (
      <Anchor
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        style={{ textDecoration: "underline" }}
      >
        {children}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </Anchor>
    ),
  table: ({ children }) => (
    <Table.ScrollContainer minWidth={420}>
      <Table withTableBorder striped>
        {children}
      </Table>
    </Table.ScrollContainer>
  ),
};

/**
 * Renders a Help document. react-markdown does not render raw HTML, so content
 * in the repository can't inject markup; tables (GitHub-style) are supported.
 */
export function HelpMarkdown({ children }: { children: string }) {
  return (
    <TypographyStylesProvider>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </TypographyStylesProvider>
  );
}
