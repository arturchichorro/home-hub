import {
  type AuthUser,
  type LoginRequest,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
} from "@home-hub/shared/auth";

export type Session = {
  user: AuthUser;
  accessToken: string;
};

export type LoginResult =
  | { kind: "invalid_credentials" }
  | { kind: "success"; session: Session };

export async function restoreSession(): Promise<Session | null> {
  const refreshResponse = await fetch("/auth/refresh", {
    method: "POST",
    credentials: "include",
  });

  if (refreshResponse.status === 401) return null;

  if (!refreshResponse.ok) {
    throw new Error("Failed to refresh session");
  }

  const { accessToken } = refreshResponseSchema.parse(
    await refreshResponse.json(),
  );

  const meResponse = await fetch("/auth/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (meResponse.status === 401) return null;

  if (!meResponse.ok) {
    throw new Error("Failed to load current user");
  }

  const { user } = meResponseSchema.parse(await meResponse.json());

  return { user, accessToken };
}

export async function login(request: LoginRequest): Promise<LoginResult> {
  const parsedRequest = loginRequestSchema.parse(request);

  const loginResponse = await fetch("/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsedRequest),
  });

  if (loginResponse.status === 401) return { kind: "invalid_credentials" };

  if (!loginResponse.ok) {
    throw new Error("Failed to login");
  }

  const session = loginResponseSchema.parse(await loginResponse.json());

  return { kind: "success", session };
}
