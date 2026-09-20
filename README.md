# 🎯 Rased — رصد

The internal contribution and knowledge system of the Enjaz Club AI Team.

A member finds something useful in AI — a model release, a tool, a paper, a
technique — pastes the link and says why it matters. Rasad reads the source,
checks the claim, works out when it was *actually* published, decides whether
someone already submitted it, classifies it into the newsletter's six sections,
and awards the member **one point** if the contribution is valid.

This is an **MVP prototype**, not a production system.

---

## The one rule everything else follows

**A contribution point and an editorial score are different things.**

| | Contribution point | Editorial score |
|---|---|---|
| Who it is about | the member | the content |
| Range | 0 or 1 | 0–100 |
| Depends on importance? | **never** | yes |
| Used for | the leaderboard | ordering the newsletter |

A major frontier-model announcement and a beginner's learning resource are both
worth exactly **+1** if both are valid. The first may be worth far more to the
newsletter, and that shows up in the editorial score — never in someone's
standing. Rasad is not here to decide who the better team member is.

The points engine (`src/lib/services/points.ts`) reads three things and nothing
else: is the contribution valid, is it a duplicate, and how many points does the
member already hold this cycle. It cannot see the category, the source or the
editorial score.

---

## How a submission is judged

**1. The acceptance floor.** A contribution earns its point when all of these
hold: it is about AI or the team's scope; it carries a specific, understandable
piece of information; the URL is usable; the content can be understood from the
source; the member explained why it matters; it offers some real knowledge; and
it is not a substantial duplicate.

Nothing is rejected for being *less important*, from a smaller company,
beginner-level, or in a less prestigious category.

**2. Duplicates — three outcomes.**

| Outcome | Meaning | Point |
|---|---|---|
| `unique` | nothing earlier covers it | +1 |
| `same_topic_new_value` | related to an earlier find, but this member adds a test, comparison or use case | +1 |
| `duplicate` | substantially the same, nothing new | 0, still stored |

"OpenAI released Model X" and "I tested Model X on my project and compared it
with Y" are two contributions, not one.

**3. Points and the cycle cap.** Each valid contribution is +1, up to **3 points
per newsletter cycle** (two weeks). Past the cap, submissions are still
evaluated, classified and kept for the newsletter — they just stop moving the
board. That cap is the anti-spam mechanism; nothing else blocks submitting.

**4. Classification.** Every accepted contribution gets a primary newsletter
category and any secondary ones, plus the audiences it serves and — for
learning material — a difficulty and prerequisites. The member never picks any
of this.

| Category | What belongs in it |
|---|---|
| `important_news` | AI news the team should know about |
| `new_models` | a newly released or updated model |
| `new_tools` | a genuinely new tool or product |
| `other_tools` | a useful tool that is not new |
| `learn_this_week` | tutorials, courses, papers, explainers |
| `social_trends` | what the AI community is discussing |

A member may pick **one research direction** under the composer. It is a hint
about where to look, never a restriction and never the final category.

**5. Verification, honestly.** The member is responsible for checking the source
first. Rasad reports exactly what it could confirm: `verified`,
`partially_verified`, or `not_independently_verified`. It never claims a check
it did not perform. A page that blocks our reader (403, and its kin 401, 406,
429 and 451) is not the same as a dead link (404). The dead link is rejected.
The blocked page is not evaluated at all: it is stored as `blocked_source` and
waits in the host area for a person to open the link and decide. We do not try
to get past a source's bot protection.

**6. The member's words are kept.** `memberReason` is stored verbatim and never
overwritten. The evaluator's reading of it is stored separately as
`aiInterpretation`.

**7. Nothing is ever lost.** If the evaluator cannot be reached, the submission
is stored as `pending` with the error attached, earns nothing, and can be
retried from the result page or the host area. The point is awarded when the
evaluation eventually succeeds.

---

## The home page is one box

Opening the app shows a single composer: paste a link, say why it matters,
send.

