import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import express from "express";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.DINNER_SPINNER_PASSWORD;
const COOKIE_SECRET = process.env.COOKIE_SECRET || PASSWORD;
const DB_PATH = path.resolve(ROOT, process.env.DB_PATH || "data/dinner-spinner.sqlite");
const COOKIE = "dinner_spinner_auth";
const IS_PRODUCTION = ["1", "true", "yes"].includes(String(process.env.DINNER_SPINNER_PRODUCTION || "").toLowerCase());

if (!PASSWORD) {
  console.error("Set DINNER_SPINNER_PASSWORD before starting Dinner Spinner.");
  process.exit(1);
}

const demoMeals = [
  ["Beef cottage pie", ["protein:beef", "carb:potato", "bake", "comfort"]],
  ["Chicken schnitzel bowls", ["protein:chicken", "carb:rice", "crunchy", "quick"]],
  ["Pork tacos", ["protein:pork", "carb:tortilla", "fresh", "fast"]],
  ["Salmon tray bake", ["protein:fish", "carb:potato", "tray-bake", "lighter"]],
  ["Lentil bolognese", ["protein:vegetarian", "carb:pasta", "sauce", "batch"]],
  ["Beef burgers", ["protein:beef", "carb:bread", "weekend", "grill"]],
  ["Butter chicken", ["protein:chicken", "carb:rice", "curry", "comfort"]],
  ["Sausage and mash", ["protein:pork", "carb:potato", "comfort", "quick"]],
  ["Prawn fried rice", ["protein:seafood", "carb:rice", "wok", "quick"]],
  ["Halloumi salad wraps", ["protein:vegetarian", "carb:wrap", "fresh", "lighter"]],
  ["Steak and chips", ["protein:beef", "carb:potato", "simple", "grill"]],
  ["Chicken pesto pasta", ["protein:chicken", "carb:pasta", "quick", "sauce"]],
  ["Black bean nachos", ["protein:vegetarian", "carb:corn", "sharing", "fast"]],
  ["Teriyaki salmon rice", ["protein:fish", "carb:rice", "sweet", "fast"]],
  ["Lamb kofta plates", ["protein:lamb", "carb:flatbread", "grill", "fresh"]]
];

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tags TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const rowToMeal = (row) => ({ id: row.id, name: row.name, tags: JSON.parse(row.tags) });
const normalizeTag = (tag) => String(tag || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/,+/g, "").slice(0, 40);
const normalizeTags = (tags) => [...new Set((Array.isArray(tags) ? tags : []).map(normalizeTag).filter(Boolean))];
const normalizeName = (name) => String(name || "").trim().slice(0, 120);
const listMeals = () => db.prepare("SELECT id, name, tags FROM meals ORDER BY sort_order, name").all().map(rowToMeal);

const replaceMeals = db.transaction((meals) => {
  db.prepare("DELETE FROM meals").run();
  const insert = db.prepare("INSERT INTO meals (id, name, tags, sort_order) VALUES (?, ?, ?, ?)");
  meals.forEach((meal, index) => insert.run(meal.id || crypto.randomUUID(), meal.name, JSON.stringify(meal.tags), index));
});

const seedDemo = () => replaceMeals(demoMeals.map(([name, tags]) => ({ id: crypto.randomUUID(), name, tags: normalizeTags(tags) })));
if (db.prepare("SELECT COUNT(*) AS count FROM meals").get().count === 0) {
  seedDemo();
}

const sign = (value) => crypto.createHmac("sha256", COOKIE_SECRET).update(value).digest("base64url");
const authToken = () => `ok.${sign("ok")}`;
const parseCookies = (header = "") => Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key]) => key));
const isAuthed = (req) => parseCookies(req.headers.cookie)[COOKIE] === authToken();
const cookieOptions = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 365}`;

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false }));

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "not_authenticated" });
  return res.redirect("/login");
}

app.get("/login", (req, res) => {
  if (isAuthed(req)) return res.redirect("/");
  res.type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dinner Spinner Login</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef2e8;color:#17212b;font-family:system-ui,sans-serif}form{width:min(360px,calc(100vw - 32px));display:grid;gap:14px;padding:22px;background:#fff;border:1px solid #d8ddd7;border-radius:8px;box-shadow:0 16px 40px #1c222626}h1{margin:0;font-size:1.7rem}input,button{height:46px;border-radius:8px;font:inherit}input{border:1px solid #bdc7bf;padding:0 12px}button{border:0;background:#0f7c7b;color:#fff;font-weight:850}.error{color:#b33a3a;font-weight:750}</style></head><body><form method="post" action="/login"><h1>Dinner Spinner</h1>${req.query.error ? `<div class="error">Wrong password.</div>` : ""}<input name="password" type="password" placeholder="Password" autofocus required><button>Unlock</button></form></body></html>`);
});

