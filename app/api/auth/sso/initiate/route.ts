import { z } from "zod";
import { initiateSsoLogin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Enterprise SSO initiation — `/api/auth/sso/initiate`.
 *
 * POST { provider?, domain?, redirectTo? } returns the identity provider's
 * authorization URL. Supported providers: google (Google Workspace / OIDC),
 * okta + azure (Microsoft Entra ID / SAML 2.0). Domain-first login is
 * supported: pass only the email domain and the IdP is inferred.
 */

const initiateSchema = z.object({
  provider: z.string().max(40).optional().nullable(),
  domain: z.string().max(253).optional().nullable(),
  redirectTo: z.string().max(500).optional().nullable(),
  captchaToken: z.string().max(4096).optional().nullable(),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = initiateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
          .join(" · "),
      },
      { status: 400 },
    );
  }

  try {
    const { url, provider } = await initiateSsoLogin(parsed.data);
    return Response.json({ ok: true, provider, url });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to initiate SSO." },
      { status: 400 },
    );
  }
}