- **No title to write.** The pasted link is read server-side and named by an LLM
  call (`/api/title`), and the result appears as an editable card under the
  input. Click the title to change it.
- **No category to pick.** Rasad classifies the content itself.
- **One field the member writes:** "لماذا ترى أن هذا مهم؟". It is required — it
  is part of the contribution, not an optional extra.
- **Everything else is a click away, not in the way.** The dashboard,
  leaderboard, feed, profiles and host area live on their own pages.

Old `/submit` links redirect to the composer — there is one way in.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # already done if you're picking this up as-is
npx netlify dev                # http://localhost:8888
```

The database is Netlify Blobs, so run it through the Netlify CLI — `npm run
dev` starts Next.js but has no blobs store to talk to.

The team is seeded automatically on first run. The AI team has nine members;
the default seed is the six names the app shipped with, so add the rest from
`/admin` — or set `RASED_TEAM` to a comma-separated roster before the first run
and they are all created for you. Pick your name and start hunting.

### Turning on real AI evaluation

The app runs **without any keys** using a built-in heuristic evaluator, so you
can test the whole flow immediately. For real verification and judgement, add an
Anthropic key to `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

That switches on Claude with the server-side `web_search` and `web_fetch` tools:
it actually goes and reads the source, finds the original announcement, checks
the release date, reasons about duplicates, classifies the content and extracts
the key points. Each result page tells you which engine judged it.

Without a key, the offline evaluator runs the same pipeline from page metadata
and keyword signals. It never reports anything as `verified`, because it has not
verified anything. With a key configured, a failed API call does **not** fall
back to the heuristic — the submission is stored `pending` and waits for a
retry, so a point is never awarded on an evaluation that did not happen.

---

## Test the main flow in 2 minutes

1. Pick **Nawal** under the composer.
2. Paste an official AI model announcement. The title and summary fill
   themselves in a moment later.
3. Write why it matters — a specific sentence is enough — and press **أرسل**.
4. You land on the result page: **+1**, the newsletter category it was filed
   under, the status, and one line saying why. Below that: your own words, the
   classification, what was extracted from the source, the verification, the
   duplicate check, and — clearly separated — the editorial score.
5. Switch to **Abdullah** and submit the same link. It comes back **مكررة** with
   **0** points and a link to Nawal's original.
6. Submit a related link as **Reem** with a real tested angle ("جربت… وقارنت…").
   It comes back **مقبولة بزاوية جديدة** with a full **+1**.
7. Submit two more as Nawal, then a fourth. The fourth is still accepted,
   classified and stored — with **0** points and "بلغت الحد الأقصى".
8. Check the **leaderboard**: points only, capped at 3, with past cycles kept.

---

## Scoring

### Member points — what the leaderboard is made of

| Rule | Value |
|---|---|
| A valid, non-duplicate contribution | **+1** |
| Maximum per member per cycle | **3** |
| Cycle length | **14 days**, from a fixed Monday anchor |
| A duplicate | 0 (still stored, still available to the newsletter) |
| A rejected submission | 0 |
| A pending one | 0 until the evaluation succeeds |
| One whose source blocks automated reads (`blocked_source`) | 0 until a host decides |

Points are decided in `src/lib/services/points.ts` and awarded inside the same
locked write as the save, so two submissions evaluated concurrently cannot both
slip past the cap.

### Editorial score — what the newsletter is ordered by

A separate 0–100, weighted across eight dimensions and configurable in
`src/lib/config/rules.ts`:

| Dimension | Weight |
|---|---|
| Significance | 18 |
| Practical usefulness | 16 |
| Recency (from the **original** publication date) | 14 |
| AI relevance | 12 |
| Source credibility | 12 |
| Audience fit | 10 |
| Uniqueness | 10 |
| Newsletter value | 8 |

