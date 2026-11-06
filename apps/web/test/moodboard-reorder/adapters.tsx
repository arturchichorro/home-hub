import { useSyncExternalStore } from "react";
import type { MoodboardPin } from "../../src/lists/moodboard-preview";

type Reorder = {
  attachmentId: string;
  previousId: string | null;
  nextId: string | null;
};

type Action = { args: Reorder };

const initial: MoodboardPin[] = Array.from({ length: 9 }, (_, index) => ({
  id: `pin-${index}`,
  householdId: "household",
  listId: "list",
  asset: {
    id: `asset-${index}`,
    kind: "image",
    width: 600,
    height: [600, 420, 800][index % 3] ?? 600,
  },
}));
let rows = initial;
let rejectNext = false;
const listeners = new Set<() => void>();

export const control = {
  errors: [] as string[],
  mutations: [] as { args: Reorder; expected: string[]; rejected: boolean }[],
  rejectNext() {
    rejectNext = true;
  },
  order: () => rows.map((pin) => pin.id),
  configure(count: number, uniform: boolean) {
    const next: MoodboardPin[] = [];

    for (let index = 0; index < count; index++) {
      const pin = initial[index % initial.length];

      if (!pin) {
        throw Error("Missing fixture pin");
      }

      next.push({
        ...pin,
        id: `pin-${index}`,
        asset: uniform && pin.asset ? { ...pin.asset, height: 800 } : pin.asset,
      });
    }

    publish(next);
  },
  append() {
    publish([
      ...rows,
      {
        id: "extra-pin",
        householdId: "household",
        listId: "list",
        asset: { id: "extra-asset", kind: "image", width: 600, height: 800 },
      },
    ]);
  },
  remove() {
    publish(rows.filter((pin) => pin.id !== "extra-pin"));
  },
};

declare global {
  interface Window {
    moodboardTest: typeof control;
  }
}

window.moodboardTest = control;

function publish(next: MoodboardPin[]) {
  rows = next;

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export const queries = {
  lists: {
    mediaPage: (args: object) => ({ type: "page", ...args }),
    mediaById: (args: object) => ({ type: "selected", ...args }),
  },
};

export const mutators = {
  lists: { reorderMedia: (args: Reorder) => ({ args }) },
};

export function useQuery(query?: { type: string; attachmentId?: string }) {
  const pins = useSyncExternalStore(subscribe, () => rows);

  return [
    query?.type === "selected"
      ? pins.find((pin) => pin.id === query.attachmentId)
      : query
        ? pins
        : undefined,
    { type: "complete" },
  ] as const;
}

export function useZero() {
  return {
    mutate({ args }: Action) {
      const before = rows;
      const moved = rows.find((pin) => pin.id === args.attachmentId);

      if (!moved) {
        throw new Error("Unknown reorder source");
      }

      const next = rows.filter((pin) => pin.id !== moved.id);
      const index = args.previousId
        ? next.findIndex((pin) => pin.id === args.previousId) + 1
        : 0;

      if ((next[index]?.id ?? null) !== args.nextId) {
        throw new Error("Reorder neighbors are inconsistent");
      }

      next.splice(index, 0, moved);

      const rejected = rejectNext;
      rejectNext = false;
      control.mutations.push({
        args,
        expected: next.map((pin) => pin.id),
        rejected,
      });

      // Crucial regression coverage: the real component receives the optimistic
      // query change immediately, while drag/drop feedback is still cleaning up.
      publish(next);

      return {
        client: Promise.resolve({ type: "success" }),
        server: new Promise<{ type: string }>((resolve) => {
          setTimeout(() => {
            if (rejected) {
              publish(before);
            }

            resolve({ type: rejected ? "error" : "success" });
          }, 100);
        }),
      };
    },
  };
}

export const useZeroMutationEnabled = () => true;

export function useListImageUrl({ attachmentId }: { attachmentId: string }) {
  const pin = rows.find((pin) => pin.id === attachmentId);
  const color =
    ["#bcae99", "#c1a291", "#bcc4ae"][
      Number(attachmentId.replace(/\D/g, "")) % 3
    ] ?? "#bcae99";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${pin?.asset?.height ?? 600}"><rect width="100%" height="100%" fill="${color}"/></svg>`;

  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, error: false };
}

export const invalidateListImageUrl = () => {};

export const Link = "a";

export const useBlocker = () => ({ status: "idle", reset() {}, proceed() {} });
