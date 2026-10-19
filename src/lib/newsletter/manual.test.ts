import assert from "node:assert/strict";
import { test } from "node:test";
import type { Contribution } from "@/lib/db/schema";
import { CURRENT, PREVIOUS, contribution, database, inCycle } from "@/test/fixtures";
import { composeFromSource } from "./compose";
import { LEGACY_ISSUES } from "./legacy";
import { manualAddRefusal, notInNewsletter } from "./manual";
import { eligibleFor } from "./select";
import type { NewsletterIssue, UnusedContribution } from "./types";

/** Accepted by a host after the evaluation failed: no evaluation, no category. */
function hostAccepted(over: Partial<Contribution> = {}): Contribution {
  return contribution({
    status: "pending",
    evaluation: null,
    memberReason: "دراسة تقيس أثر الكود المكتوب بالذكاء الاصطناعي.",
    adminOverride: {
      status: "accepted",
      points: 1,
      primaryCategory: null,
      duplicateOutcome: null,
      note: "",
      at: inCycle(CURRENT, 3),
    },
    ...over,
  });
}

function issue(
  cycleKey: string,
  ids: string[],
  over: Partial<NewsletterIssue> = {},
): NewsletterIssue {
  return {
    id: `n-${cycleKey}`,
    number: 7,
    cycleKey,
    status: "draft",
    createdAt: inCycle(cycleKey, 2),
    sections: [
      { id: "models", items: ids.map((contributionId) => ({ id: `i-${contributionId}`, contributionId })) },
    ],
    unused: [],
    ...over,
  } as unknown as NewsletterIssue;
}

test("a host-accepted contribution with no evaluation may be added by hand", () => {
  assert.equal(manualAddRefusal(hostAccepted(), CURRENT), null);
  assert.equal(manualAddRefusal(contribution({ status: "accepted_with_new_angle" }), CURRENT), null);
});

test("a rejected, removed, missing or other-cycle contribution is refused", () => {
  assert.equal(manualAddRefusal(contribution({ status: "rejected" }), CURRENT)?.status, 422);
  assert.equal(manualAddRefusal(contribution({ status: "pending" }), CURRENT)?.status, 422);
  assert.equal(manualAddRefusal(contribution({ removed: true }), CURRENT)?.status, 404);
  assert.equal(manualAddRefusal(undefined, CURRENT)?.status, 404);
  assert.equal(
    manualAddRefusal(contribution({ cycleKey: PREVIOUS }), CURRENT)?.message,
    "المساهمة من دورة أخرى.",
  );
  // A host rejecting an accepted one takes it out too.
  const overruled = contribution({
    adminOverride: { status: "rejected", points: 0, primaryCategory: null, duplicateOutcome: null, note: "", at: inCycle(CURRENT) },
  });
  assert.equal(manualAddRefusal(overruled, CURRENT)?.status, 422);
});

test("without a cycle, only availability and status are checked", () => {
  assert.equal(manualAddRefusal(contribution({ cycleKey: PREVIOUS })), null);
});

test("the automatic selection still needs an evaluation", () => {
  assert.deepEqual(eligibleFor([hostAccepted()], CURRENT), []);
});

test("a card for an unevaluated contribution is built from its title and the member's words", () => {
  const c = hostAccepted({ title: "دراسة من Harvard" });
  const item = composeFromSource(c, "top_news");
  assert.equal(item.title, "دراسة من Harvard");
  assert.equal(item.whyItMatters, c.memberReason);
  assert.equal(item.contributionId, c.id);
});

test("lists accepted contributions missing from their cycle, grouped newest first", () => {
  const placed = contribution({ cycleKey: CURRENT });
  const harvard = hostAccepted({ cycleKey: CURRENT });
  const rejected = contribution({ cycleKey: CURRENT, status: "rejected" });
  const removed = contribution({ cycleKey: CURRENT, removed: true });
  const older = contribution({ cycleKey: PREVIOUS });
  const db = database([older, placed, harvard, rejected, removed], {
    newsletters: [issue(CURRENT, [placed.id])],
  });

  const groups = notInNewsletter(db);
  assert.deepEqual(groups.map((g) => g.cycleKey), [CURRENT, PREVIOUS]);
  assert.deepEqual(groups[0].items.map((i) => i.contributionId), [harvard.id]);
  assert.equal(groups[0].items[0].reason, "بلا تقييم آلي");
  assert.equal(groups[0].issue?.id, `n-${CURRENT}`);
  // No issue for the earlier cycle yet.
  assert.equal(groups[1].issue, null);
});

test("the reason comes from the issue's unused list first", () => {
  const c = contribution({ cycleKey: CURRENT });
  const unused = [{ contributionId: c.id, reason: "section_full" }] as UnusedContribution[];
  const [group] = notInNewsletter(database([c], { newsletters: [issue(CURRENT, [], { unused })] }));
  assert.equal(group.items[0].reason, "القسم ممتلئ");
});

test("a cycle published before this system is left out", () => {
  const c = contribution({ cycleKey: LEGACY_ISSUES[0].cycleKey });
  assert.deepEqual(notInNewsletter(database([c])), []);
});
