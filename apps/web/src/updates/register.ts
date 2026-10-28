import { appUpdates, updateActions } from "./state";

export function startAppUpdates() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    appUpdates.reloadOnly();
    return;
  }
  let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;
  let checking = false;
  const watched = new WeakSet<ServiceWorker>();
  const watch = (worker: ServiceWorker, isUpdate: boolean) => {
    if (watched.has(worker)) return;
    watched.add(worker);
    const changed = () => {
      if (!isUpdate) return; // First install needs no reload.
      if (worker.state === "installed") appUpdates.waiting();
      if (worker.state === "activated") appUpdates.ready();
    };
    worker.addEventListener("statechange", changed);
    changed();
  };
  const register = () => {
    registrationPromise ??= navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          if (registration.installing)
            watch(registration.installing, Boolean(registration.active));
        });
        if (registration.waiting) watch(registration.waiting, true);
        if (registration.installing)
          watch(registration.installing, Boolean(registration.active));
        return registration;
      })
      .catch((error) => {
        registrationPromise = undefined;
        throw error;
      });
    return registrationPromise;
  };
  updateActions.check = async () => {
    if (checking) return;
    checking = true;
    try {
      const registration = await register();
      await registration.update();
      if (registration.waiting) appUpdates.waiting();
    } finally {
      checking = false;
    }
  };
  updateActions.activate = async () => {
    const worker = (await register()).waiting;
    if (!worker) throw new Error("Update is not ready");
    // Generated Workbox workers in prompt mode support this standard message.
    worker.postMessage({ type: "SKIP_WAITING" });
  };
  let previousController = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const next = navigator.serviceWorker.controller;
    if (previousController && next !== previousController) appUpdates.ready();
    previousController = next;
  });
  const interaction = (event: Event) => {
    // Explicit-submit forms stay protected until they close/unmount. Autosave
    // editors register their precise dirty/saving state instead.
    if (event.type === "input" && event.target instanceof Element) {
      const form = event.target.closest("form");
      if (form) form.dataset.updateDirty = "true";
    }
    appUpdates.interaction();
  };
  for (const event of ["pointerdown", "keydown", "input"])
    document.addEventListener(event, interaction, true);
  window.addEventListener("focus", () => void appUpdates.check());
  window.addEventListener("pageshow", () => void appUpdates.check());
  window.addEventListener("online", () => void appUpdates.check());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void appUpdates.check();
      appUpdates.tick();
    }
  });
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    appUpdates.require();
  });
  window.setInterval(() => void appUpdates.check(), 5 * 60_000);
  window.setInterval(() => appUpdates.tick(), 1_000);
  void appUpdates.check();
}
