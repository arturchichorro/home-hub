import {
  type AuthUser,
  type LoginRequest,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
  type SignupRequest,
  signupRequestSchema,
} from "@home-hub/shared/auth";

export type Session = {
  user: AuthUser;
  accessToken: string;
};

export type LoginResult =
  | { kind: "invalid_credentials" }
  | { kind: "success"; session: Session };

export type SignupResult =
  | { kind: "conflict" }
  | { kind: "forbidden" }
  | { kind: "success"; session: Session };

export type RefreshAccessTokenResult =
  | { kind: "unauthorized" }
  | { kind: "success"; accessToken: string };

let activeRefreshRequest: Promise<RefreshAccessTokenResult> | undefined;

type SessionRequestOptions = {
  signal?: AbortSignal;
};

async function requestAccessTokenRefresh({
  signal,
}: SessionRequestOptions = {}): Promise<RefreshAccessTokenResult> {
  const refreshResponse = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    ...(signal ? { signal } : {}),
  });

  if (refreshResponse.status === 401) return { kind: "unauthorized" };

  if (!refreshResponse.ok) {
    throw new Error("Failed to refresh session");
  }

  const { accessToken } = refreshResponseSchema.parse(
    await refreshResponse.json(),
  );

  return { kind: "success", accessToken };
}

export function refreshAccessToken(
  options?: SessionRequestOptions,
): Promise<RefreshAccessTokenResult> {
  if (!activeRefreshRequest) {
    activeRefreshRequest = requestAccessTokenRefresh(options).finally(() => {
      activeRefreshRequest = undefined;
    });
  }

  return activeRefreshRequest;
}

export async function refreshSession(
  session: Session,
): Promise<Session | null> {
  const result = await refreshAccessToken();

  return result.kind === "unauthorized"
    ? null
    : { ...session, accessToken: result.accessToken };
}

export async function restoreSession({
  signal,
}: SessionRequestOptions = {}): Promise<Session | null> {
  const refreshResult = await refreshAccessToken(signal ? { signal } : {});

  if (refreshResult.kind === "unauthorized") return null;

  const { accessToken } = refreshResult;

  const meResponse = await fetch("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    ...(signal ? { signal } : {}),
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

  const loginResponse = await fetch("/api/auth/login", {
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

export async function signup(request: SignupRequest): Promise<SignupResult> {
  const parsedRequest = signupRequestSchema.parse(request);

  const signupResponse = await fetch("/api/auth/signup", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsedRequest),
  });

  if (signupResponse.status === 403) return { kind: "forbidden" };
  if (signupResponse.status === 409) return { kind: "conflict" };

  if (!signupResponse.ok) {
    throw new Error("Failed to sign up");
  }

  const session = loginResponseSchema.parse(await signupResponse.json());

  return { kind: "success", session };
}

export async function logout(): Promise<void> {
  const logoutResponse = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!logoutResponse.ok) {
    throw new Error("Failed to log out");
  }
}