Two deterministic multipliers follow: a duplicate keeps 40% of its editorial
value and a new angle 85%; an unverified source keeps 75%, a partially verified
one 90%. The evaluator supplies 0–10 judgements per dimension and nothing else —
the scaling, the recency band and the multipliers are computed in
`src/lib/services/editorial.ts`, so the same inputs always give the same number.

**This score never touches member points.**

### Anti-spam

The cycle cap is the whole mechanism. Submit as much as you like: past three
points everything is still read, classified and kept for the newsletter, it
simply stops moving the board.

### Changing the rules

All tunable numbers live in one file: **`src/lib/config/rules.ts`** — the point
value and cap, the cycle length and anchor, the editorial weights and
multipliers, the recency bands, the duplicate thresholds, the acceptance floor,
and the trusted/reputable/social domain lists. Edit, restart, done.

---

## The newsletter engine

Every two weeks the cycle's contributions become an issue of the team's
newsletter — the same newsletter as
[Issue&nbsp;#1](https://turki-aldaajani.github.io/Rased/newsletter/01/index.html),
in the same design, and never published without a human approving it.

```
contributions → selection → AI draft → fact check → human review → publish
```

**1. Selection (`lib/newsletter/select.ts`).** Rules only, no model. It takes
the cycle's accepted contributions, drops repeated URLs, ignores anything below
the editorial floor, fills each of the six sections from its own category
strongest-first, keeps one event to one item, prefers a second company over a
second item from the same one, and lets an empty section borrow an overflow
item that genuinely belongs to it through a secondary category. Every dropped
contribution is kept with the reason it was dropped.

This module cannot see member points — it imports the editorial score and
nothing else. What a member earns and what gets published are decided
separately, on purpose.

**2. Writing (`lib/newsletter/generate.ts`).** Each section is written in one
call that returns **JSON, never HTML**, and only ever prose: links, contributors,
audiences, difficulty and scores come from the contribution and the model cannot
change them. The prompt gives it the source data and one rule above all — write
only what that data supports, and list anything it could not support instead of
guessing. A name it invents for an author or a platform is dropped unless the
source text contains it.

With no API key, or when a call fails, the item is assembled directly from the
contribution's own stored fields. Nothing is invented that way either; it just
reads roughly, so every such item carries a review flag.

**3. Fact check (`lib/newsletter/validate.ts`).** Mechanical checks against the
contribution: every number in the written text must appear in the source data
(this is what catches invented benchmarks, prices and dates), the link must be
one the evaluation knows, a "new" tool or model older than 90 days is flagged, an
unverified source is flagged, and so is a missing "why it matters". Flags do not
block editing — but a draft with open warnings cannot be published until an
editor says they have read them.

**4. Review (`/admin/newsletter`).** The cycle dashboard shows how many
contributions there are, how the six sections are covered, what was selected,
what was left out and why, and who contributed. From a draft an editor can edit
any text, reorder items, move an item to another section, remove it, add one
back from the cycle, regenerate a single item, a section or the whole draft, fix
links, preview the real page, and publish.

**5. Publishing (`lib/newsletter/publish.ts`).** The public newsletter is GitHub
Pages serving `main:/docs`, so publishing writes `docs/newsletter/NN/index.html`
— through the GitHub API when deployed (`NEWSLETTER_GITHUB_TOKEN`), or straight
into the checkout in development. The archive page at `docs/newsletter/index.html`
is regenerated with it.

**Issues are immutable.** A folder that already exists is never overwritten
unless this system published it and an editor explicitly asks to re-publish;
Issue #1's own folder is reserved and cannot be written at all. A published
issue cannot be regenerated or deleted, and editing one takes a deliberate
confirmation.

### The design is Issue #1's, not a new one

`npm run newsletter:theme` extracts the stylesheet, SVG icons, hero, table of
contents and reading-progress script out of `docs/newsletter/01/index.html` into
`lib/newsletter/theme.generated.ts`. The renderer builds the same four card
families Issue #1 uses — story, tool, learn, social — so a generated issue uses
only classes Issue #1 already defines. Issue #1's own file is read, never
written.

Sections keep their names and anchors from Issue #1 (`أهم الأخبار` / `#top-news`,
`جديد النماذج` / `#models`, …), and `lib/newsletter/sections.ts` is the single
place they are defined — the app's own category labels read from it, so the two
can never drift.

