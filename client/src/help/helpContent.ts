/**
 * The Help content (docs/TODO.md's "Help, user guide and Q&A"): Markdown files
 * kept in the repository next to the code they describe, so a change to
 * behavior — especially anything in the Security page — is reviewed in the same
 * commit. They are bundled at build time; nothing is fetched.
 *
 * Each file opens with a small front-matter block:
 *
 *   ---
 *   title: Closing a reporting period
 *   slug: closeout
 *   group: Guides
 *   order: 6
 *   reviewed: 2026-09-24
 *   public: false
 *   ---
 */
const RAW_FILES = import.meta.glob("./content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface HelpHeading {
  level: 2 | 3;
  text: string;
  id: string;
}

export interface HelpDoc {
  slug: string;
  title: string;
  group: string;
  order: number;
  /** ISO date the text was last checked against the product. */
  reviewed: string;
  /** Also shown on the public About page (readable before signing in). */
  isPublic: boolean;
  body: string;
  headings: HelpHeading[];
}

/** The order the groups appear in the topic list. */
export const HELP_GROUPS = ["About", "Guides", "Security", "Q&A"];

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractHeadings(body: string): HelpHeading[] {
  const headings: HelpHeading[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const text = match[2]!.replace(/[*_`]/g, "");
      headings.push({ level: match[1]!.length as 2 | 3, text, id: slugifyHeading(text) });
    }
  }
  return headings;
}

/** Parses one Markdown file. Throws with the file name if required front matter is missing, so a bad file fails the build's tests, not a page load. */
export function parseHelpDoc(raw: string, fileName: string): HelpDoc {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`Help file ${fileName} has no front matter`);
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = /^(\w+):\s*(.*)$/.exec(line);
    if (pair) meta[pair[1]!] = pair[2]!.trim();
  }
  for (const key of ["title", "slug", "group", "order", "reviewed"]) {
    if (!meta[key])
      throw new Error(`Help file ${fileName} is missing "${key}" in its front matter`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.reviewed!)) {
    throw new Error(`Help file ${fileName}: "reviewed" must be a YYYY-MM-DD date`);
  }
  const body = match[2]!.replace(/\r\n/g, "\n").trim();
  return {
    slug: meta.slug!,
    title: meta.title!,
    group: meta.group!,
    order: Number(meta.order),
    reviewed: meta.reviewed!,
    isPublic: meta.public === "true",
    body,
    headings: extractHeadings(body),
  };
}

export function loadHelpDocs(files: Record<string, string> = RAW_FILES): HelpDoc[] {
  return Object.entries(files)
    .map(([name, raw]) => parseHelpDoc(raw, name))
    .sort(
      (a, b) => HELP_GROUPS.indexOf(a.group) - HELP_GROUPS.indexOf(b.group) || a.order - b.order,
    );
}

export const HELP_DOCS: HelpDoc[] = loadHelpDocs();

export function getHelpDoc(
  slug: string | undefined,
  docs: HelpDoc[] = HELP_DOCS,
): HelpDoc | undefined {
  return docs.find((d) => d.slug === slug);
}

/** True if a help link's slug (and optional heading id) points at real content. */
export function helpTargetExists(
  slug: string,
  headingId?: string,
  docs: HelpDoc[] = HELP_DOCS,
): boolean {
  const doc = getHelpDoc(slug, docs);
  if (!doc) return false;
  return !headingId || doc.headings.some((h) => h.id === headingId);
}

export interface HelpResult {
  doc: HelpDoc;
  /** The section the match is in (null = the document's opening text). */
  heading: HelpHeading | null;
  snippet: string;
  score: number;
}

interface Section {
  doc: HelpDoc;
  heading: HelpHeading | null;
  text: string;
}

function sectionsOf(doc: HelpDoc): Section[] {
  const sections: Section[] = [];
  let current: Section = { doc, heading: null, text: "" };
  let inFence = false;
  const headingByLine = new Map(doc.headings.map((h) => [h.text, h]));
  for (const line of doc.body.split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    const match = !inFence ? /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (match) {
      sections.push(current);
      current = {
        doc,
        heading: headingByLine.get(match[1]!.replace(/[*_`]/g, "")) ?? null,
        text: "",
      };
    } else {
      current.text += `${line}\n`;
    }
  }
  sections.push(current);
  return sections.filter((s) => s.heading || s.text.trim());
}

const stripMarkdown = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function snippetAround(text: string, terms: string[]): string {
  const plain = stripMarkdown(text);
  const lower = plain.toLowerCase();
  const at =
    terms
      .map((t) => lower.indexOf(t))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 50);
  const slice = plain.slice(start, start + 170);
  return `${start > 0 ? "…" : ""}${slice}${start + 170 < plain.length ? "…" : ""}`;
}

/**
 * Every search term has to appear somewhere in a section (AND, case-
 * insensitive). A term in the section's heading counts triple and one in the
 * document's title double, so "finalize" finds the Q&A entry and the guide
 * section named for it before passing mentions.
 */
export function searchHelp(query: string, docs: HelpDoc[] = HELP_DOCS, limit = 20): HelpResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  const results: HelpResult[] = [];
  for (const doc of docs) {
    for (const section of sectionsOf(doc)) {
      const headingText = (section.heading?.text ?? "").toLowerCase();
      const title = doc.title.toLowerCase();
      const body = section.text.toLowerCase();
      let score = 0;
      let allFound = true;
      for (const term of terms) {
        const inHeading = headingText.includes(term);
        const inTitle = title.includes(term);
        const occurrences = body.split(term).length - 1;
        if (!inHeading && !inTitle && occurrences === 0) {
          allFound = false;
          break;
        }
        score += (inHeading ? 3 : 0) + (inTitle ? 2 : 0) + Math.min(occurrences, 3);
      }
      if (allFound) {
        results.push({
          doc,
          heading: section.heading,
          snippet: snippetAround(section.text || headingText, terms),
          score,
        });
      }
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function helpPath(slug: string, headingId?: string): string {
  return `/help/${slug}${headingId ? `#${headingId}` : ""}`;
}
