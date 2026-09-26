import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/db/store";
import { requireAdmin } from "@/lib/services/admin";
import {
  CycleEndError,
  applyCycleEndPlan,
  cycleSchedule,
  planCycleEnd,
  type CycleEndAction,
  type CycleEndMove,
} from "@/lib/services/cycle";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ schedule: cycleSchedule(await readDb()) });
}

type Outcome =
  | { kind: "saved" }
  | { kind: "confirm"; moves: CycleEndMove[] };

/**
 * Moves the current cycle's last day, or undoes a move on the cycle before.
 *
 * A change that carries contributions across the boundary is never applied
 * on the first call: it comes back as 409 with the list, and is applied only
 * when resent with `confirmMoves` equal to that list's length. The plan is
 * rebuilt under the lock, so a submission landing in between asks again.
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    end?: string;
    confirmMoves?: number;
  };
  let request: CycleEndAction;
  if (body.action === "set" && typeof body.end === "string") {
    request = { action: "set", end: body.end };
  } else if (body.action === "reset-previous") {
    request = { action: "reset-previous" };
  } else {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  try {
    const outcome = await mutate<Outcome>((db) => {
      const plan = planCycleEnd(db, request);
      if (plan.moves.length > 0 && body.confirmMoves !== plan.moves.length) {
        return { kind: "confirm", moves: plan.moves };
      }
      applyCycleEndPlan(db, plan);
      return { kind: "saved" };
    });

    const schedule = cycleSchedule(await readDb());
    if (outcome.kind === "confirm") {
      return NextResponse.json(
        { needsConfirmation: true, moves: outcome.moves, schedule },
        { status: 409 },
      );
    }
    return NextResponse.json({ schedule });
  } catch (err) {
    if (err instanceof CycleEndError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
