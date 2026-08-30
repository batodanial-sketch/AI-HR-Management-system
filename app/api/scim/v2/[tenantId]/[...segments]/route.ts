import { NextRequest } from "next/server";
import {
  scimDeprovisionUser,
  scimErrorBody,
  scimListGroups,
  scimListUsers,
  scimProvisionUser,
  scimSyncGroup,
  scimUpdateUser,
  verifyScimBearer,
  ScimErrorResponse,
  SCIM_GROUP_SCHEMA,
  SCIM_USER_SCHEMA,
} from "@/lib/scim/provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SCIM 2.0 provisioning — `/api/scim/v2/[tenantId]/...`.
 *
 * Okta / Azure AD / Google Workspace drive automated user lifecycle against
 * these endpoints (Bearer-token authenticated; SCIM_BEARER_TOKEN or
 * SCIM_TOKEN_<TENANT>):
 *
 *   GET    /Users           → list provisioned memberships
 *   POST   /Users           → create user + role assignment (idempotent)
 *   PATCH  /Users/:id       → update active/role (idempotent)
 *   DELETE /Users/:id       → deprovision (deactivate + revoke sessions)
 *   GET    /Groups          → role groups with members
 *   POST   /Groups          → sync a role group's members
 *
 * Everything is tenant-scoped by the URL segment and audited as SYSTEM.
 */

interface UserBody {
  id?: string;
  userName?: string;
  displayName?: string;
  active?: boolean;
  externalId?: string;
  role?: string;
  members?: Array<{ value: string }>;
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"?: {
    division?: string;
    department?: string;
  };
}

function scimResponse(status: number, body: object): Response {
  return Response.json(body, { status });
}

function handleScimError(error: unknown): Response {
  if (error instanceof ScimErrorResponse) {
    return scimResponse(
      error.status,
      scimErrorBody(error.status, error.message, error.scimType),
    );
  }
  return scimResponse(
    500,
    scimErrorBody(500, error instanceof Error ? error.message : "Unexpected SCIM error."),
  );
}

function requireBearer(request: NextRequest, tenantId: string): Response | null {
  if (!verifyScimBearer(tenantId, request.headers.get("authorization"))) {
    return scimResponse(401, scimErrorBody(401, "Unauthorized — invalid bearer token."));
  }
  return null;
}

interface RouteParams {
  params: { tenantId: string; segments: string[] };
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const denied = requireBearer(request, params.tenantId);
  if (denied) return denied;

  try {
    const resource = params.segments[0] ?? "";
    const id = params.segments[1];
    if (resource === "Groups" && !id) {
      const groups = await scimListGroups(params.tenantId);
      return scimResponse(200, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: groups.length,
        Resources: groups.map((group) => ({ schemas: [SCIM_GROUP_SCHEMA], ...group })),
      });
    }
    if (resource === "Users" && !id) {
      const users = await scimListUsers(params.tenantId);
      return scimResponse(200, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: users.length,
        Resources: users.map((user) => ({ schemas: [SCIM_USER_SCHEMA], ...user })),
      });
    }
    return scimResponse(404, scimErrorBody(404, "Resource not found.", "invalidValue"));
  } catch (error) {
    return handleScimError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const denied = requireBearer(request, params.tenantId);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as UserBody | null;
    if (!body || typeof body !== "object") {
      return scimResponse(400, scimErrorBody(400, "Request body must be a JSON object.", "invalidValue"));
    }

    const resource = params.segments[0] ?? "";
    if (resource === "Groups") {
      const group = await scimSyncGroup(params.tenantId, {
        id: body.id,
        displayName: body.displayName,
        members: body.members,
      });
      return scimResponse(201, { schemas: [SCIM_GROUP_SCHEMA], ...group });
    }
    if (resource !== "Users") {
      return scimResponse(404, scimErrorBody(404, "Resource not found.", "invalidValue"));
    }

    if (!body.userName) {
      return scimResponse(400, scimErrorBody(400, "userName is required.", "invalidValue"));
    }
    const role =
      body.role ??
      body["urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"]?.department ??
      "employee";
    const user = await scimProvisionUser(params.tenantId, {
      userName: body.userName,
      displayName: body.displayName,
      active: body.active !== false,
      role,
      externalId: body.externalId,
    });
    return scimResponse(201, { schemas: [SCIM_USER_SCHEMA], ...user });
  } catch (error) {
    return handleScimError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const denied = requireBearer(request, params.tenantId);
  if (denied) return denied;

  try {
    const resource = params.segments[0] ?? "";
    const userId = params.segments[1];
    if (resource !== "Users" || !userId) {
      return scimResponse(400, scimErrorBody(400, "Missing user id in path.", "invalidValue"));
    }
    const body = (await request.json().catch(() => null)) as
      | { Operations?: Array<{ op?: string; path?: string; value?: unknown }> }
      | null;

    let patch: { active?: boolean; role?: string; displayName?: string } = {};
    if (body?.Operations) {
      for (const operation of body.Operations) {
        if (operation.op?.toLowerCase() !== "replace") continue;
        if (operation.path === "active" && typeof operation.value === "boolean") {
          patch.active = operation.value;
        } else if (
          operation.path === "role" ||
          operation.path === "roles" ||
          operation.path === "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department"
        ) {
          patch.role = String(operation.value);
        }
      }
    } else {
      const direct = body as unknown as UserBody | null;
      if (direct?.active !== undefined) patch.active = direct.active;
      if (direct?.role) patch.role = direct.role;
    }

    const user = await scimUpdateUser(params.tenantId, userId, patch);
    if (!user) {
      return scimResponse(404, scimErrorBody(404, "User not found in this tenant.", "invalidValue"));
    }
    return scimResponse(200, { schemas: [SCIM_USER_SCHEMA], ...user });
  } catch (error) {
    return handleScimError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const denied = requireBearer(request, params.tenantId);
  if (denied) return denied;

  try {
    const resource = params.segments[0] ?? "";
    const userId = params.segments[1];
    if (resource !== "Users" || !userId) {
      return scimResponse(400, scimErrorBody(400, "Missing user id in path.", "invalidValue"));
    }
    await scimDeprovisionUser(params.tenantId, userId);
    // SCIM DELETE returns 204 No Content on success.
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleScimError(error);
  }
}