A section with nothing in it is left out of the issue and its table of contents
rather than filled. Nothing is invented to fill a section.

---

## Admin / host area

`/admin`, unlocked with `ADMIN_PASSCODE` from `.env.local` (default `rased`).

- Add, rename, remove and restore team members
- See every submission, including removed and rejected ones
- Change the status, the points, the newsletter category and the duplicate call
- See exactly which earlier submissions a duplicate was compared against
- Retry an evaluation that failed
- Remove or restore a submission, or reset it back to Rasad's own verdict
- Build, review and publish the newsletter at `/admin/newsletter`

Every correction carries a public note. Automatic evaluation is the default and
none of it is irreversible — the host has the final word on all of it.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Turns on AI evaluation. Empty = offline heuristic mode. |
| `RASED_MODEL` | `claude-opus-5` | Model used for verification + evaluation |
| `RASED_TITLE_MODEL` | `claude-opus-5` | Model that names a pasted link (short, `effort: low` call) |
| `RASED_EFFORT` | `medium` | `low` … `max` — how hard the model works |
| `WEB_SEARCH_PROVIDER` | `anthropic` | `anthropic` \| `tavily` \| `brave` \| `serper` \| `none` |
| `TAVILY_API_KEY` / `BRAVE_API_KEY` / `SERPER_API_KEY` | *(empty)* | Only for the matching provider |
| `ADMIN_PASSCODE` | `rased` | Unlocks `/admin` |
| `RASED_TEAM` | *(empty)* | Comma-separated roster used to seed the team on first run |
| `RASED_NEWSLETTER_EFFORT` | *(RASED_EFFORT)* | Effort for newsletter writing only |
| `NEWSLETTER_PUBLISH_TARGET` | *(auto)* | `github` \| `filesystem`. Defaults to `github` when a token is set, `filesystem` in development |
| `NEWSLETTER_GITHUB_TOKEN` | *(empty)* | Token with content write access — required to publish from the deployed app |
| `NEWSLETTER_GITHUB_REPO` | `Turki-Aldaajani/Rased` | Repository that GitHub Pages serves |
| `NEWSLETTER_GITHUB_BRANCH` | `main` | Branch to commit published issues to |
| `NEWSLETTER_GITHUB_DIR` | `docs/newsletter` | Directory Pages publishes from |
| `NEWSLETTER_PUBLISH_DIR` | `docs/newsletter` | Where the `filesystem` target writes |

`anthropic` is the recommended search provider: search runs inside the model
call via Claude's server-side `web_search` / `web_fetch` tools, so there is no
second API key to manage. The other providers run as a separate search request
whose results are handed to the model.

**All keys are server-side only.** Nothing touches the browser.

---

## Architecture

