// 统一运行 scripts/check-*.{mjs,mts} 集成检查。
// 每个检查脚本是独立进程：一个失败不影响其余脚本继续跑完，便于一次看到全部问题。
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const root = path.resolve(scriptsDir, "..");

const entries = (await readdir(scriptsDir)).filter((name) => /^check-.+\.m[jt]s$/.test(name)).sort();

if (entries.length === 0) {
  console.error("没有找到任何 check-*.mjs / check-*.mts 脚本");
  process.exit(1);
}

function run(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    // .mts 直接 import .ts 源码，Node 22.6~23 需要显式开启类型擦除；
    // Node 24+ 已默认开启，但仍接受该 flag，所以统一带上最省事。
    const args = name.endsWith(".mts")
      ? ["--experimental-strip-types", "--no-warnings", path.join(scriptsDir, name)]
      : [path.join(scriptsDir, name)];
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (error) => {
      resolve({ name, ok: false, ms: Date.now() - started, output: String(error) });
    });
    child.on("close", (code) => {
      resolve({
        name,
        ok: code === 0,
        ms: Date.now() - started,
        output: `${stdout}${stderr}`.trim(),
      });
    });
  });
}

console.log(`运行 ${entries.length} 个集成检查...\n`);

const results = [];
for (const name of entries) {
  const result = await run(name);
  results.push(result);
  const status = result.ok ? "PASS" : "FAIL";
  console.log(`${status}  ${name.padEnd(44)} ${result.ms}ms`);
  if (!result.ok && result.output) {
    console.log(result.output.replace(/^/gm, "      "));
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);

if (failed.length > 0) {
  console.error(`失败：${failed.map((result) => result.name).join(", ")}`);
  process.exit(1);
}
