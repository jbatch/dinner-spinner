import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const port = await getFreePort();
const tempDir = mkdtempSync(join(tmpdir(), "dinner-spinner-"));
const password = "smoke-password";
const server = spawn(process.execPath, ["server.mjs"], {
  env: {
    ...process.env,
    DINNER_SPINNER_PASSWORD: password,
    COOKIE_SECRET: "smoke-cookie-secret",
    PORT: String(port),
    DB_PATH: join(tempDir, "smoke.sqlite")
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(port);
  await expectStatus(fetch(`http://127.0.0.1:${port}/api/meals`), 401);
  await expectStatus(fetch(`http://127.0.0.1:${port}/`, { redirect: "manual" }), 302);

  const login = await fetch(`http://127.0.0.1:${port}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `password=${encodeURIComponent(password)}`,
    redirect: "manual"
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("login did not set cookie");

  const home = await fetch(`http://127.0.0.1:${port}/`, { headers: { cookie } });
  if (!(await home.text()).includes("Dinner Spinner")) throw new Error("home page did not load");
  await expectStatus(fetch(`http://127.0.0.1:${port}/manifest.webmanifest`, { headers: { cookie } }), 200);
  await expectStatus(fetch(`http://127.0.0.1:${port}/sw.js`, { headers: { cookie } }), 200);
  await expectStatus(fetch(`http://127.0.0.1:${port}/icons/dinner-spinner-192.png`, { headers: { cookie } }), 200);

  const seeded = await jsonFetch(`/api/meals`, cookie);
  if (seeded.meals.length !== 15) throw new Error(`expected 15 seeded meals, got ${seeded.meals.length}`);

  const created = await fetch(`http://127.0.0.1:${port}/api/meals`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Smoke dinner", tags: ["protein:smoke", "carb:test"] })
  });
  if (created.status !== 201) throw new Error(`create failed: ${created.status}`);

  const afterCreate = await jsonFetch(`/api/meals`, cookie);
  if (!afterCreate.meals.some((meal) => meal.name === "Smoke dinner")) throw new Error("created meal missing");

  await expectStatus(fetch(`http://127.0.0.1:${port}/server.mjs`, { headers: { cookie } }), 404);
  console.log("smoke ok");
} finally {
  server.kill();
  rmSync(tempDir, { recursive: true, force: true });
}

async function jsonFetch(path, cookie) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { cookie } });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

async function expectStatus(promise, status) {
  const response = await promise;
  if (response.status !== status) throw new Error(`expected ${status}, got ${response.status}`);
}

async function waitForServer(portNumber) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${portNumber}/login`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(readServerOutput() || "server did not start");
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

function readServerOutput() {
  return [server.stdout.read(), server.stderr.read()].filter(Boolean).join("\n");
}
