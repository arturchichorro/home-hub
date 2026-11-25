import { expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import type { ContactMediaServices } from "../contacts/media";
import { createContactMediaRoutes } from "../contacts/media-routes";
import type { ListMediaServices } from "../lists/media";
import { createListMediaRoutes } from "../lists/routes";

const id = "10000000-0000-4000-8000-000000000001";
const jwtSecret = "fixture";

it.each(["contacts", "lists"])(
  "does not expose %s attachment deletion over HTTP",
  async (kind) => {
    const deleteAttachment = vi.fn(async () => ({ kind: "success" as const }));
    const services = { deleteAttachment };
    const routes =
      kind === "contacts"
        ? createContactMediaRoutes({
            jwtSecret,
            services: services as unknown as ContactMediaServices,
          })
        : createListMediaRoutes({
            jwtSecret,
            services: services as unknown as ListMediaServices,
          });
    const token = signAccessToken({ userId: id, jwtId: id, secret: jwtSecret });
    const result = await routes.request(`/${id}/media/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(result.status).toBe(404);
    expect(deleteAttachment).not.toHaveBeenCalled();
  },
);
