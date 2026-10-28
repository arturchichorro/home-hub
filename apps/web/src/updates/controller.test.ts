import { describe, expect, it, vi } from "vitest";
import { createUpdateController } from "./controller";

function setup() {
  const flags = {
    now: 0,
    blocked: false,
    focused: false,
    visible: true,
    online: true,
  };
  const activate = vi.fn(async () => {}),
    reload = vi.fn(),
    check = vi.fn(async () => {});
  const controller = createUpdateController({
    now: () => flags.now,
    blocked: () => flags.blocked,
    focused: () => flags.focused,
    visible: () => flags.visible,
    online: () => flags.online,
    activate,
    reload,
    check,
  });
  return { controller, flags, activate, reload, check };
}
describe("safe PWA updates", () => {
  it("activates downloaded updates after ten quiet seconds, then reloads exactly once", async () => {
    const { controller, flags, activate, reload } = setup();
    controller.waiting();
    expect(activate).not.toHaveBeenCalled();
    flags.now = 10_000;
    controller.tick();
    expect(activate).toHaveBeenCalledOnce();
    controller.tick();
    expect(activate).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    controller.ready();
    controller.ready();
    controller.tick();
    expect(reload).toHaveBeenCalledOnce();
  });
  it.each(["blocked", "focused", "offline", "hidden"] as const)(
    "never automatically updates when %s",
    (reason) => {
      const { controller, flags, activate, reload } = setup();
      flags.now = 10_000;
      if (reason === "blocked") flags.blocked = true;
      if (reason === "focused") flags.focused = true;
      if (reason === "offline") flags.online = false;
      if (reason === "hidden") flags.visible = false;
      controller.waiting();
      controller.tick();
      expect(activate).not.toHaveBeenCalled();
      controller.ready();
      expect(reload).not.toHaveBeenCalled();
    },
  );
  it("resets the idle timer on interaction and resumes after a draft/save/upload finishes", () => {
    const { controller, flags, activate } = setup();
    controller.waiting();
    flags.now = 9_000;
    controller.interaction();
    flags.now = 10_000;
    controller.tick();
    expect(activate).not.toHaveBeenCalled();
    flags.blocked = true;
    flags.now = 20_000;
    controller.tick();
    expect(activate).not.toHaveBeenCalled();
    flags.blocked = false;
    controller.tick();
    expect(activate).toHaveBeenCalledOnce();
  });
  it("protects drafts if a different tab activates the worker", () => {
    const { controller, flags, reload } = setup();
    flags.blocked = true;
    flags.now = 20_000;
    controller.ready();
    expect(reload).not.toHaveBeenCalled();
    flags.blocked = false;
    controller.tick();
    expect(reload).toHaveBeenCalledOnce();
  });
  it("rechecks safety at activation time, even after a safe manual update started", async () => {
    const { controller, flags, activate, reload } = setup();
    controller.waiting();
    await controller.update();
    expect(activate).toHaveBeenCalledOnce();
    flags.blocked = true;
    controller.ready();
    expect(reload).not.toHaveBeenCalled();
    flags.blocked = false;
    flags.now = 10_000;
    controller.tick();
    expect(reload).toHaveBeenCalledOnce();
  });
  it("requires explicit confirmation to abandon unsaved work", async () => {
    const { controller, flags, activate, reload } = setup();
    flags.blocked = true;
    controller.waiting();
    await controller.update();
    expect(activate).not.toHaveBeenCalled();
    await controller.update(true);
    expect(activate).toHaveBeenCalledOnce();
    controller.ready();
    expect(reload).toHaveBeenCalledOnce();
  });
  it("does not reload-loop when Zero requires an update but no new worker exists", async () => {
    const { controller, flags, reload, activate, check } = setup();
    flags.now = 30_000;
    controller.require();
    controller.tick();
    await controller.update();
    expect(controller.getState().required).toBe(true);
    expect(check).toHaveBeenCalledTimes(2);
    expect(activate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it("keeps offline checks silent and allows retry after activation errors", async () => {
    const { controller, flags, activate, reload, check } = setup();
    flags.online = false;
    await controller.check();
    expect(check).not.toHaveBeenCalled();
    flags.online = true;
    activate.mockRejectedValueOnce(new Error("network"));
    controller.waiting();
    await controller.update();
    expect(controller.getState().error).toContain("Try again");
    controller.tick();
    expect(activate).toHaveBeenCalledOnce();
    await controller.update();
    controller.ready();
    expect(reload).toHaveBeenCalledOnce();
  });
  it("reloads unsupported/development clients only on explicit request", async () => {
    const { controller, flags, reload } = setup();
    flags.now = 30_000;
    controller.reloadOnly();
    controller.require();
    controller.tick();
    expect(reload).not.toHaveBeenCalled();
    await controller.update();
    expect(reload).toHaveBeenCalledOnce();
  });
});
