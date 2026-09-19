import { NEWSLETTER } from "@/lib/config/rules";
import {
  arabicDigits,
  escapeHtml as esc,
  issueOrdinal,
  issueSlug,
  monthOf,
  safeUrl,
} from "./format";
import { sectionById, type SectionDef } from "./sections";
import {
  NEWSLETTER_ARCH,
  NEWSLETTER_BODY_SCRIPT,
  NEWSLETTER_CSS,
  NEWSLETTER_DIAMONDS,
  NEWSLETTER_HEAD_SCRIPT,
  NEWSLETTER_SPRITE,
} from "./theme.generated";
import type { NewsletterIssue, NewsletterItem } from "./types";

/**
 * Renders an issue as the same static page family as Issue #1: same
 * stylesheet, same icons, same card markup, same table-of-contents script.
 * The input is structured data; every string is escaped on the way out.
 */

export interface RenderOptions {
  /** "preview" adds a draft ribbon and nothing else. */
  mode: "publish" | "preview";
}

const icon = (id: string, fill = false) =>
  `<svg class="icon${fill ? " icon--fill" : ""}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;

const BRAND_BLOCK = `<p class="brand-name">إنـجـاز</p>
    <p class="brand-tagline" lang="en">COMMENDABLE&nbsp;&nbsp;SUCCESS</p>

    ${NEWSLETTER_DIAMONDS}`;

const WHY_LABEL = "لماذا يهمك؟";
const LEVEL_CLASS: Record<string, string> = {
  beginner: "level-1",
  intermediate: "level-2",
  advanced: "level-3",
};

function paragraphs(list: string[]): string {
  return list
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n            ");
}

function sourceLine(item: NewsletterItem): string {
  const { name, url, linkText } = item.source;
  const label = linkText.trim() || name.trim() || url;
  const lead =
    linkText.trim() && name.trim() ? `${esc(name.trim())} &nbsp;·&nbsp; ` : "";
  return `<p class="source">${icon("i-link")}<span>المصدر: ${lead}<a href="${safeUrl(url)}">${esc(label)}</a></span></p>`;
}

function whyBox(text: string): string {
  if (!text.trim()) return "";
  return `<div class="why" role="note">
            <p class="why-badge">${icon("i-diamond", true)}${WHY_LABEL}</p>
            <p class="why-text">${esc(text.trim())}</p>
          </div>`;
}

function fitLine(label: string, text: string): string {
  if (!text.trim()) return "";
  return `<p class="fit">${icon("i-users")}<span><span class="fit-label">${esc(label.trim())}</span> ${esc(text.trim())}</span></p>`;
}

function labelled(
  cls: "idea" | "example",
  label: string,
  text: string,
): string {
  if (!text.trim()) return "";
  const glyph = cls === "idea" ? icon("i-bulb") : icon("i-diamond", true);
  return `<div class="${cls}">
            <p class="label">${glyph}${esc(label.trim())}</p>
            <p>${esc(text.trim())}</p>
          </div>`;
}

function note(text: string): string {
  return text.trim() ? `<p class="note">${esc(text.trim())}</p>` : "";
}

function prerequisitesNote(list: string[]): string {
  const clean = list.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return `<p class="note"><strong>قبل أن تبدأ:</strong> ${esc(clean.join("، "))}</p>`;
}

function action(item: NewsletterItem, style: "primary" | "ghost"): string {
  const label = item.ctaLabel.trim();
  if (!label) return "";
  return `<div class="actions">
            <a class="btn btn-${style}" href="${safeUrl(item.source.url)}">${esc(label)}${icon("i-arrow")}</a>
          </div>`;
}

// ---------------------------------------------------------------------------
// Card families
// ---------------------------------------------------------------------------

function storyCard(
  item: NewsletterItem,
  index: number,
  numbered: boolean,
): string {
  const lead = numbered && index === 0;
  return `<article class="card story${lead ? " story--lead" : ""} reveal">
          ${numbered ? `<span class="card-num" aria-hidden="true">${arabicDigits(index + 1)}</span>` : ""}
          ${lead && item.kicker.trim() ? `<p class="kicker">${esc(item.kicker.trim())}</p>` : ""}
          <h3 class="story-title">${esc(item.title)}</h3>
          <div class="prose">
            ${paragraphs(item.paragraphs)}
          </div>
          ${whyBox(item.whyItMatters)}
          ${sourceLine(item)}
        </article>`;
}

function toolCard(item: NewsletterItem, def: SectionDef): string {
  const style = def.id === "new_tools" ? "primary" : "ghost";
  // Issue #1 answers "why should I care?" for tools in its "الفكرة" block.
  const idea = item.idea.trim() || item.whyItMatters.trim();
  return `<article class="card card--lift reveal">
          <div class="tool-head">
            <h3 class="tool-name">${esc(item.title)}</h3>
            ${item.chip.trim() ? `<p class="chip">${esc(item.chip.trim())}</p>` : ""}
          </div>
          <div class="tool-body">
            ${paragraphs(item.paragraphs)}
          </div>
          ${labelled("example", item.exampleLabel || def.defaults.exampleLabel, item.example)}
          ${note(item.note)}
          ${fitLine(item.fitLabel || def.defaults.fitLabel, item.fitText)}
          ${labelled("idea", item.ideaLabel || def.defaults.ideaLabel, idea)}
          ${action(item, style)}
        </article>`;
}

function learnCard(item: NewsletterItem, def: SectionDef): string {
  const levelClass = item.difficulty ? LEVEL_CLASS[item.difficulty] : undefined;
  const level =
    levelClass && item.levelLabel.trim()
      ? `<p class="level"><span class="level-meter" aria-hidden="true"><i></i><i></i><i></i></span>المستوى: ${esc(item.levelLabel.trim())}</p>`
      : "";
  // Issue #1 closes a lesson with a one-line "why this matters" note.
  const closingNote = item.note.trim() || item.whyItMatters.trim();
  return `<article class="card card--lift${levelClass ? ` card--level ${levelClass}` : ""} reveal">
          ${level}
          <h3 class="learn-title">${esc(item.title)}</h3>
          ${item.byline.trim() ? `<p class="byline">${esc(item.byline.trim())}</p>` : ""}
          <div class="tool-body">
            ${paragraphs(item.paragraphs)}
          </div>
          ${labelled("example", item.exampleLabel || def.defaults.exampleLabel, item.example)}
          ${note(closingNote)}
          ${prerequisitesNote(item.prerequisites)}
          ${fitLine(item.fitLabel || def.defaults.fitLabel, item.fitText)}
          ${action(item, "ghost")}
        </article>`;
}

function socialItem(item: NewsletterItem): string {
  const takeaway = (item.moral.trim() || item.whyItMatters.trim()).replace(
    /^المغزى\s*[:：]\s*/,
    "",
  );
  const platform = item.platform.trim() || item.source.name.trim() || "المصدر";
  return `<article class="social-item">
          <h3 class="social-title">${esc(item.title)}</h3>
          ${paragraphs(item.paragraphs)}
          ${takeaway ? `<p class="moral">المغزى: ${esc(takeaway)}</p>` : ""}
          <p><a class="text-link" href="${safeUrl(item.source.url)}">${esc(platform)}${icon("i-external")}</a></p>
        </article>`;
}

function sectionHtml(issue: NewsletterIssue, sectionIndex: number): string {
  const section = issue.sections[sectionIndex];
  const def = sectionById(section.id);
  const items = section.items;
  const titleId = `${def.anchor}-title`;

  let body: string;
  if (def.kind === "social") {
    body = `<div class="panel reveal">
        ${items.map(socialItem).join("\n\n        ")}
      </div>`;
  } else {
    const numbered = def.id === "top_news";
    const cards = items.map((item, i) =>
      def.kind === "story"
        ? storyCard(item, i, numbered)
        : def.kind === "tool"
          ? toolCard(item, def)
          : learnCard(item, def),
    );
    const headlines =
      numbered && items.length > 1
        ? `<div class="panel headlines-panel reveal">
        <ol class="headlines">
          ${items
            .map(
              (item, i) =>
                `<li><span class="headline-num">${arabicDigits(i + 1)}</span><span>${esc(item.headline.trim() || item.title)}</span></li>`,
            )
            .join("\n          ")}
        </ol>
      </div>

      `
        : "";
    body = `${headlines}<div class="stack">
        ${cards.join("\n\n        ")}
      </div>`;
  }

  return `<!-- ═══════════ ${def.title} ═══════════ -->
    <section class="section" id="${def.anchor}" aria-labelledby="${titleId}">
      <header class="section-head reveal">
        <span class="section-mark" aria-hidden="true"></span>
        <h2 class="section-title" id="${titleId}">${esc(def.title)}</h2>
      </header>

      ${body}
    </section>`;
}

// ---------------------------------------------------------------------------
// Page shells
// ---------------------------------------------------------------------------

function head(opts: {
  title: string;
  ogTitle: string;
  description: string;
  url: string;
}): string {
  const ogImage = `${NEWSLETTER.publicBaseUrl}/${NEWSLETTER.ogImage}`;
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>

<!-- ===== معاينة الرابط عند المشاركة (Open Graph) — نطاق GitHub Pages ===== -->
<meta property="og:type" content="article">
<meta property="og:site_name" content="إنجاز">
<meta property="og:locale" content="ar_SA">
<meta property="og:title" content="${esc(opts.ogTitle)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(opts.url)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:secure_url" content="${esc(ogImage)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="شعار إنجاز">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(opts.ogTitle)}">
<meta name="twitter:description" content="${esc(opts.description)}">
<meta name="twitter:image" content="${esc(ogImage)}">

<meta name="description" content="${esc(opts.description)}">
<meta name="theme-color" content="#155043">

<script>${NEWSLETTER_HEAD_SCRIPT}</script>

<style>${NEWSLETTER_CSS}</style>`;
}

