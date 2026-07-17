import { NextRequest, NextResponse } from "next/server";
import { login, setSessionCookie, AuthError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Verifies credentials and sets a signed session cookie.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }
  try {
    const { token, user } = await login({
      email: body.email,
      password: body.password,
    });
    await setSessionCookie(token);
    return NextResponse.json({ user });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
