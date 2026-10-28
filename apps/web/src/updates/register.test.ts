import { afterEach, expect, it, vi } from "vitest";

class Worker extends EventTarget {
  state: ServiceWorkerState = "installing";
  postMessage = vi.fn();
  change(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}
async function setup(active = true) {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubEnv("PROD", true);
  vi.stubEnv("BASE_URL", "/");
  const old = new Worker();
  old.state = "activated";
  const registration = Object.assign(new EventTarget(), {
    active: active ? old : undefined,
    waiting: undefined as Worker | undefined,
    installing: undefined as Worker | undefined,
    update: vi.fn(async () => {}),
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: active ? old : null,
    register: vi.fn(async () => registration),
  });
  const doc = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    hasFocus: () => true,
    activeElement: null,
    querySelector: vi.fn(() => null),
  });
  const win = Object.assign(new EventTarget(), {
    setInterval: globalThis.setInterval,
    location: { reload: vi.fn() },
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { serviceWorker, onLine: true });
  const { startAppUpdates } = await import("./register");
  const { appUpdates } = await import("./state");
  startAppUpdates();
  await vi.advanceTimersByTimeAsync(0);
  return { registration, serviceWorker, doc, win, appUpdates };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("registers once with fresh SW fetches and activates only after the idle barrier", async () => {
  const { registration, serviceWorker, appUpdates, win } = await setup();
  expect(serviceWorker.register).toHaveBeenCalledExactlyOnceWith("/sw.js", {
    updateViaCache: "none",
  });
  const worker = new Worker();
  registration.installing = worker;
  registration.dispatchEvent(new Event("updatefound"));
  registration.waiting = worker;
  worker.change("installed");
  expect(appUpdates.getState().waiting).toBe(true);
  expect(worker.postMessage).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({
    type: "SKIP_WAITING",
  });
  expect(win.location.reload).not.toHaveBeenCalled();
  registration.waiting = undefined;
  registration.active = worker;
  worker.change("activated");
  serviceWorker.controller = worker;
  serviceWorker.dispatchEvent(new Event("controllerchange"));
  expect(win.location.reload).toHaveBeenCalledOnce();
});
it("does not reload on first installation", async () => {
  const { registration, appUpdates, win } = await setup(false);
  const worker = new Worker();
  registration.installing = worker;
  registration.dispatchEvent(new Event("updatefound"));
  worker.change("installed");
  registration.active = worker;
  worker.change("activated");
  await vi.advanceTimersByTimeAsync(20_000);
  expect(appUpdates.getState().waiting).toBe(false);
  expect(win.location.reload).not.toHaveBeenCalled();
});
it("checks on resume, focus, reconnect and every five minutes, but not while hidden", async () => {
  const { registration, doc, win, serviceWorker } = await setup();
  registration.update.mockClear();
  doc.visibilityState = "hidden";
  win.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  expect(registration.update).not.toHaveBeenCalled();
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(registration.update).toHaveBeenCalledTimes(1);
  win.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(0);
  expect(registration.update).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(registration.update).toHaveBeenCalledTimes(3);
  expect(serviceWorker.register).toHaveBeenCalledOnce();
});
it("turns obsolete lazy chunks into an update notice rather than reloading the same build", async () => {
  const { win, appUpdates } = await setup();
  const event = new Event("vite:preloadError", { cancelable: true });
  win.dispatchEvent(event);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(event.defaultPrevented).toBe(true);
  expect(appUpdates.getState().required).toBe(true);
  expect(win.location.reload).not.toHaveBeenCalled();
});
it("keeps an already waiting worker observable until another tab activates it", async () => {
  const { registration, serviceWorker, appUpdates, win, doc } = await setup();
  doc.querySelector.mockReturnValue({} as never);
  const worker = new Worker();
  registration.installing = worker;
  registration.dispatchEvent(new Event("updatefound"));
  registration.waiting = worker;
  worker.change("installed");
  registration.active = worker;
  registration.waiting = undefined;
  worker.change("activated");
  serviceWorker.controller = worker;
  serviceWorker.dispatchEvent(new Event("controllerchange"));
  await vi.advanceTimersByTimeAsync(20_000);
  expect(win.location.reload).not.toHaveBeenCalled();
  doc.querySelector.mockReturnValue(null);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(appUpdates.getState().ready).toBe(true);
  expect(win.location.reload).toHaveBeenCalledOnce();
});
