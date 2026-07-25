import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { WORKSPACES, isAppMode } = await server.ssrLoadModule("/src/lib/workspaces.ts");
  const ids = WORKSPACES.map(({ id }) => id);

  assert.deepEqual(ids, ["flash", "rtt", "serial", "log-analysis", "bluetooth", "control-panel", "debug"]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(
    WORKSPACES.every(({ label, shortLabel }) => label && shortLabel),
    true
  );
  assert.equal(isAppMode("log-analysis"), true);
  assert.equal(isAppMode("unknown"), false);

  const { WORKSPACE_BY_MODE, WORKSPACE_REGISTRY } = await server.ssrLoadModule(
    "/src/components/modes/workspaceRegistry.tsx"
  );
  assert.deepEqual(
    WORKSPACE_REGISTRY.map(({ id }) => id),
    ids
  );
  assert.equal(
    ids.every(
      (id) => WORKSPACE_BY_MODE[id]?.navigationIcon && WORKSPACE_BY_MODE[id]?.headerIcon && WORKSPACE_BY_MODE[id]?.view
    ),
    true
  );

  console.log("工作台注册信息检查通过");
} finally {
  await server.close();
}
