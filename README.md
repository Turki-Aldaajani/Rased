# 🎯 AI Hunt

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
npm run dev
```

Open <http://localhost:3000>.

The team (Nawal, Abdullah, Reem, Abdulaziz, Mukhtar, Yara) is seeded
automatically on first run. Pick your name in the top-right and start hunting.

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

`/admin`, unlocked with `ADMIN_PASSCODE` from `.env.local` (default `aihunt`).

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
| `AI_HUNT_MODEL` | `claude-opus-5` | Model used for verification + evaluation |
| `AI_HUNT_TITLE_MODEL` | `claude-opus-5` | Model that names a pasted link (short, `effort: low` call) |
| `AI_HUNT_EFFORT` | `medium` | `low` … `max` — how hard the model works |
| `WEB_SEARCH_PROVIDER` | `anthropic` | `anthropic` \| `tavily` \| `brave` \| `serper` \| `none` |
| `TAVILY_API_KEY` / `BRAVE_API_KEY` / `SERPER_API_KEY` | *(empty)* | Only for the matching provider |
| `ADMIN_PASSCODE` | `aihunt` | Unlocks `/admin` |

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

```bash
rm data/db.json
```

The members are re-seeded on the next request.

---

## Visual identity

Calm surface, vivid accents. The page stays quiet — off-white, generous
whitespace, two blurred colour fields behind everything — and the violet → blue
gradient is spent only on what you should touch: the submit button, the ring
around the focused composer, icon tiles, score meters.

- Violet `#6D5EF8` → blue `#4F7DFB` → sky `#38BDF8` (`--grad-brand`), with
  `--grad-violet` / `--grad-blue` / `--grad-mint` / `--grad-amber` /
  `--grad-pink` for per-type icon tiles.
- Rounded corners throughout (`rounded-2xl`), one soft shadow that deepens on
  hover, and a 2px lift on anything clickable.
- Motion is small and quick: a 380ms rise for content that appears, a shimmer
  while the title is being written, a gradient sweep on the primary button.
  Everything collapses under `prefers-reduced-motion`.

All of it is CSS variables in `src/app/globals.css` — light and dark are the
same tokens with different values, so re-theming is that one file. Dark mode
follows the OS and can be toggled in the header.

The type stack is `"Thmanyah", "IBM Plex Sans Arabic", …` — if the Thmanyah
brand font is installed locally it is used automatically, otherwise IBM Plex
Sans Arabic loads as a close fallback that covers both Arabic and Latin.

The interface copy is currently English; all strings live in the page
components, so switching to Arabic is a copy pass plus `dir="rtl"` on `<html>`
in `src/app/layout.tsx`.
