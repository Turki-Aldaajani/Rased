import { NextResponse } from "next/server";
import { autoLabel } from "@/lib/services/title";

export const dynamic = "force-dynamic";
// Reading the page and naming it is quick, but a slow source can drag.
export const maxDuration = 60;

interface TitleBody {
  url?: string;
  note?: string;
}

/**
 * Names a pasted link so the member never has to write a title themselves.
 * Always answers 200 with a usable label unless the URL itself is unusable.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as TitleBody;
  const url = (body.url ?? "").trim();
  const note = (body.note ?? "").trim();

  if (!url) {
    return NextResponse.json({ error: "Paste a link first." }, { status: 400 });
  }
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad protocol");
  } catch {
    return NextResponse.json(
      { error: "That link does not look valid — it should start with https://" },
      { status: 400 },
    );
  }

  const label = await autoLabel(url, note);
  return NextResponse.json({ label });
}
