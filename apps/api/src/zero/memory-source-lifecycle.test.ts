import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it.each([
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
  "packages/database/Dockerfile",
])("copies dependency patches before frozen installs in %s", (file) => {
  const source = readFileSync(
    new URL(`../../../../${file}`, import.meta.url),
    "utf8",
  );
  expect(source.indexOf("COPY patches patches")).toBeGreaterThan(-1);
  expect(source.indexOf("COPY patches patches")).toBeLessThan(
    source.indexOf("RUN pnpm install"),
  );
});

// Exercise the installed dependency, not a copy of its implementation. A child
// process gives WeakRef collection a real GC boundary without changing Vitest.
it("releases disconnected Zero pipelines while leaving live outputs operational", () => {
  const entry = createRequire(import.meta.url).resolve("@rocicorp/zero");
  const root = entry.slice(0, entry.lastIndexOf("/out/"));
  const moduleURL = pathToFileURL(
    `${root}/out/zql/src/ivm/memory-source.js`,
  ).href;
  const result = execFileSync(
    process.execPath,
    [
      "--expose-gc",
      "--input-type=module",
      "-e",
      `
    import {MemorySource} from ${JSON.stringify(moduleURL)};
    import {setTimeout as delay} from 'node:timers/promises';
    const source = new MemorySource('test', {id: {type: 'string'}, rank: {type: 'number'}}, ['id']);
    function disconnected(sort) {
      const connection = source.connect(sort);
      const output = {*push() {throw Error('Disposed output received a push');}};
      const weak = new WeakRef(output);
      connection.setOutput(output);
      [...connection.fetch({})];
      connection.destroy();
      return weak;
    }
    const disposed = [disconnected([['id','asc']]), disconnected([['rank','asc'],['id','asc']])];
    let pushes = 0;
    const live = source.connect([['id','asc']]);
    live.setOutput({*push() {pushes++;}});
    [...live.fetch({})];
    for(let i=0;i<8;i++) {await delay(10); globalThis.gc();}
    if(disposed.some(ref => ref.deref() !== undefined)) throw Error('Disconnected pipeline retained by source index');
    [...source.push([0, {id: 'row', rank: 1}, null])];
    if(pushes !== 1) throw Error('Live connection stopped receiving updates');
    if(source.getIndexKeys().length < 1) throw Error('Source was not kept alive');
    live.destroy();
    console.log('collected; live updates preserved');
  `,
    ],
    { encoding: "utf8", timeout: 15_000 },
  );
  expect(result).toContain("collected; live updates preserved");
});
