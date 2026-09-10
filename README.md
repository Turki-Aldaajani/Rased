# 🎯 Rased

An internal, gamified knowledge-sharing game for an AI team.

A team member finds something useful in AI — a model release, a tool, a paper, a
technique — and pastes the link. The system names it, opens the source, verifies
the claim on the web, works out when it was *actually* published, checks whether
someone already submitted it, scores it out of 100, and updates the leaderboard.

This is an **MVP prototype**, not a production system.

---

## The home page is one box

Opening the app shows a single composer: paste a link, press Enter. Nothing
else competes for attention on first sight.

- **No title to write.** The pasted link is read server-side and named by an LLM
  call (`/api/title`) — headline, contribution type and a one-line summary — and
  the result appears as an editable card under the input. Click the title to
  change it, or the type pill to re-classify it.
- **Your take is optional and folded away.** "Add your take" opens the one field
  that earns personal points; skipping it costs those points, not the submission.
- **Everything else is a click away, not in the way.** The dashboard, leaderboard,
  feed, profiles and host area live on their own pages, reachable from the quiet
  row below the composer and from the header on every page except the home page.

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

The team (Nawal, Abdullah, Reem, Abdulaziz, Mukhtar, Yara) is seeded
automatically on first run. Pick your name and start hunting.

### Turning on real AI evaluation

The app runs **without any keys** using a built-in heuristic evaluator, so you
can test the whole flow immediately. For real verification and judgement, add an
Anthropic key to `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

That switches on Claude with the server-side `web_search` and `web_fetch` tools:
it actually goes and reads the source, finds the original announcement, checks
the release date, and reasons about duplicates. Each result page tells you which
engine scored it.

---

## Test the main flow in 2 minutes

1. Pick **Nawal** under the composer.
2. Paste a genuinely new AI model release (the official announcement page). The
   title, type and summary fill themselves in a moment later.
3. Open **Add your take** and write something specific, then press the ↑ button.
4. You land on the result page: verification status, original publication date,
   duplicate status, the six-part score breakdown, and a plain-language
   explanation.
5. Switch to **Abdullah** and submit the same news. It comes back marked
   **Duplicate** with a fraction of the points and a link to Nawal's original.
6. Submit it a third time as **Reem** but add real extra value ("I tested it on
   X and it did Y") — that scores **Partially duplicate** instead, with partial
   credit.
7. Check the **Leaderboard**: weekly board, monthly champion, contributor of the
   week.

---

## Scoring

Every submission is scored out of 100 across six dimensions:

| Dimension | Max | What it measures |
|---|---|---|
| Importance | 25 | How much it matters to an AI-focused student/team |
| Recency | 20 | Age from the **original** publication date, not your discovery date |
| Practical usefulness | 20 | Value for projects, study, programming, data, research |
| Category relevance | 15 | Fit with the declared type and the team's AI focus |
| Source reliability | 10 | Official site / docs / paper beats tech press beats unknown blog |
| Personal contribution | 10 | Your own insight in "Why is this useful?" |

Then two deterministic multipliers are applied:

- **Duplicate** — a duplicate keeps 20% of its points, a partial duplicate 50%.
- **Verification** — an unverifiable source keeps 60%, partially verified 85%.

The AI only supplies the six sub-scores and its findings. Everything after that
(the recency band, the multipliers, the final number) is computed in
`src/lib/services/scoring.ts`, so the same inputs always give the same score.

### Anti-spam

You can submit as much as you like, but only your **best 3 finds each week**
count toward the weekly ranking, and only your **best 3 weeks** count toward the
monthly one. Everything else stays visible in your history.

### Changing the rules

All tunable numbers live in one file: **`src/lib/config/scoring.ts`** — point
allocations, duplicate/verification multipliers, recency bands, the trusted and
reputable domain lists, and the best-N limits. Edit, restart, done.

---

## Admin / host area

`/admin`, unlocked with `ADMIN_PASSCODE` from `.env.local` (default `rased`).

- Add, rename and remove team members
- See every submission, including removed ones
- Override any score, with a public note explaining why
- Change duplicate status, remove or restore a submission
- Reset a submission back to the AI's original score

Automatic scoring is the default; the host has the final word.

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
    dashboard/               Champions, your stats, recent finds
    submit/                  Redirects to the composer (legacy links)
    result/[id]/             Evaluation result page
    leaderboard/             Weekly + monthly boards
    feed/                    All finds, grouped by week
    profile/[id]/            Member profile + history
    admin/                   Host area
    api/
      title/                 ← names a pasted link (auto title, type, summary)
      contributions/         Submit + list (title/type optional, named server-side)
      members/ summary/ admin/auth/
  lib/
    config/scoring.ts        ← all tunable scoring rules
    db/
      schema.ts              Types
      store.ts               ← swap this file to move off JSON to Supabase/Postgres
    services/
      fetch-source.ts        Opens the URL, extracts title/description/date
      title.ts               ← auto-naming: LLM call + metadata fallback
      web-search.ts          Pluggable search providers
      duplicates.ts          Local similarity pass over earlier submissions
      prompt.ts              System prompt + structured-output tool schema
      evaluate.ts            AI evaluation + offline heuristic fallback
      scoring.ts             Deterministic final-score maths
      leaderboard.ts         Weekly/monthly aggregation, best-N rules
      admin.ts               Passcode gate
  components/
    Composer.tsx             ← the one input the app is built around
    QuietNav.tsx             The secondary links under the composer
    Header.tsx               Full nav everywhere except the home page
    ui.tsx  CurrentUser.tsx  YourStats.tsx
data/db.json                 The database (created on first run)
```

The layers are deliberately separate: swapping the database means rewriting
`db/store.ts` only; changing scoring means editing `config/scoring.ts` only;
changing the evaluator means touching `services/evaluate.ts` only.

### How a link gets named

`POST /api/title` → `services/title.ts`: the page is fetched server-side, and its
metadata (title, description, date, text excerpt) goes to Claude with
`output_config: { effort: "low", format: { type: "json_schema", … } }`, which
returns `{ title, type, summary }` as validated JSON. With no key — or on any
error, bad JSON, or refusal — it falls back to the page's own `og:title`, then to
the URL slug, and guesses the type from the domain and keywords. The composer
never blocks on it: whatever the member does not have when they submit,
`/api/contributions` names for them.

### How an evaluation actually runs

1. `fetch-source.ts` opens the submitted URL server-side and pulls the page
   title, description, publication date (meta tags / JSON-LD / `<time>`) and a
   text excerpt.
2. `duplicates.ts` finds earlier submissions covering the same thing, by URL
   match and token similarity.
3. `evaluate.ts` sends all of that to Claude along with the rubric. Claude
   researches with `web_search` / `web_fetch` and returns the six sub-scores plus
   its findings through a strict tool schema.
4. `scoring.ts` recomputes recency from the resolved original date, applies the
   duplicate and verification multipliers, and produces the final score.

If the AI call fails or no key is set, step 3 falls back to a heuristic
evaluator (domain reputation, keyword signals, date extraction, local
similarity) so the app is always usable.

---

## Reset the data

The store is Netlify Blobs (`src/lib/db/store.ts`), so local development runs
through the Netlify CLI, which provides a blobs sandbox:

```bash
npx netlify dev        # http://localhost:8888
```

Deleting `.netlify/blobs/` resets the local database; the members are re-seeded
on the next request.

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

The interface copy is currently English; all strings live in the page
components, so switching to Arabic is a copy pass plus `dir="rtl"` on `<html>`
in `src/app/layout.tsx`.
