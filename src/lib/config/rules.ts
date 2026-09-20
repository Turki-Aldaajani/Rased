/**
 * Every tunable rule of the contribution engine lives here.
 *
 * The one thing this file encodes above all: a MEMBER POINT and an EDITORIAL
 * SCORE are different currencies. A valid contribution is worth exactly one
 * point whatever it is about; the editorial score only ever tells the
 * newsletter engine what to lead with. Nothing in `points` may depend on
 * anything in `editorial`.
 */

// ---------------------------------------------------------------------------
// Member points
// ---------------------------------------------------------------------------

export const POINTS = {
  /** What a valid, non-duplicate contribution is worth. Always flat. */
  perValidContribution: 1,

  /** Maximum points one member can earn inside a single newsletter cycle. */
  maxPerCycle: 3,

  /**
   * Submissions past the cap are still stored, still classified and still
   * available to the newsletter engine, they just stop moving the board.
   */
  keepEvaluatingAfterCap: true,
} as const;

/** One newsletter cycle ≈ two weeks, anchored to a Monday. */
export const CYCLE = {
  /** Monday the cycle counter starts from. Must stay in the past. */
  anchor: "2025-01-06",
  lengthDays: 14,
} as const;

// ---------------------------------------------------------------------------
// Editorial value, newsletter prioritisation only, never member points
// ---------------------------------------------------------------------------

export const EDITORIAL = {
  /** Weights out of 100. Change freely; the total is derived, not assumed. */
  weights: {
    aiRelevance: 12,
    significance: 18,
    usefulness: 16,
    recency: 14,
    sourceCredibility: 12,
    audienceFit: 10,
    uniqueness: 10,
    newsletterValue: 8,
  },

  /**
   * Editorial recency, as a fraction of the recency weight. Measured from the
   * ORIGINAL publication date, never from the submission date.
   */
  recencyBands: [
    { maxAgeDays: 7, fraction: 1, labelAr: "نُشر خلال الأسبوع الماضي" },
    { maxAgeDays: 30, fraction: 0.8, labelAr: "نُشر خلال الشهر الماضي" },
    { maxAgeDays: 90, fraction: 0.55, labelAr: "نُشر خلال الأشهر الثلاثة الماضية" },
    { maxAgeDays: 365, fraction: 0.3, labelAr: "نُشر خلال العام الماضي" },
    { maxAgeDays: Infinity, fraction: 0.1, labelAr: "أقدم من عام" },
  ],

  /** Applied to the editorial score only, a duplicate is worth less to the newsletter. */
  duplicateMultiplier: {
    unique: 1,
    same_topic_new_value: 0.85,
    duplicate: 0.4,
  },

  /** Applied to the editorial score only, unconfirmed content is riskier to publish. */
  verificationMultiplier: {
    verified: 1,
    partially_verified: 0.9,
    not_independently_verified: 0.75,
  },
} as const;

export type EditorialDimension = keyof typeof EDITORIAL.weights;

export const EDITORIAL_TOTAL = Object.values(EDITORIAL.weights).reduce(
  (a, b) => a + b,
  0,
);

export const EDITORIAL_LABELS: Record<EditorialDimension, string> = {
  aiRelevance: "الصلة بالذكاء الاصطناعي",
  significance: "الأهمية",
  usefulness: "الفائدة العملية",
  recency: "الحداثة",
  sourceCredibility: "موثوقية المصدر",
  audienceFit: "ملاءمة الجمهور",
  uniqueness: "التفرّد",
  newsletterValue: "القيمة للنشرة",
};

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export const DUPLICATES = {
  /** Local similarity (0..1) above which a prior submission is worth comparing. */
  candidateThreshold: 0.33,
  /** Local similarity at which the offline evaluator calls it a duplicate outright. */
  duplicateThreshold: 0.55,
  /** How many prior submissions the evaluator is shown. */
  maxCandidates: 6,
} as const;

// ---------------------------------------------------------------------------
// Acceptance, the floor a contribution has to clear to earn its point
// ---------------------------------------------------------------------------

export const ACCEPTANCE = {
  /**
   * Minimum meaningful words in the member's "why is this important?".
   * This is a floor on effort, not on quality: a short, specific reason passes.
   */
  minReasonWords: 3,
} as const;

// ---------------------------------------------------------------------------
// Source reputation
// ---------------------------------------------------------------------------

/** Domains we treat as first-party / high trust. */
export const TRUSTED_DOMAINS = [
  "openai.com",
  "anthropic.com",
  "deepmind.google",
  "ai.google",
  "blog.google",
  "google.com",
  "meta.com",
  "ai.meta.com",
  "microsoft.com",
  "nvidia.com",
  "mistral.ai",
  "cohere.com",
  "huggingface.co",
  "github.com",
  "arxiv.org",
  "nature.com",
  "science.org",
  "acm.org",
  "ieee.org",
  "openreview.net",
  "papers.nips.cc",
  "pytorch.org",
  "tensorflow.org",
  "langchain.com",
  "llamaindex.ai",
  "stability.ai",
  "x.ai",
  "qwen.ai",
  "deepseek.com",
  "apple.com",
  "aws.amazon.com",
  "cloud.google.com",
] as const;

/** Reputable secondary coverage, good, but not the primary source. */
export const REPUTABLE_DOMAINS = [
  "techcrunch.com",
  "theverge.com",
  "arstechnica.com",
  "wired.com",
  "venturebeat.com",
  "technologyreview.com",
  "ft.com",
  "reuters.com",
  "bloomberg.com",
  "theinformation.com",
  "semianalysis.com",
  "simonwillison.net",
  "towardsdatascience.com",
] as const;

/** Platforms whose content is social-first, a signal for social_trends. */
export const SOCIAL_DOMAINS = [
  "x.com",
  "twitter.com",
  "linkedin.com",
  "reddit.com",
  "youtube.com",
  "tiktok.com",
  "instagram.com",
  "threads.net",
  "mastodon.social",
] as const;

// ---------------------------------------------------------------------------
// Newsletter engine, reads the editorial score, never member points
// ---------------------------------------------------------------------------

export const NEWSLETTER = {
  /**
   * Most items per section. Issue #1 ran 5 / 2 / 3 / 2 / 3 / 2; the caps sit
   * just above that so one busy category cannot swallow the issue.
   */
  sectionLimits: {
    top_news: 5,
    models: 3,
    new_tools: 3,
    other_tools: 3,
    learn: 3,
    social: 2,
  },

  /** Editorial score below which a contribution is not considered for the issue. */
  minEditorialScore: 30,

  /**
   * Two selected items whose titles are at least this similar (0..1) are
   * treated as the same event, and only the stronger one is kept.
   */
  sameEventSimilarity: 0.5,

  /** Prefer different companies: at most this many items per entity per section on the first pass. */
  maxPerEntityPerSection: 1,

  /** A "new" model or tool older than this is flagged for review before publishing. */
  staleForNewDays: 90,

  /** Public address of the published archive (GitHub Pages serves main:/docs). */
  publicBaseUrl: "https://turki-aldaajani.github.io/Rased/newsletter",

  /** Shared social-preview image, published with Issue #1 and never changed. */
  ogImage: "01/og-injaz.png",
} as const;
