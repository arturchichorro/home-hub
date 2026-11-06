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

  async function healthy() {
    const errors = await evaluate("window.moodboardTest?.errors ?? []");
    assert.deepEqual(errors, [], `React crashed: ${JSON.stringify(errors)}`);
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

    await until(
      () =>
        evaluate(
          "[...document.querySelectorAll('[data-moodboard-pin]')].every(node => node.getAnimations().every(animation => animation.playState !== 'running'))",
        ),
      "tile transitions settle",
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
  }

  async function open(width = 1280) {
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
    await wait(150);
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

  async function drag(touch = false, expectAnimation = true) {
    let sawPeerAnimation = false;
    const requestsBefore = await evaluate(
      "window.moodboardTest.mutations.length",
    );
    const points = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll('[data-moodboard-pin]')];
      const source = nodes[0];
      const sourceBox = source.getBoundingClientRect();
      const target = nodes.find(node => Math.abs(node.getBoundingClientRect().left - sourceBox.left) > 40);
      const a = source.querySelector('[data-moodboard-handle]').getBoundingClientRect();
      const b = target.getBoundingClientRect();
      return { a: { x: a.x + a.width / 2, y: a.y + a.height / 2 }, b: { x: b.x + b.width / 2, y: b.y + 40 } };
    })()`);
    const { a, b } = points;

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

    for (let step = 1; step <= 14; step++) {
      const point = {
        x: a.x + ((b.x - a.x) * step) / 14,
        y: a.y + ((b.y - a.y) * step) / 14,
      };
      await client.call(
        touch ? "Input.dispatchTouchEvent" : "Input.dispatchMouseEvent",
        touch
          ? { type: "touchMove", touchPoints: [{ ...point, id: 1 }] }
          : { type: "mouseMoved", ...point, button: "left", buttons: 1 },
      );
      await wait(25);

      sawPeerAnimation ||= await evaluate(`(() => {
        return [...document.querySelectorAll("[data-moodboard-pin]:not([data-dnd-dragging]):not([data-dnd-placeholder])")].some(node => {
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

  await open();
  await evaluate(
    "document.querySelector('[data-moodboard-handle]').focus(); true",
  );
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

  const keyboardOrder = await evaluate("window.moodboardTest.order()");
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
  await drag(true);
  await settled(1);
  await client.call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await open();
  await drag(false, false);
  await settled(1);

  console.log(
    "Moodboard browser regression passed: animated live preview, reduced motion, live optimistic cross-column moves, repeat, rollback, keyboard/drop/cancel, touch, stable parents and 5 widths.",
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
