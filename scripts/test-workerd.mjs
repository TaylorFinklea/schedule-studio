import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const wrangler = join(root, "node_modules/.bin/wrangler");
const statePath = mkdtempSync(join(tmpdir(), "schedule-studio-workerd-"));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with status ${code}`));
    });
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("Could not allocate a local port"));
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

let worker;
try {
  await run(wrangler, [
    "d1",
    "migrations",
    "apply",
    "schedule-studio",
    "--local",
    "--persist-to",
    statePath,
  ]);

  const port = await availablePort();
  worker = spawn(
    wrangler,
    [
      "dev",
      "tests/workerd/db-worker.ts",
      "--config",
      "wrangler.jsonc",
      "--persist-to",
      statePath,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: root, stdio: "inherit" },
  );

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline && worker.exitCode === null) {
    try {
      const response = await fetch(`${url}/ready`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Wrangler is still starting; retry until its bounded startup deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready)
    throw new Error(
      "Workerd test Worker did not become ready within 30 seconds",
    );

  const response = await fetch(`${url}/run`, { method: "POST" });
  const evidence = await response.json();
  if (!response.ok)
    throw new Error(`Workerd D1 checks failed: ${JSON.stringify(evidence)}`);
  console.log("Workerd D1 checks passed:", JSON.stringify(evidence));
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill("SIGINT");
    await waitForExit(worker);
  }
  rmSync(statePath, { recursive: true, force: true });
}
