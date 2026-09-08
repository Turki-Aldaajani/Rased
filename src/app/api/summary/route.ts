import { NextResponse } from "next/server";
import { listContributions, listMembers } from "@/lib/db/store";
import { teamSummary } from "@/lib/services/leaderboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const [members, contributions] = await Promise.all([
    listMembers(),
    listContributions(),
  ]);
  return NextResponse.json(teamSummary(members, contributions));
}
