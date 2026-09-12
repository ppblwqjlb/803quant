import { NextResponse } from "next/server";

import { getSystemContext } from "../../../../lib/server/system-context";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getSystemContext(), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
