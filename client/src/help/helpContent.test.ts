import { describe, expect, it } from "vitest";
import { CONTEXT_HELP_TARGETS } from "./HelpLink";
import {
  HELP_DOCS,
  HELP_GROUPS,
  getHelpDoc,
  helpTargetExists,
  loadHelpDocs,
  parseHelpDoc,
  searchHelp,
  slugifyHeading,
} from "./helpContent";

const file = (front: string, body = "Body text.") => `---\n${front}\n---\n${body}`;
const FRONT = "title: A\nslug: a\ngroup: Guides\norder: 1\nreviewed: 2026-09-24";

describe("parseHelpDoc", () => {
  it("reads the front matter and the headings", () => {
    const doc = parseHelpDoc(
      file(
        FRONT + "\npublic: true",
        "Intro\n\n## First\n\ntext\n\n### Sub *part*\n\n```\n## not a heading\n```\n",
      ),
      "a.md",
    );
    expect(doc).toMatchObject({
      slug: "a",
      title: "A",
      group: "Guides",
      order: 1,
      reviewed: "2026-09-24",
      isPublic: true,
    });
    expect(doc.headings).toEqual([
      { level: 2, text: "First", id: "first" },
      { level: 3, text: "Sub part", id: "sub-part" },
    ]);
  });

  it("names the file when front matter is missing or incomplete", () => {
    expect(() => parseHelpDoc("no front matter", "bad.md")).toThrow(/bad\.md.*no front matter/);
    expect(() => parseHelpDoc(file("title: A\nslug: a"), "bad.md")).toThrow(/bad\.md.*"group"/);
    expect(() => parseHelpDoc(file(FRONT.replace("2026-09-24", "yesterday")), "bad.md")).toThrow(
      /YYYY-MM-DD/,
    );
  });
});

describe("the real help content", () => {
  it("has every required section, and every file parses", () => {
    const slugs = HELP_DOCS.map((d) => d.slug);
    for (const required of [
      "about",
      "security",
      "qa",
      "getting-started",
      "follow-up",
      "program-health",
      "importing",
      "reports",
      "closeout",
      "administration",
    ]) {
      expect(slugs).toContain(required);
    }
    expect(new Set(slugs).size).toBe(slugs.length); // slugs are unique
    HELP_DOCS.forEach((d) => expect(HELP_GROUPS).toContain(d.group));
  });

  it("keeps heading ids unique within each document, so deep links are unambiguous", () => {
    for (const doc of HELP_DOCS) {
      const ids = doc.headings.map((h) => h.id);
      expect(new Set(ids).size, `duplicate heading id in ${doc.slug}`).toBe(ids.length);
    }
  });

  it("publishes About and Security before sign-in, and nothing else", () => {
    expect(
      HELP_DOCS.filter((d) => d.isPublic)
        .map((d) => d.slug)
        .sort(),
    ).toEqual(["about", "security"]);
  });

  it("every context help link points at real content", () => {
    for (const target of CONTEXT_HELP_TARGETS) {
      expect(
        helpTargetExists(target.slug, target.headingId),
        `${target.slug}#${target.headingId ?? ""}`,
      ).toBe(true);
    }
  });

  it("every internal link inside the content points at a real page", () => {
    for (const doc of HELP_DOCS) {
      for (const match of doc.body.matchAll(/\]\(\/help\/([a-z-]+)(?:#([a-z0-9-]+))?\)/g)) {
        expect(
          helpTargetExists(match[1]!, match[2]),
          `${doc.slug} links to /help/${match[1]}`,
        ).toBe(true);
      }
    }
  });

  it("the Security page states its limits, not only its protections", () => {
    const security = getHelpDoc("security")!;
    expect(security.headings.map((h) => h.text)).toEqual(
      expect.arrayContaining(["Known limits — what it does not do"]),
    );
  });

  it("orders documents by group then order", () => {
    const docs = loadHelpDocs({
      "b.md": file("title: B\nslug: b\ngroup: Q&A\norder: 1\nreviewed: 2026-01-01"),
      "c.md": file("title: C\nslug: c\ngroup: Guides\norder: 2\nreviewed: 2026-01-01"),
      "d.md": file("title: D\nslug: d\ngroup: Guides\norder: 1\nreviewed: 2026-01-01"),
    });
    expect(docs.map((d) => d.slug)).toEqual(["d", "c", "b"]);
  });
});

describe("slugifyHeading", () => {
  it("makes stable, URL-safe ids", () => {
    expect(slugifyHeading("Why did Finalize ask for a reason?")).toBe(
      "why-did-finalize-ask-for-a-reason",
    );
    expect(slugifyHeading("Q&A")).toBe("q-and-a");
  });
});

describe("searchHelp", () => {
  it("finds the section a word is about, ahead of passing mentions", () => {
    const results = searchHelp("finalize");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.heading?.text ?? results[0]!.doc.title).toMatch(/finalize/i);
  });

  it("requires every word, ignores case, and gives a readable snippet", () => {
    const results = searchHelp("OVERRIDE reason");
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => expect(r.snippet.length).toBeGreaterThan(0));
    expect(searchHelp("finalize zzzzunmatchable")).toEqual([]);
  });

  it("returns nothing for an empty or one-letter query", () => {
    expect(searchHelp("")).toEqual([]);
    expect(searchHelp("  ")).toEqual([]);
    expect(searchHelp("a")).toEqual([]);
  });

  it("finds the security page for questions about data protection", () => {
    expect(searchHelp("audit history").some((r) => r.doc.slug === "security")).toBe(true);
  });
});
