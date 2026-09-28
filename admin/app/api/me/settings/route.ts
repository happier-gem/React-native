import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { getEffectiveUserPlan } from "@/lib/user-plans";
import { entitlementsFor } from "@/lib/entitlements";
import {
  DEFAULT_SETTINGS,
  effectiveSettings,
  getStoredSettings,
  saveSettings,
  validateSettingsUpdate,
} from "@/lib/user-settings";

// The signed-in user's reminder settings. The user always comes from the
// verified token; what can be chosen is limited by their CURRENT plan
// (lib/entitlements.ts) — anything else is refused with 403 "plan_limit".

const serverError = () => Response.json({ error: "Something went wrong on our end. Please try again." }, { status: 500 });

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });
  try {
    const [plan, stored] = await Promise.all([getEffectiveUserPlan(auth.userId), getStoredSettings(auth.userId)]);
    return Response.json({ settings: effectiveSettings(stored, entitlementsFor(plan.plan)) });
  } catch (e) {
    console.error("[me/settings:GET]", e instanceof Error ? e.message : e);
    return serverError();
  }
}

export async function PUT(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const [plan, stored] = await Promise.all([getEffectiveUserPlan(auth.userId), getStoredSettings(auth.userId)]);
    const entitlements = entitlementsFor(plan.plan);
    const result = validateSettingsUpdate(body, entitlements, stored ?? DEFAULT_SETTINGS);
    if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
    await saveSettings(auth.userId, result.value);
    return Response.json({ settings: effectiveSettings(result.value, entitlements) });
  } catch (e) {
    console.error("[me/settings:PUT]", e instanceof Error ? e.message : e);
    return serverError();
  }
}