```
src/
  app/
    page.tsx                 The composer — the whole home page
    dashboard/               Cycle standings, your stats, newsletter buckets
    submit/                  Redirects to the composer (legacy links)
    result/[id]/             What happened to one contribution
    leaderboard/             Cycle board + every past cycle
    feed/                    Everything, grouped by cycle
    profile/[id]/            Member profile + cycle-by-cycle record
    admin/                   Host area
    admin/newsletter/        Cycle dashboard, drafts, the editor
    api/
      title/                 ← names a pasted link (auto title + summary)
      contributions/         Submit + list
      contributions/[id]/    Read + admin correction
      contributions/[id]/retry   Re-run a failed evaluation
      newsletters/           List issues + generate a draft
      newsletters/overview/  Cycle stats and the selection plan
      newsletters/[id]/      Read, save, delete a draft
      newsletters/[id]/{regenerate,items,preview,publish}/
      members/ summary/ admin/auth/
  lib/
    config/rules.ts          ← every tunable rule, points and editorial both
    db/
      schema.ts              Types + the effective-value accessors
      store.ts               ← swap this file to move off Blobs to Postgres
    services/
      fetch-source.ts        Opens the URL, extracts title/description/date
      title.ts               ← auto-naming: LLM call + metadata fallback
      web-search.ts          Pluggable search providers
      duplicates.ts          Local similarity pass over earlier submissions
      prompt.ts              System prompt + structured-output tool schema
      evaluate.ts            AI evaluation + offline heuristic, and the
                             deterministic status derivation
      points.ts              ← member points. Flat, capped, category-blind
      editorial.ts           ← editorial value. Never touches points
      leaderboard.ts         Cycle standings + historical cycles
      submit.ts              The submission pipeline, shared with retry
      admin.ts               Passcode gate
    newsletter/
      sections.ts            ← the six sections, named as Issue #1 names them
      select.ts              Steps 1–5: what makes the issue, and where
      generate.ts            Step 6: the model writes JSON, never HTML
      validate.ts            Step 7: every number checked against the source
      render.ts              Step 8: Issue #1's markup, from structured data
      service.ts             Draft, regenerate, edit, preview, publish
      publish.ts             GitHub Pages / local filesystem targets
      theme.generated.ts     ← extracted from Issue #1 (npm run newsletter:theme)
      compose.ts  format.ts  legacy.ts  types.ts  http.ts
  components/
    Composer.tsx             ← the one input the app is built around
    RetryEvaluation.tsx      Retry button for a pending submission
    contribution.tsx         Category/status/points presentation
    admin/                   Passcode gate + session hook
    QuietNav.tsx  Header.tsx  CurrentUser.tsx  YourStats.tsx
scripts/
  sync-newsletter-theme.mjs  Issue #1's CSS/icons/script → theme.generated.ts
docs/newsletter/             What GitHub Pages serves (01/ is hand-written)
```

The layers are deliberately separate: swapping the database means rewriting
`db/store.ts` only; changing the rules means editing `config/rules.ts` only;
changing the evaluator means touching `services/evaluate.ts` only. And the two
currencies never meet: `points.ts` does not import anything from `editorial.ts`.

