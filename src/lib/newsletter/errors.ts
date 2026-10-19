/** A refusal the newsletter routes turn into a JSON error with this status. */
export class NewsletterError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
