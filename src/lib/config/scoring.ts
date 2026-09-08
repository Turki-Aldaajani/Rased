/**
 * All tunable scoring rules live here.
 * Change the numbers, restart, done — no other file needs editing.
 */

export const SCORING = {
  /** Max points per dimension. They must add up to 100. */
  maxPoints: {
    importance: 25,
    recency: 20,
    usefulness: 20,
    relevance: 15,
    sourceReliability: 10,
    personalContribution: 10,
  },

  /** Multiplier applied to the raw score based on duplicate status. */
  duplicateMultiplier: {
    original: 1,
    partial: 0.5,
    duplicate: 0.2,
  },

  /** Multiplier applied when the claim could not be checked on the web. */
  verificationMultiplier: {
    verified: 1,
    partial: 0.85,
    unverified: 0.6,
  },

  /** How many contributions count toward a member's weekly total. */
  bestContributionsPerWeek: 3,

  /** How many weeks count toward a member's monthly total. */
  bestWeeksPerMonth: 3,

  /**
   * Recency guidance handed to the evaluator, and used by the offline
   * heuristic. Age is measured from the ORIGINAL publication date.
   */
  recencyBands: [
    { maxAgeDays: 7, points: 20, label: "Published within the last week" },
    { maxAgeDays: 30, points: 16, label: "Published within the last month" },
    { maxAgeDays: 90, points: 11, label: "Published within the last 3 months" },
    { maxAgeDays: 365, points: 6, label: "Published within the last year" },
    { maxAgeDays: Infinity, points: 2, label: "Older than a year" },
  ],

  /** Domains we treat as first-party / high trust. */
  trustedDomains: [
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
  ],

  /** Reputable secondary coverage — good, but not the primary source. */
  reputableDomains: [
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
  ],

  /** Similarity above this (0..1) flags a likely duplicate before the AI runs. */
  duplicateSimilarityThreshold: 0.55,
} as const;

export const TOTAL_POINTS = Object.values(SCORING.maxPoints).reduce(
  (a, b) => a + b,
  0,
);

export const DIMENSION_LABELS: Record<keyof typeof SCORING.maxPoints, string> = {
  importance: "Importance",
  recency: "Recency",
  usefulness: "Practical usefulness",
  relevance: "Category relevance",
  sourceReliability: "Source reliability",
  personalContribution: "Personal contribution",
};
