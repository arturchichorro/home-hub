export type UpdateState = {
  waiting: boolean;
  ready: boolean;
  required: boolean;
  applying: boolean;
  blocked: boolean;
  reloadOnly: boolean;
  error: string;
};
export type UpdateEnvironment = {
  now: () => number;
  blocked: () => boolean;
  focused: () => boolean;
  visible: () => boolean;
  online: () => boolean;
  check: () => Promise<void>;
  activate: () => Promise<void>;
  reload: () => void;
};

export function createUpdateController(env: UpdateEnvironment) {
  let state: UpdateState = {
    waiting: false,
    ready: false,
    required: false,
    applying: false,
    blocked: false,
    reloadOnly: false,
    error: "",
  };
  let lastInteraction = env.now();
  let requested = false,
    discardApproved = false;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<UpdateState>) => {
    if (
      Object.entries(patch).every(
        ([key, value]) => state[key as keyof UpdateState] === value,
      )
    )
      return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const refresh = () => set({ blocked: env.blocked() });
  async function check() {
    if (!env.online() || !env.visible()) return;
    try {
      await env.check();
    } catch {
      if (state.required)
        set({ error: "Unable to check for updates. Try again." });
    }
  }
  async function apply(manual = false, discard = false) {
    refresh();
    if (state.applying || !env.visible()) return;
    if (!env.online()) {
      if (manual) set({ error: "Connect to update Home Hub." });
      return;
    }
    if (!discard && state.blocked) return;
    if (!manual && (env.focused() || env.now() - lastInteraction < 10_000))
      return;
    if (state.waiting) {
      requested = manual;
      discardApproved = discard;
      set({ applying: true, ready: false, error: "" });
      try {
        await env.activate();
      } catch {
        set({ applying: false, error: "Unable to update. Try again." });
      }
    } else if (state.ready || (manual && state.reloadOnly)) {
      set({ applying: true, error: "" });
      env.reload();
    } else if (manual) await check();
  }
  const controller = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    interaction: () => {
      lastInteraction = env.now();
      refresh();
    },
    check,
    tick: () => {
      refresh();
      if (!state.error && !state.applying && (state.waiting || state.ready))
        void apply();
    },
    waiting: () => {
      set({ waiting: true, error: "" });
      controller.tick();
    },
    ready: () => {
      // Workbox and controllerchange may both announce the same activation.
      if (state.ready && !state.waiting) return;
      set({ waiting: false, ready: true, applying: false, error: "" });
      void apply(requested, discardApproved);
    },
    require: () => {
      set({ required: true });
      void check();
    },
    reloadOnly: () => set({ reloadOnly: true }),
    update: (discard = false) => apply(true, discard),
  };
  return controller;
}