Records written by the previous version (a single 0–100 score used as the
member's points) are migrated on read: that number becomes the editorial score,
and points are recomputed under the flat rule with the cycle cap applied in
chronological order.

### How a link gets named

`POST /api/title` → `services/title.ts`: the page is fetched server-side, and its
metadata (title, description, date, text excerpt) goes to Claude with
`output_config: { effort: "low", format: { type: "json_schema", … } }`, which
returns `{ title, summary }` as validated JSON. With no key — or on any error,
bad JSON, or refusal — it falls back to the page's own `og:title`, then to the
URL slug. The composer never blocks on it: whatever the member does not have
when they submit, `/api/contributions` names for them.

### How an evaluation actually runs

1. `fetch-source.ts` opens the submitted URL server-side and pulls the page
   title, description, publication date (meta tags / JSON-LD / `<time>`) and a
   text excerpt.
2. `duplicates.ts` finds earlier submissions covering the same thing, by
   normalised URL and token similarity, and keeps the full comparison list.
3. `evaluate.ts` sends all of that to Claude with the rubric. Claude researches
   with `web_search` / `web_fetch` and returns, through a strict tool schema:
   the six eligibility flags, the duplicate outcome and confidence, the
   categories, the audiences, the difficulty, the extracted facts, its reading
   of the member's reason, and eight 0–10 editorial judgements.
4. The server derives the **status** from the eligibility flags and the
   duplicate outcome, recomputes recency from the resolved original date, and
   scales the editorial score.
5. `store.ts` saves the row and awards the point in one locked write, after
   re-checking for a same-source collision and re-reading the member's cycle
   total.

With no key, step 3 runs the offline heuristic instead — domain reputation,
keyword signals, date extraction, local similarity — and never claims to have
verified anything. With a key present, a failed call skips steps 4–5 and stores
the submission as `pending` for retry.

---

## Reset the data

The store is Netlify Blobs (`src/lib/db/store.ts`), so local development runs
through the Netlify CLI, which provides a blobs sandbox:

```bash
npx netlify dev        # http://localhost:8888
```

Deleting `.netlify/blobs-serve/` resets the local database; the members are
re-seeded on the next request.

---

## Visual identity

**Dark only.** There is no light theme, no toggle and no theme provider — one
palette, defined once at `:root` in `src/app/globals.css`. The built CSS
contains zero `prefers-color-scheme` blocks and zero `data-theme` rules.

Neutral first: background, text and borders carry the whole interface. The
green appears only where the eye should land — the primary button, focus
rings, progress fills, the light on the 3D panel. State colours are used only
when something is actually in that state, and never larger than a 6px dot.

| Role | Value |
|---|---|
| Background | `#131C18` |
| Deep surface (3D panel) | `#0B100D` |
| Surface (card) | `#18231E` |
| Text | `#F1EFE6` |
| Muted text | `#9A968A` |
| Borders | `#26332C` |
| Primary | `#2E7D69` (identity green `#155043` kept as `--brand-deep` for lighting) |
| Interactive / focus ring | `#125D64`, brightened to `#4F9AA1` for text on dark |
| Accent (rare) | `#A4B02C` |

States: success `#4FB972` · warning `#F3C43C` · error `#FF6B5C` · info
`#5CB6F0` · highlight `#F25C9C`.

Rules the interface holds to:

- **No CSS gradients, no glows, no shadows.** Hierarchy comes from whitespace,
  weight and border contrast. The single radial gradient in the app is the
  spotlight on the 3D card, and it is painted in the identity green.
- **No emoji.** Every icon is a [lucide](https://lucide.dev) line icon at one
  neutral colour (`text-muted-foreground`), sized 14–16px.
- 4–8px radii (`--radius: 6px`), 200ms transitions, all of it collapsing under
  `prefers-reduced-motion`.

Components are [shadcn/ui](https://ui.shadcn.com) primitives in
`src/components/ui/` (Button, Card, Input, Textarea, Badge, Label, Separator),
styled from the CSS variables in `src/app/globals.css` — re-theming is that one
file, and `npx shadcn@latest add <component>` works against `components.json`.

### The 3D panel

One interactive [Spline](https://spline.design) scene sits below the composer
on the home page, and nowhere else in the app.

- `ui/splite.tsx` — `React.lazy` + `Suspense`, so the ~1.3 MB runtime is its
  own chunk and never blocks the composer.
- `HeroScene.tsx` — mounts that chunk only once the card scrolls within 200px
  of the viewport, so the home page loads without touching it at all.
- `ui/spotlight.tsx` — a `framer-motion` light that follows the cursor inside
  the card, painted with `--interactive` / `--brand-deep` instead of the usual
  white so it reads as part of this interface.

The scene URL is a prop on `HeroScene`; swap it for your own Spline scene
without touching anything else. `next.config.ts` marks the Spline runtime's
Draco decoder paths as webpack externals — that package references CDN assets
it does not ship, which otherwise fails the build.

The type stack is `"Thmanyah", "IBM Plex Sans Arabic", …` — if the Thmanyah
brand font is installed locally it is used automatically, otherwise IBM Plex
Sans Arabic loads as a close fallback that covers both Arabic and Latin.

The interface is Arabic and right-to-left (`dir="rtl"` on `<html>` in
`src/app/layout.tsx`). All copy lives in the page components, and the Arabic
count-agreement helpers are in `src/lib/util/ar.ts` — use them rather than
interpolating a bare number next to a noun.