const FOOTER_STRIP = `<div class="footer-strip">
    ${NEWSLETTER_DIAMONDS}
  </div>`;

/** The preview ribbon: built from the page's own tokens, never published. */
const PREVIEW_RIBBON = `<style>
  .draft-ribbon { position: fixed; z-index: 70; inset-block-end: 16px; inset-inline-start: 16px;
    padding-block: 6px; padding-inline: 14px; border-radius: 999px;
    background: var(--accent); color: var(--ink); font-size: 13px; font-weight: 700; line-height: 1.5; }
  @media print { .draft-ribbon { display: none; } }
</style>
<p class="draft-ribbon" role="status">مسودة — معاينة قبل النشر</p>`;

function stripTatweel(s: string): string {
  return s.replace(/ـ/g, "");
}

export function issueUrl(issueNumber: number): string {
  return `${NEWSLETTER.publicBaseUrl}/${issueSlug(issueNumber)}/index.html`;
}

/** Sections that actually have something in them, in newsletter order. */
function presentSections(issue: NewsletterIssue): number[] {
  return issue.sections
    .map((s, i) => (s.items.length > 0 ? i : -1))
    .filter((i) => i >= 0);
}

export function renderIssueHtml(
  issue: NewsletterIssue,
  options: RenderOptions = { mode: "publish" },
): string {
  const ordinal = issueOrdinal(issue.number);
  const month = monthOf(issue.cycleEnd);
  const description = stripTatweel(issue.closing).replace(/\s*\n\s*/g, " ").trim();
  const present = presentSections(issue);

  const toc = present
    .map((i) => {
      const def = sectionById(issue.sections[i].id);
      return `<li><a class="toc-link" href="#${def.anchor}">${esc(def.title)}</a></li>`;
    })
    .join("\n      ");

  const closingLines = issue.closing
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(esc)
    .join("<br>\n      ");

  return `${head({
    title: `${issue.title}، ${ordinal}`,
    ogTitle: `${stripTatweel(issue.title)}، ${ordinal}`,
    description,
    url: issueUrl(issue.number),
  })}
</head>

<body>
${NEWSLETTER_SPRITE}

<div class="progress" role="progressbar" aria-label="تقدّم القراءة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
  <div class="progress-bar"></div>
</div>

<!-- ═══════════ الرأس ═══════════ -->
<header class="hero on-dark">
  ${NEWSLETTER_ARCH}

  <div class="hero-inner">
    ${BRAND_BLOCK}

    <h1 class="hero-title">${esc(issue.title)}</h1>
    <p class="hero-meta">${ordinal} &nbsp;·&nbsp; <time datetime="${month.iso}">${month.label}</time></p>

    <p class="hero-lead">${esc(issue.lead)}</p>
  </div>
</header>

<div class="layout">

  <!-- ═══════════ فهرس المحتويات ═══════════ -->
  <nav class="toc" aria-label="فهرس المحتويات">
    <p class="toc-title">في هذا العدد</p>
    <button class="toc-toggle" type="button" aria-expanded="true" aria-controls="toc-list">
      <span class="toc-toggle-label">في هذا العدد</span>
      <span class="toc-current"></span>
      ${icon("i-chevron")}
    </button>
    <ol class="toc-list" id="toc-list">
      ${toc}
    </ol>
  </nav>

  <main class="main" id="content">
  <article>

    ${present.map((i) => sectionHtml(issue, i)).join("\n\n    ")}

  </article>
  </main>
</div>

<!-- ═══════════ إنجاز يقول لك ═══════════ -->
<section class="closing on-dark" aria-labelledby="closing-label">
  ${NEWSLETTER_ARCH}
  <div class="closing-inner reveal">
    <p class="closing-label" id="closing-label">إنجاز يقول لك</p>
    <p class="closing-text">${closingLines}</p>
  </div>
</section>

<!-- ═══════════ التذييل ═══════════ -->
<footer class="site-footer on-dark">
  ${FOOTER_STRIP}
  <div class="footer-inner">
    <p class="footer-brand">إنـجـاز</p>
    <p class="footer-tagline" lang="en">COMMENDABLE&nbsp;&nbsp;SUCCESS</p>
    <p class="footer-note">نشرة عن الذكاء الاصطناعي كل أسبوعين، ${ordinal}.</p>
    <p class="footer-links">
      <a href="#">إلغاء الاشتراك</a>
      &nbsp;·&nbsp;
      <a href="../index.html">الأعداد السابقة</a>
    </p>
  </div>
</footer>
${options.mode === "preview" ? PREVIEW_RIBBON : ""}
<script>${NEWSLETTER_BODY_SCRIPT}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

export interface ArchiveEntry {
  number: number;
  lead: string;
  monthLabel: string;
  href: string;
}

/** The archive only adds one layout rule: a single column with no TOC. */
const ARCHIVE_CSS = `<style>
  .layout.archive { display: block; max-inline-size: calc(var(--content) + 2 * var(--gutter)); }
</style>`;

export function renderArchiveHtml(entries: ArchiveEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.number - a.number);
  const cards = sorted
    .map(
      (e) => `<article class="card card--lift">
          <span class="card-num" aria-hidden="true">${arabicDigits(e.number)}</span>
          <p class="kicker">${issueOrdinal(e.number)} &nbsp;·&nbsp; ${esc(e.monthLabel)}</p>
          <h3 class="story-title">${esc(`نشرة الذكاء الاصطناعي، ${issueOrdinal(e.number)}`)}</h3>
          <div class="prose"><p>${esc(e.lead)}</p></div>
          <div class="actions">
            <a class="btn btn-primary" href="${esc(e.href)}">اقرأ العدد${icon("i-arrow")}</a>
          </div>
        </article>`,
    )
    .join("\n\n        ");

  return `${head({
    title: "نـشـرة الـذكـاء الاصـطـنـاعـي، كل الأعداد",
    ogTitle: "نشرة الذكاء الاصطناعي، كل الأعداد",
    description: "كل أعداد نشرة الذكاء الاصطناعي من إنجاز.",
    url: `${NEWSLETTER.publicBaseUrl}/index.html`,
  })}
${ARCHIVE_CSS}
</head>

<body>
${NEWSLETTER_SPRITE}

<header class="hero on-dark">
  ${NEWSLETTER_ARCH}
  <div class="hero-inner">
    ${BRAND_BLOCK}

    <h1 class="hero-title">نـشـرة الـذكـاء الاصـطـنـاعـي</h1>
    <p class="hero-meta">كل الأعداد</p>

    <p class="hero-lead">لا نخبرك بكل ما حدث في الذكاء الاصطناعي، بل نختصر لك ما يستحق معرفته وما يمكنك استخدامه.</p>
  </div>
</header>

<div class="layout archive">
  <main class="main" id="content">
    <section class="section" aria-labelledby="issues-title">
      <header class="section-head">
        <span class="section-mark" aria-hidden="true"></span>
        <h2 class="section-title" id="issues-title">الأعداد</h2>
      </header>

      <div class="stack">
        ${cards}
      </div>
    </section>
  </main>
</div>

<footer class="site-footer on-dark">
  ${FOOTER_STRIP}
  <div class="footer-inner">
    <p class="footer-brand">إنـجـاز</p>
    <p class="footer-tagline" lang="en">COMMENDABLE&nbsp;&nbsp;SUCCESS</p>
    <p class="footer-note">نشرة عن الذكاء الاصطناعي كل أسبوعين.</p>
  </div>
</footer>
</body>
</html>
`;
}
