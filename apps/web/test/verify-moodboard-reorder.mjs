import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createServer } from "vite";
import config from "./moodboard-reorder/vite.config.mjs";

async function until(check, label) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const result = await check();

    if (result) {
      return result;
    }

    await wait(25);
  }

  throw new Error(`Timed out: ${label}`);
}

async function chromePath() {
  for (const path of [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (!path) {
      continue;
    }

    try {
      await access(path);

      return path;
    } catch {
      // Try the next installed browser; never download a browser implicitly.
    }
  }

  throw new Error("Chrome is required; set CHROME_BIN to its executable path.");
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);

    if (request) {
      clearTimeout(request.timeout);
      pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)));
      } else {
        request.resolve(message.result);
      }
    }
  });

  return {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`CDP timed out: ${method}`));
        }, 15_000);
        pending.set(requestId, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    close() {
      for (const request of pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error("Browser test ended"));
      }

      pending.clear();
      socket.close();
    },
  };
}

const profile = await mkdtemp(join(tmpdir(), "home-hub-moodboard-"));
let server;
let chrome;
let client;

try {
  server = await createServer({ ...config, configFile: false });
  await server.listen();

  const address = server.httpServer.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  chrome = spawn(
    await chromePath(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      // CI runs trusted local fixture code in a disposable browser profile.
      ...(process.env.CI ? ["--no-sandbox"] : []),
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  chrome.on("error", (error) => {
    console.error(error);
  });

  const port = await until(async () => {
    try {
      return Number(
        (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
          "\n",
        )[0],
      );
    } catch {
      return false;
    }
  }, "Chrome debugging port");
  const pages = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  client = await connect(
    pages.find((page) => page.type === "page").webSocketDebuggerUrl,
  );
  await client.call("Page.enable");
  await client.call("Runtime.enable");

  async function evaluate(expression) {
    const result = await client.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    }

    return result.result.value;
  }

  async function watchMotion(sourceId, allowInstant = false) {
    await evaluate(`(() => {
      const motion = { active: true, allowInstant: ${allowInstant}, hold: false, jumps: [], canceled: [], ghostJumps: [] };
      window.moodboardMotion = motion;
      const previous = new Map();
      const seen = new WeakSet();
      let ghost;

      function sample() {
        if (!motion.active) {
          return;
        }

        for (const node of document.querySelectorAll('[data-moodboard-pin]:not([data-dnd-placeholder])')) {
          const id = node.dataset.moodboardPin;
          const rect = node.getBoundingClientRect();

          if (id === ${JSON.stringify(sourceId)}) {
            const feedback = document.querySelector('.moodboard-drag-overlay[data-dnd-dragging]')?.getBoundingClientRect() ?? rect;

            if (motion.hold && ghost && Math.hypot(feedback.x - ghost.x, feedback.y - ghost.y) > 4) {
              motion.ghostJumps.push(id);
            }

            ghost = feedback;
            continue;
          }

          // Error banners/scrolling can move the whole board legitimately.
          // Detect snaps between slots, relative to the board rather than page.
          const board = node.parentElement.getBoundingClientRect();
          const x = rect.x - board.x;
          const y = rect.y - board.y;
          const transitions = node.getAnimations().filter(animation => animation.playState === 'running' && animation.transitionProperty === 'translate');
          const old = previous.get(id);
          const animated = transitions.length > 0;

          if (old && !animated && !old.animated && Math.hypot(x - old.x, y - old.y) > 4) {
            motion.jumps.push({ id, distance: Math.round(Math.hypot(x - old.x, y - old.y)) });
          }

          previous.set(id, { x, y, animated });

          for (const animation of transitions) {
            if (seen.has(animation)) {
              continue;
            }

            seen.add(animation);
            const target = \`\${node.style.left}/\${node.style.top}\`;
            void animation.finished.catch(() => {
              // A changed target legitimately interrupts a tween. Reinserting a
              // tile must not cancel a tween whose target has not changed.
              if (motion.active && node.isConnected && node.style.translate === target) {
                motion.canceled.push(id);
              }
            });
          }
        }

        requestAnimationFrame(sample);
      }

      requestAnimationFrame(sample);
    })()`);
  }

  async function finishMotion() {
    const motion = await evaluate(`(() => {
      const motion = window.moodboardMotion;

      if (motion) {
        motion.active = false;
      }

      return motion;
    })()`);

    if (!motion) {
      return;
    }

    if (!motion.allowInstant) {
      assert.deepEqual(
        motion.jumps,
        [],
        "Every displaced peer must animate, not just one",
      );
    }

    assert.deepEqual(
      motion.canceled,
      [],
      "Drop/DOM reconciliation must not cancel in-flight peer transitions",
    );
    assert.deepEqual(
      motion.ghostJumps,
      [],
      "The dragged photo must stay still while the pointer is paused",
    );
  }

  async function healthy() {
    const errors = await evaluate("window.moodboardTest?.errors ?? []");
    assert.deepEqual(errors, [], `React crashed: ${JSON.stringify(errors)}`);
    await until(
      () =>
        evaluate(
          "[...document.querySelectorAll('[data-moodboard-pin]')].every(node => node.getAnimations().every(animation => animation.playState !== 'running')) && JSON.stringify([...document.querySelectorAll('[data-moodboard-pin]')].map(node => node.dataset.moodboardPin)) === JSON.stringify(window.moodboardTest.order())",
        ),
      "tile transitions and semantic DOM order settle",
    );

    const order = await evaluate("window.moodboardTest.order()");
    const actual = await evaluate(
      "[...document.querySelectorAll('[data-moodboard-pin]')].map(node => node.dataset.moodboardPin)",
    );
    assert.deepEqual(
      actual,
      order,
      "DOM must reflect optimistic, confirmed or rolled-back query order",
    );
    assert.equal(
      new Set(actual).size,
      actual.length,
      "No duplicate pin or leftover drag placeholder",
    );

    const geometry = await evaluate(`(() => {
      const board = document.querySelector('[aria-label="Moodboard media"]');
      return { bounds: board.getBoundingClientRect().toJSON(), tiles: [...board.children].filter(node => node.hasAttribute("data-moodboard-pin")).map(node => node.getBoundingClientRect().toJSON()) };
    })()`);

    for (const tile of geometry.tiles) {
      assert(
        tile.left >= geometry.bounds.left - 1 &&
          tile.right <= geometry.bounds.right + 1,
        "Tiles stay within board width",
      );
      assert(
        tile.top >= geometry.bounds.top - 1 &&
          tile.bottom <= geometry.bounds.bottom + 1,
        "Board height encloses every tile",
      );
    }

    for (const [index, tile] of geometry.tiles.entries()) {
      for (const other of geometry.tiles.slice(index + 1)) {
        const overlapX =
          Math.min(tile.right, other.right) - Math.max(tile.left, other.left);
        const overlapY =
          Math.min(tile.bottom, other.bottom) - Math.max(tile.top, other.top);
        assert(
          overlapX <= 1 || overlapY <= 1,
          "Masonry tiles must not overlap",
        );
      }
    }

    assert.equal(
      await evaluate(
        "document.querySelector('.moodboard-drag-overlay[data-dnd-dragging]') === null",
      ),
      true,
      "No floating image remains after the drag",
    );
    assert(
      await evaluate(
        "[...document.querySelectorAll('[data-moodboard-pin]')].every(node => getComputedStyle(node).opacity === '1')",
      ),
      "Every original photo is visible again after drop, cancellation or rollback",
    );
    await finishMotion();
  }

  async function open(width = 1280, { count = 9, uniform = false } = {}) {
    await client.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await client.call("Page.navigate", { url: base });
    await until(
      () =>
        evaluate(
          "document.querySelectorAll('[data-moodboard-pin]').length === 9",
        ),
      "fixture pins",
    );
    await evaluate(
      `window.moodboardTest.configure(${count}, ${uniform}); true`,
    );
    await until(
      () =>
        evaluate(
          `document.querySelectorAll('[data-moodboard-pin]').length === ${count}`,
        ),
      "configured fixture pins",
    );
    await wait(150);
    await healthy();
  }

  async function key(key, code, virtualKey) {
    for (const type of ["keyDown", "keyUp"]) {
      await client.call("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode: virtualKey,
      });
    }

    await wait(100);
  }

  async function settled(count) {
    await until(async () => {
      assert.deepEqual(
        await evaluate("window.moodboardTest.errors"),
        [],
        "React error during reorder",
      );

      return await evaluate(
        `window.moodboardTest.mutations.length === ${count} && [...document.querySelectorAll('[data-moodboard-handle]')].every(button => !button.disabled)`,
      );
    }, "live optimistic reorder and server outcome");
    await wait(400);
    await healthy();
  }

  async function drag({
    touch = false,
    expectAnimation = true,
    sourceIndex = 0,
    targetIndex,
    hold = 0,
    reverse = false,
    requireInFlightDrop = false,
  } = {}) {
    let sawPeerAnimation = false;
    const requestsBefore = await evaluate(
      "window.moodboardTest.mutations.length",
    );
    const points = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll('[data-moodboard-pin]')];
      const source = nodes.at(${sourceIndex});
      const sourceBox = source.getBoundingClientRect();
      const target = ${targetIndex === undefined ? "nodes.find(node => Math.abs(node.getBoundingClientRect().left - sourceBox.left) > 40)" : `nodes.at(${targetIndex})`};
      const a = source.querySelector('[data-moodboard-handle]').getBoundingClientRect();
      const b = target.querySelector('[data-moodboard-handle]').getBoundingClientRect();
      return { id: source.dataset.moodboardPin, order: nodes.map(node => node.dataset.moodboardPin), offset: { x: a.x + a.width / 2 - sourceBox.x, y: a.y + a.height / 2 - sourceBox.y }, a: { x: a.x + a.width / 2, y: a.y + a.height / 2 }, b: { x: b.x + b.width / 2, y: b.y + b.height / 2 } };
    })()`);
    const { a, b } = points;
    await watchMotion(points.id, !expectAnimation);

    if (touch) {
      await client.call("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...a, id: 1 }],
      });
      await wait(330);
    } else {
      await client.call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...a,
      });
      await client.call("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...a,
        button: "left",
        clickCount: 1,
      });
    }

    const path = reverse ? [a, b, a, b] : [a, b];

    for (let step = 1; step <= 14 * (path.length - 1); step++) {
      const segment = Math.floor((step - 1) / 14);
      const from = path[segment];
      const to = path[segment + 1];
      const progress = (((step - 1) % 14) + 1) / 14;
      const point = {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      };
      await client.call(
        touch ? "Input.dispatchTouchEvent" : "Input.dispatchMouseEvent",
        touch
          ? { type: "touchMove", touchPoints: [{ ...point, id: 1 }] }
          : { type: "mouseMoved", ...point, button: "left", buttons: 1 },
      );
      await wait(25);

      const ghost = await evaluate(`(() => {
        const node = document.querySelector('.moodboard-drag-overlay[data-dnd-dragging]');
        if (!node) {
          return;
        }

        const original = document.querySelector('[data-moodboard-pin="${points.id}"]');
        return { ...node.getBoundingClientRect().toJSON(), opacity: getComputedStyle(node).opacity, originalOpacity: getComputedStyle(original).opacity };
      })()`);

      if (ghost) {
        assert.equal(
          ghost.opacity,
          "1",
          "The held photo must be solid, not translucent",
        );
        assert.equal(
          ghost.originalOpacity,
          "0",
          "Hide the original so only one photo is visible in hand",
        );
        assert(
          Math.hypot(
            ghost.x - (point.x - points.offset.x),
            ghost.y - (point.y - points.offset.y),
          ) < 3,
          `The dragged photo must track the grabbed point without jumping: ${JSON.stringify({ point, offset: points.offset, ghost })}`,
        );
      }

      sawPeerAnimation ||= await evaluate(`(() => {
        return [...document.querySelectorAll("[data-moodboard-pin]:not([data-dnd-placeholder])")].some(node => {
          if (node.dataset.moodboardPin === ${JSON.stringify(points.id)}) {
            return false;
          }

          const moving = node.getAnimations().some(animation => animation.playState === "running" && animation.transitionProperty === "translate");
          const current = getComputedStyle(node).translate.split(" ").map(parseFloat);
          const target = node.style.translate.split(" ").map(parseFloat);
          return moving && (Math.abs(current[0] - target[0]) > 1 || Math.abs((current[1] || 0) - (target[1] || 0)) > 1);
        });
      })()`);
    }

    assert.equal(
      await evaluate("window.moodboardTest.mutations.length"),
      requestsBefore,
      "Hover previews must not write mutations",
    );
    assert.equal(
      sawPeerAnimation,
      expectAnimation,
      expectAnimation
        ? "Neighbor tiles must visibly animate while hovering, before drop"
        : "Reduced motion must not animate neighbor tiles",
    );

    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('[data-moodboard-pin]:not([data-dnd-placeholder])')].map(node => node.dataset.moodboardPin)",
      ),
      points.order,
      "Keep DOM order stable during dragging, including backward moves",
    );

    if (hold) {
      await evaluate("window.moodboardMotion.hold = true; true");
      await wait(hold);
      await evaluate("window.moodboardMotion.hold = false; true");
    }

    if (requireInFlightDrop) {
      assert(
        await evaluate(
          "[...document.querySelectorAll('[data-moodboard-pin]:not([data-dnd-dragging]):not([data-dnd-placeholder])')].some(node => node.getAnimations().some(animation => animation.playState === 'running' && animation.transitionProperty === 'translate'))",
        ),
        "This case must drop before peer transitions finish",
      );
    }

    await client.call(
      touch ? "Input.dispatchTouchEvent" : "Input.dispatchMouseEvent",
      touch
        ? { type: "touchEnd", touchPoints: [] }
        : { type: "mouseReleased", ...b, button: "left", clickCount: 1 },
    );
  }

  await client.call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  // Recording regression: eight portrait photos; move a later photo backward.
  // The first-photo-forward case alone misses React moving the crossed peers.
  await open(1280, { count: 8, uniform: true });
  await drag({ sourceIndex: 5, targetIndex: 2, hold: 700 });
  await settled(1);
  await drag({
    sourceIndex: 7,
    targetIndex: 0,
    reverse: true,
    requireInFlightDrop: true,
  });
  await settled(2);
  await drag({ sourceIndex: 2, targetIndex: 6 });
  await settled(3);
  await drag({ sourceIndex: 3, targetIndex: 2 });
  await settled(4);
  const uniformConfirmed = await evaluate("window.moodboardTest.order()");
  await evaluate("window.moodboardTest.rejectNext(); true");
  await drag({ sourceIndex: 5, targetIndex: 1 });
  await settled(5);
  assert.deepEqual(
    await evaluate("window.moodboardTest.order()"),
    uniformConfirmed,
  );

  await open();
  await drag({ sourceIndex: 8, targetIndex: 0 });
  await settled(1);
  await drag({ sourceIndex: 5, targetIndex: 2 });
  await settled(2);

  await open();
  await drag();
  await settled(1);
  assert.notDeepEqual(
    await evaluate("window.moodboardTest.order()"),
    Array.from({ length: 9 }, (_, index) => `pin-${index}`),
  );
  await drag();
  await settled(2);

  await evaluate(
    "window.testNodes = new Map([...document.querySelectorAll('[data-moodboard-pin]')].map(node => [node.dataset.moodboardPin, node])); window.moodboardTest.append(); true",
  );
  await until(
    () =>
      evaluate(
        "document.querySelectorAll('[data-moodboard-pin]').length === 10",
      ),
    "live insert",
  );
  await healthy();
  await evaluate("window.moodboardTest.remove(); true");
  await until(
    () =>
      evaluate(
        "document.querySelectorAll('[data-moodboard-pin]').length === 9",
      ),
    "live removal",
  );
  await healthy();
  assert(
    await evaluate(
      "[...document.querySelectorAll('[data-moodboard-pin]')].every(node => window.testNodes.get(node.dataset.moodboardPin) === node)",
    ),
    "Other query updates must retain existing tile DOM identity",
  );

  const confirmed = await evaluate("window.moodboardTest.order()");
  await evaluate("window.moodboardTest.rejectNext(); true");
  await drag();
  await settled(3);
  assert.deepEqual(await evaluate("window.moodboardTest.order()"), confirmed);

  await open(1280, { count: 50 });
  await drag();
  await settled(1);

  await open(1280, { count: 8, uniform: true });
  await evaluate(
    "document.querySelector('[data-moodboard-pin=\"pin-5\"] [data-moodboard-handle]').focus(); true",
  );
  await watchMotion("pin-5");
  await key(" ", "Space", 32);
  await key("ArrowLeft", "ArrowLeft", 37);
  assert.equal(
    await evaluate(
      "document.querySelector('[data-moodboard-pin=pin-5] button').getAttribute('aria-label')",
    ),
    "Open image 4",
    "Left from the third column must preview the second column, not do nothing",
  );
  await key("ArrowRight", "ArrowRight", 39);
  assert.equal(
    await evaluate(
      "document.querySelector('[data-moodboard-pin=pin-5] button').getAttribute('aria-label')",
    ),
    "Open image 6",
    "Right must return the photo to its starting column",
  );
  await key("ArrowLeft", "ArrowLeft", 37);
  await key(" ", "Space", 32);
  await settled(1);
  assert(
    await evaluate(
      "document.activeElement?.closest('[data-moodboard-pin]')?.dataset.moodboardPin === 'pin-5'",
    ),
    "Backward keyboard moves retain focus after semantic ordering",
  );

  // Keep a peer tween alive beyond dnd-kit's own 250ms drop/focus cleanup.
  // Then change focus before our delayed semantic DOM reconciliation.
  await evaluate(
    "const timing = document.createElement('style'); timing.textContent = '[data-moodboard-pin]:not([data-dnd-dragging]) { transition-duration: 700ms !important; }'; document.head.append(timing); true",
  );
  await key(" ", "Space", 32);
  await key("ArrowRight", "ArrowRight", 39);
  await key(" ", "Space", 32);
  await wait(300);
  assert(
    await evaluate(
      "[...document.querySelectorAll('[data-moodboard-pin]')].some(node => node.getAnimations().some(animation => animation.playState === 'running'))",
    ),
    "Focus change must precede semantic DOM reconciliation",
  );
  await evaluate(
    "const outside = document.createElement('button'); outside.textContent = 'Outside board'; document.body.append(outside); outside.focus(); window.outsideFocus = outside; true",
  );
  await settled(2);
  assert(
    await evaluate("document.activeElement === window.outsideFocus"),
    "Delayed DOM ordering must not steal outside focus",
  );

  await open();
  await evaluate(
    "document.querySelector('[data-moodboard-handle]').focus(); true",
  );
  await watchMotion("pin-0");
  await key(" ", "Space", 32);
  await key("ArrowRight", "ArrowRight", 39);
  await key("ArrowLeft", "ArrowLeft", 37);
  await key("ArrowRight", "ArrowRight", 39);
  assert(
    await evaluate(
      "[...document.querySelectorAll('[data-moodboard-pin]:not([data-dnd-dragging])')].some(node => node.getAnimations().some(animation => animation.playState === 'running' && animation.transitionProperty === 'translate'))",
    ),
    "Keyboard preview must animate too",
  );
  await key(" ", "Space", 32);
  await settled(1);

  assert(
    await evaluate(
      "document.activeElement?.hasAttribute('data-moodboard-handle') && document.activeElement.closest('[data-moodboard-pin]')?.dataset.moodboardPin === window.moodboardTest.mutations[0].args.attachmentId",
    ),
    "Keyboard focus survives delayed semantic DOM moves",
  );

  const keyboardOrder = await evaluate("window.moodboardTest.order()");
  await watchMotion(
    await evaluate(
      "document.activeElement.closest('[data-moodboard-pin]').dataset.moodboardPin",
    ),
  );
  await key(" ", "Space", 32);
  await key("ArrowRight", "ArrowRight", 39);
  await key("Escape", "Escape", 27);
  await wait(500);
  await healthy();
  assert.deepEqual(
    await evaluate("window.moodboardTest.order()"),
    keyboardOrder,
  );
  assert.equal(await evaluate("window.moodboardTest.mutations.length"), 1);

  await evaluate(
    "window.testParents = new Map([...document.querySelectorAll('[data-moodboard-pin]')].map(node => [node.dataset.moodboardPin, node.parentElement])); true",
  );

  for (const width of [320, 390, 768, 1280, 2000]) {
    await client.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await wait(100);
    assert(
      await evaluate(
        "[...document.querySelectorAll('[data-moodboard-pin]')].every(node => node.parentElement === window.testParents.get(node.dataset.moodboardPin))",
      ),
      "Resizing must not reparent React-owned tiles",
    );
    // Linux may reserve scrollbar width; macOS typically uses overlay scrollbars.
    const dimensions = await evaluate(
      "({ scroll: document.documentElement.scrollWidth, available: document.documentElement.clientWidth })",
    );
    assert.equal(
      dimensions.scroll,
      dimensions.available,
      "No horizontal page overflow",
    );
    await healthy();
  }

  await open(390);
  await drag({ touch: true });
  await settled(1);
  await client.call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await open();
  await drag({ expectAnimation: false });
  await settled(1);

  console.log(
    "Moodboard browser regression passed: forward/backward/middle/last-item motion, eight-portrait recording case, paused pointer, in-flight drop, rollback, keyboard focus/reversal/cancel, touch, reduced motion, live updates, stable parents and 5 widths.",
  );
} finally {
  client?.close();

  if (chrome && chrome.exitCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([exited, wait(3000)]);

    if (chrome.exitCode === null) {
      chrome.kill("SIGKILL");
      await exited;
    }
  }

  await server?.close();
  // Chrome cache helpers can finish writes just after the browser exits.
  // Retry transient ENOTEMPTY/EBUSY races, but still fail if cleanup stays broken.
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
