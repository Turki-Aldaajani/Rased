import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";

/**
 * Where an approved issue is written.
 *
 * The public newsletter is GitHub Pages serving `main:/docs`, so publishing
 * means putting `docs/newsletter/NN/index.html` into the repository:
 *
 *   github      — through the GitHub Contents API. What the deployed app uses:
 *                 Netlify functions cannot write to disk, and a commit is what
 *                 GitHub Pages deploys from.
 *   filesystem  — straight into the local checkout, for development. The file
 *                 then goes through the normal commit/PR flow.
 *
 * Both refuse to overwrite a file unless the caller says it is a deliberate
 * re-publish of the same issue.
 */

export interface Publisher {
  target: "github" | "filesystem";
  describe(): string;
  exists(path: string): Promise<boolean>;
  write(path: string, content: string, message: string): Promise<void>;
  read(path: string): Promise<string | null>;
}

export class PublishConfigError extends Error {}

function githubPublisher(token: string): Publisher {
  const repo = process.env.NEWSLETTER_GITHUB_REPO || "Turki-Aldaajani/Rased";
  const branch = process.env.NEWSLETTER_GITHUB_BRANCH || "main";
  const root = (process.env.NEWSLETTER_GITHUB_DIR || "docs/newsletter").replace(/\/+$/, "");

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "rased-newsletter",
  };
  const url = (path: string) =>
    `https://api.github.com/repos/${repo}/contents/${root}/${path}`;

  async function lookup(path: string): Promise<{ sha: string; content: string } | null> {
    const res = await fetch(`${url(path)}?ref=${encodeURIComponent(branch)}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GitHub ${res.status} عند قراءة ${root}/${path}`);
    }
    const body = (await res.json()) as { sha: string; content?: string };
    return {
      sha: body.sha,
      content: body.content ? Buffer.from(body.content, "base64").toString("utf8") : "",
    };
  }

  return {
    target: "github",
    describe: () => `${repo}@${branch}:${root}`,
    exists: async (path) => (await lookup(path)) !== null,
    read: async (path) => (await lookup(path))?.content ?? null,
    async write(path, content, message) {
      const existing = await lookup(path);
      const res = await fetch(url(path), {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          branch,
          content: Buffer.from(content, "utf8").toString("base64"),
          ...(existing ? { sha: existing.sha } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `GitHub ${res.status} عند كتابة ${root}/${path}: ${detail.slice(0, 200)}`,
        );
      }
    },
  };
}

function filesystemPublisher(): Publisher {
  const root = resolve(process.env.NEWSLETTER_PUBLISH_DIR || join(process.cwd(), "docs/newsletter"));
  const full = (path: string) => {
    const target = resolve(root, path);
    if (!target.startsWith(root)) throw new Error("مسار نشر غير صالح.");
    return target;
  };
  return {
    target: "filesystem",
    describe: () => root,
    async exists(path) {
      try {
        await stat(full(path));
        return true;
      } catch {
        return false;
      }
    },
    async read(path) {
      try {
        return await readFile(full(path), "utf8");
      } catch {
        return null;
      }
    },
    async write(path, content) {
      const target = full(path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    },
  };
}

/**
 * Picks the publisher from the environment. Explicit beats implicit; a
 * deployed app without a token gets a clear error rather than a silent
 * write to a read-only disk.
 */
export function resolvePublisher(): Publisher {
  const explicit = (process.env.NEWSLETTER_PUBLISH_TARGET || "").trim();
  const token = process.env.NEWSLETTER_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";

  if (explicit === "github" || (!explicit && token)) {
    if (!token) {
      throw new PublishConfigError(
        "النشر عبر GitHub يحتاج NEWSLETTER_GITHUB_TOKEN بصلاحية كتابة المحتوى على المستودع.",
      );
    }
    return githubPublisher(token);
  }

  const local =
    process.env.NETLIFY_DEV === "true" || process.env.NODE_ENV === "development";
  if (explicit === "filesystem" || (!explicit && local)) {
    return filesystemPublisher();
  }

  throw new PublishConfigError(
    "لم يُضبط مكان النشر. أضف NEWSLETTER_GITHUB_TOKEN حتى تُنشر الأعداد إلى docs/newsletter على GitHub Pages.",
  );
}
