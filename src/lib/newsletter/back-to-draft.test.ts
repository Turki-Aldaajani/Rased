import assert from "node:assert/strict";
import { test } from "node:test";
import { draftState } from "@/lib/review/core";
import { asDraft, backToDraftRefusal, deleteRefusal, replacesPublishedPage } from "./back-to-draft";
import type { NewsletterIssue, Publication } from "./types";

const PUBLICATION: Publication = {
  url: "https://example.org/newsletter/04/",
  at: "2026-11-09T10:00:00.000Z",
  target: "github",
  path: "04/index.html",
  version: 1,
};

function issue(number: number, over: Partial<NewsletterIssue> = {}): NewsletterIssue {
  return {
    id: `n${number}`,
    number,
    cycleKey: `C00${40 + number}`,
    status: "published",
    title: `العدد ${number}`,
    sections: [{ id: "models", title: "جديد النماذج", items: [{ id: "i1" }], error: null }],
    unused: [],
    publication: { ...PUBLICATION, path: `0${number}/index.html` },
    editedAfterPublish: true,
    revision: 3,
    ...over,
  } as unknown as NewsletterIssue;
}

test("a published issue with no other draft may go back to a draft", () => {
  const four = issue(4);
  assert.equal(backToDraftRefusal(four, [issue(3), four]), null);
});

test("an issue that is already a draft, or missing, is refused", () => {
  const draft = issue(4, { status: "draft" });
  assert.equal(backToDraftRefusal(draft, [draft])?.status, 409);
  assert.equal(backToDraftRefusal(undefined, [])?.status, 404);
});

test("another draft blocks it, since reviewers' links open only one", () => {
  const four = issue(4);
  const five = issue(5, { status: "draft", publication: null });
  const refusal = backToDraftRefusal(four, [four, five]);
  assert.equal(refusal?.status, 409);
  assert.match(refusal!.message, /العدد 5/);
  assert.equal(refusal!.details.issueId, "n5");
});

test("as a draft, the content and the publication are kept", () => {
  const four = issue(4);
  const draft = asDraft(four);
  assert.equal(draft.status, "draft");
  assert.deepEqual(draft.publication, four.publication);
  assert.deepEqual(draft.sections, four.sections);
  assert.equal(draft.number, 4);
  assert.equal(draft.editedAfterPublish, false);
  // The stored issue is not touched.
  assert.equal(four.status, "published");
});

test("the returned draft is the one reviewers' links open", () => {
  const three = issue(3);
  const four = issue(4);
  assert.equal(draftState([three, four]).kind, "published");
  const after = draftState([three, asDraft(four)]);
  assert.equal(after.kind, "draft");
  assert.equal(after.kind === "draft" && after.issue.number, 4);
});

test("publishing a returned draft replaces its page, a fresh draft does not", () => {
  assert.equal(replacesPublishedPage(issue(4)), true);
  assert.equal(replacesPublishedPage(asDraft(issue(4))), true);
  assert.equal(replacesPublishedPage(issue(5, { status: "draft", publication: null })), false);
});

test("a returned draft cannot be deleted while its page is public; a fresh draft can", () => {
  assert.equal(deleteRefusal(issue(4))?.status, 409);
  assert.equal(deleteRefusal(asDraft(issue(4)))?.status, 409);
  assert.equal(deleteRefusal(issue(5, { status: "draft", publication: null })), null);
});
