import {
  type AuthUser,
  meResponseSchema,
  refreshResponseSchema,
} from "@home-hub/shared/auth";

export type Session = {
  user: AuthUser;
  accessToken: string;
};

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
