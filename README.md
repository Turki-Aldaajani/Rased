# 🎯 AI Hunt

An internal, gamified knowledge-sharing game for an AI team.

A team member finds something useful in AI — a model release, a tool, a paper, a
technique — and submits it. The system opens the source, verifies the claim on
the web, works out when it was *actually* published, checks whether someone
already submitted it, scores it out of 100, and updates the leaderboard.

This is an **MVP prototype**, not a production system.

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

1. Pick **Nawal** in the header.
2. **Add contribution** → paste a genuinely new AI model release (official
   announcement page), fill in "Why is this useful?" with something specific,
   pick **AI News**, hit **Evaluate**.
3. You land on the result page: verification status, original publication date,
   duplicate status, the six-part score breakdown, and a plain-language
   explanation.
4. Switch to **Abdullah** and submit the same news. It comes back marked
   **Duplicate** with a fraction of the points and a link to Nawal's original.
5. Submit it a third time as **Reem** but add real extra value ("I tested it on
   X and it did Y") — that scores **Partially duplicate** instead, with partial
   credit.
6. Check the **Leaderboard**: weekly board, monthly champion, contributor of the
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
    page.tsx                 Dashboard
    submit/                  Submission form
    result/[id]/             Evaluation result page
    leaderboard/             Weekly + monthly boards
    feed/                    All finds, grouped by week
    profile/[id]/            Member profile + history
    admin/                   Host area
    api/                     Server routes (members, contributions, summary, auth)
  lib/
    config/scoring.ts        ← all tunable scoring rules
    db/
      schema.ts              Types
      store.ts               ← swap this file to move off JSON to Supabase/Postgres
    services/
      fetch-source.ts        Opens the URL, extracts title/description/date
      web-search.ts          Pluggable search providers
      duplicates.ts          Local similarity pass over earlier submissions
      prompt.ts              System prompt + structured-output tool schema
      evaluate.ts            AI evaluation + offline heuristic fallback
      scoring.ts             Deterministic final-score maths
      leaderboard.ts         Weekly/monthly aggregation, best-N rules
      admin.ts               Passcode gate
  components/                UI kit, header, current-user context
data/db.json                 The database (created on first run)
```

The layers are deliberately separate: swapping the database means rewriting
`db/store.ts` only; changing scoring means editing `config/scoring.ts` only;
changing the evaluator means touching `services/evaluate.ts` only.

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

Primary `#155043` · Interactive `#125D64` · Accent `#869200`, with the
secondary colours reserved for states only. Neutrals `#FAFAFA` / `#131C18` /
`#E3D8B3` / `#2B2B2B` / `#E7E3D6` / `#9A968A`. Light and dark mode both
supported (toggle in the header; follows the OS by default).

The type stack is `"Thmanyah", "IBM Plex Sans Arabic", …` — if the Thmanyah
brand font is installed locally it is used automatically, otherwise IBM Plex
Sans Arabic loads as a close fallback that covers both Arabic and Latin.

The interface copy is currently English; all strings live in the page
components, so switching to Arabic is a copy pass plus `dir="rtl"` on `<html>`
in `src/app/layout.tsx`.
