import type { SourceSnapshot } from "@/lib/services/fetch-source";
import type { DuplicateCandidate } from "@/lib/services/duplicates";
import type { SearchHit } from "@/lib/services/web-search";
import type {
  EvaluationInput,
  EvaluationToolInput,
} from "@/lib/services/prompt";

export type ProviderName = "claude" | "deepseek";

/** What the composer shows after a link is pasted. */
export interface LabelResult {
  title: string;
  summary: string;
}

/**
 * The one surface the rest of the app talks to when it needs a model.
 *
 * Both implementations return exactly the shapes the app already consumes —
 * `EvaluationToolInput` for the evaluation and `LabelResult` for the title —
 * so swapping the provider changes where the judgement comes from and nothing
 * else downstream.
 */
export interface AIClient {
  readonly name: ProviderName;
  /** Model id recorded on the evaluation, so a result says what judged it. */
  readonly model: string;
  /**
   * True when the provider reads the web itself during the call (Claude's
   * server-side web_search/web_fetch). DeepSeek cannot, so the app fetches
   * the page and hands over the text instead.
   */
  readonly canBrowse: boolean;
  /** True when the provider has the API key it needs. */
  enabled(): boolean;

  /** Names a pasted link. Returns null to fall back to page metadata. */
  label(
    snapshot: SourceSnapshot,
    url: string,
    note: string,
  ): Promise<LabelResult | null>;

  /** Full evaluation. Throws when the provider could not be reached — the
   *  caller stores the submission pending and lets the member retry. */
  evaluate(
    input: EvaluationInput,
    snapshot: SourceSnapshot,
    candidates: DuplicateCandidate[],
    hits: SearchHit[],
  ): Promise<EvaluationToolInput>;
}
