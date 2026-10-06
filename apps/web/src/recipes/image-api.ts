import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import {
  type CreateRecipeImageReadUrlsRequest,
  type CreateRecipeImageUploadRequest,
  type CreateRecipeImageUploadResponse,
  confirmRecipeImageUploadResponseSchema,
  createRecipeImageReadUrlResponseSchema,
  createRecipeImageReadUrlsResponseSchema,
  createRecipeImageUploadRequestSchema,
  createRecipeImageUploadResponseSchema,
} from "@home-hub/shared/recipe-images";

type RecipeImageCommandInput = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  imageId: string;
};

export type RequestRecipeImageUploadInput = Omit<
  RecipeImageCommandInput,
  "imageId"
> &
  CreateRecipeImageUploadRequest;

export type RequestRecipeImageUploadResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | ({ kind: "success" } & CreateRecipeImageUploadResponse);

export type ConfirmRecipeImageUploadResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "upload_not_found" }
  | { kind: "invalid_upload" }
  | { kind: "success" };

export type CreateRecipeImageReadUrlResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "success"; url: string; expiresInSeconds: number };

export type CreateRecipeImageReadUrlsResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | {
      kind: "success";
      reads: Array<{
        imageId: string;
        recipeId: string;
        variant: RecipeImageVariant;
        url: string;
        expiresInSeconds: number;
      }>;
    };

export type DeleteRecipeImageResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "success" };

function imageUrl({
  householdId,
  recipeId,
  imageId,
}: Omit<RecipeImageCommandInput, "accessToken">): string {
  return `/api/households/${encodeURIComponent(householdId)}/recipes/${encodeURIComponent(recipeId)}/images/${encodeURIComponent(imageId)}`;
}

export async function requestRecipeImageUpload({
  accessToken,
  householdId,
  recipeId,
  ...requestInput
}: RequestRecipeImageUploadInput): Promise<RequestRecipeImageUploadResult> {
  const request = createRecipeImageUploadRequestSchema.parse(requestInput);
  const response = await fetch(
    `/api/households/${encodeURIComponent(householdId)}/recipes/${encodeURIComponent(recipeId)}/images/uploads`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "forbidden" };
  if (response.status === 404) return { kind: "not_found" };
  if (!response.ok) throw new Error("Failed to create recipe image upload");

  return {
    kind: "success",
    ...createRecipeImageUploadResponseSchema.parse(await response.json()),
  };
}

export async function uploadRecipeImageObject({
  file,
  upload,
  accessToken,
}: {
  accessToken?: string;
  file: File;
  upload: CreateRecipeImageUploadResponse["upload"];
}): Promise<void> {
  const guest = accessToken?.startsWith("hhg_v1_");
  const response = await fetch(
    guest ? guestImageContentPath(upload.url) : upload.url,
    {
      method: "PUT",
      credentials: "omit",
      headers: guest
        ? { ...upload.requiredHeaders, Authorization: `Bearer ${accessToken}` }
        : upload.requiredHeaders,
      body: file,
    },
  );

  if (!response.ok) {
    throw new Error("Failed to upload recipe image to R2");
  }
}

export async function confirmRecipeImageUpload({
  accessToken,
  householdId,
  recipeId,
  imageId,
}: RecipeImageCommandInput): Promise<ConfirmRecipeImageUploadResult> {
  const response = await fetch(
    `${imageUrl({ householdId, recipeId, imageId })}/confirm`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "forbidden" };
  if (response.status === 404) return { kind: "not_found" };
  if (response.status === 409) return { kind: "upload_not_found" };
  if (response.status === 422) return { kind: "invalid_upload" };
  if (!response.ok) throw new Error("Failed to confirm recipe image upload");

  confirmRecipeImageUploadResponseSchema.parse(await response.json());
  return { kind: "success" };
}

export async function createRecipeImageReadUrl({
  accessToken,
  householdId,
  recipeId,
  imageId,
  variant,
}: RecipeImageCommandInput & {
  variant: RecipeImageVariant;
}): Promise<CreateRecipeImageReadUrlResult> {
  const response = await fetch(
    `${imageUrl({ householdId, recipeId, imageId })}/read-url`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ variant }),
    },
  );

  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "forbidden" };
  if (response.status === 404) return { kind: "not_found" };
  if (!response.ok) throw new Error("Failed to create recipe image read URL");

  const { read } = createRecipeImageReadUrlResponseSchema.parse(
    await response.json(),
  );
  return { kind: "success", ...read };
}

export async function createRecipeImageReadUrls({
  accessToken,
  householdId,
  requests,
}: Pick<RecipeImageCommandInput, "accessToken" | "householdId"> &
  CreateRecipeImageReadUrlsRequest): Promise<CreateRecipeImageReadUrlsResult> {
  const response = await fetch(
    `/api/households/${encodeURIComponent(householdId)}/recipes/images/read-urls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );

  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "forbidden" };
  if (!response.ok) throw new Error("Failed to create recipe image read URLs");

  const result = createRecipeImageReadUrlsResponseSchema.parse(
    await response.json(),
  );
  return { kind: "success", reads: result.reads };
}

export async function deleteRecipeImage({
  accessToken,
  householdId,
  recipeId,
  imageId,
}: RecipeImageCommandInput): Promise<DeleteRecipeImageResult> {
  const response = await fetch(imageUrl({ householdId, recipeId, imageId }), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "forbidden" };
  if (!response.ok) throw new Error("Failed to delete recipe image");

  return { kind: "success" };
}

export function guestImageContentPath(url: string) {
  const parsed = new URL(url);
  if (
    !/^\/api\/households\/[a-f0-9-]+\/recipes\/[a-f0-9-]+\/images\/[a-f0-9-]+\/content$/.test(
      parsed.pathname,
    )
  )
    throw new Error("Invalid image endpoint");
  return parsed.pathname + parsed.search;
}

export async function loadGuestImage(
  url: string,
  credential: string,
): Promise<CreateRecipeImageReadUrlResult> {
  const response = await fetch(guestImageContentPath(url), {
    headers: { Authorization: `Bearer ${credential}` },
    credentials: "omit",
    cache: "no-store",
  });
  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "forbidden" };
  if (!response.ok) return { kind: "not_found" };
  return {
    kind: "success",
    url: URL.createObjectURL(await response.blob()),
    expiresInSeconds: 300,
  };
}
