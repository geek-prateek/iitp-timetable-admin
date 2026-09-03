import {
  clearSessionCookie,
  createSessionCookie,
  isAuthenticated,
  passwordIsConfigured,
  passwordMatches,
  usernameMatches
} from "../lib/auth.js";

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers }
  });
}

export async function GET(request) {
  return json({
    authenticated: isAuthenticated(request),
    configured: passwordIsConfigured()
  });
}

export async function POST(request) {
  if (!passwordIsConfigured()) {
    return json({ error: "ADMIN_PASSWORD is not configured in Vercel." }, 503);
  }

  try {
    const { username = "", password = "" } = await request.json();
    if (!usernameMatches(username) || !passwordMatches(password)) {
      return json({ error: "Incorrect username or password." }, 401);
    }

    return json(
      { authenticated: true },
      200,
      { "set-cookie": createSessionCookie() }
    );
  } catch (error) {
    return json({ error: "A username and password are required." }, 400);
  }
}

export async function DELETE() {
  return json(
    { authenticated: false },
    200,
    { "set-cookie": clearSessionCookie() }
  );
}