app.post("/login", (req, res) => {
  const provided = String(req.body.password || "");
  if (provided !== PASSWORD) return res.redirect("/login?error=1");
  res.setHeader("Set-Cookie", `${COOKIE}=${authToken()}; ${cookieOptions}`);
  return res.redirect("/");
});

app.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.redirect("/login");
});

app.get("/api/meals", requireAuth, (req, res) => res.json({ meals: listMeals() }));

app.get("/api/config", requireAuth, (req, res) => res.json({ isProduction: IS_PRODUCTION }));

app.post("/api/meals", requireAuth, (req, res) => {
  const name = normalizeName(req.body.name);
  if (!name) return res.status(400).json({ error: "name_required" });
  const meal = { id: crypto.randomUUID(), name, tags: normalizeTags(req.body.tags) };
  const nextOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM meals").get().value;
  db.prepare("INSERT INTO meals (id, name, tags, sort_order) VALUES (?, ?, ?, ?)").run(meal.id, meal.name, JSON.stringify(meal.tags), nextOrder);
  res.status(201).json({ meal });
});

app.put("/api/meals/:id", requireAuth, (req, res) => {
  const name = normalizeName(req.body.name);
  if (!name) return res.status(400).json({ error: "name_required" });
  const info = db.prepare("UPDATE meals SET name = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(name, JSON.stringify(normalizeTags(req.body.tags)), req.params.id);
  if (!info.changes) return res.status(404).json({ error: "not_found" });
  res.json({ meal: rowToMeal(db.prepare("SELECT id, name, tags FROM meals WHERE id = ?").get(req.params.id)) });
});

app.delete("/api/meals/:id", requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM meals WHERE id = ?").run(req.params.id);
  res.status(info.changes ? 204 : 404).end();
});

app.delete("/api/meals", requireAuth, (req, res) => {
  db.prepare("DELETE FROM meals").run();
  res.status(204).end();
});

app.post("/api/demo-reset", requireAuth, (req, res) => {
  if (IS_PRODUCTION) return res.status(404).json({ error: "not_found" });
  seedDemo();
  res.json({ meals: listMeals() });
});

app.post("/api/import", requireAuth, (req, res) => {
  if (!Array.isArray(req.body.meals)) return res.status(400).json({ error: "meals_required" });
  const meals = req.body.meals.map((item) => ({ id: item.id || crypto.randomUUID(), name: normalizeName(item.name), tags: normalizeTags(item.tags) })).filter((item) => item.name);
  replaceMeals(meals);
  res.json({ meals: listMeals() });
});

app.get(["/", "/index.html"], requireAuth, (req, res) => res.sendFile(path.join(ROOT, "index.html")));
app.get("/styles.css", requireAuth, (req, res) => res.sendFile(path.join(ROOT, "styles.css")));
app.get("/app.js", requireAuth, (req, res) => res.sendFile(path.join(ROOT, "app.js")));
app.get("/manifest.webmanifest", requireAuth, (req, res) => res.sendFile(path.join(ROOT, "manifest.webmanifest")));
app.get("/sw.js", requireAuth, (req, res) => res.type("application/javascript").sendFile(path.join(ROOT, "sw.js")));
app.get("/icons/:file", requireAuth, (req, res) => res.sendFile(path.join(ROOT, "icons", path.basename(req.params.file))));

app.listen(PORT, () => {
  console.log(`Dinner Spinner listening on http://localhost:${PORT}`);
});
