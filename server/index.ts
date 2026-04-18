// server/index.ts
//
// Lightweight Express backend that:
//   1. Serves the Vite-built static files (dist/)
//   2. Proxies AI requests to chunfeng (OpenAI-compatible) with the key
//      stored server-side in .env — never exposed to the browser.

import path from "path";
import express from "express";
import cors from "cors";
import { OpenAI } from "openai";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Database + route handlers
import "./db.js"; // initializes SQLite on import
import profilesRouter from "./routes/profiles.js";
import syncRouter from "./routes/sync.js";

// Load .env from server/ directory
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env") });

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// ---------------------------------------------------------------------------
// AI provider config (from .env)
// ---------------------------------------------------------------------------

const AI_BASE_URL = process.env.AI_BASE_URL || "https://chunfeng.mentalout.top/v1";
const AI_MODEL = process.env.AI_MODEL || "gpt-5.1-codex-mini";
const AI_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
const AI_EFFORT = (process.env.AI_REASONING_EFFORT || "low") as "low" | "medium" | "high";

if (!AI_KEY) {
  console.warn("[server] WARNING: No AI_API_KEY set in .env — /api/ai/generate will fail");
}

const openai = new OpenAI({
  apiKey: AI_KEY,
  baseURL: AI_BASE_URL,
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json({ limit: "2mb" })); // larger limit for snapshot imports

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Profile CRUD + sync routes
// ---------------------------------------------------------------------------

app.use("/api/profiles", profilesRouter);
app.use("/api/profiles", syncRouter);

// ---------------------------------------------------------------------------
// API: AI generate (proxies to chunfeng / OpenAI-compatible endpoint)
// ---------------------------------------------------------------------------

interface GenerateRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

app.post("/api/ai/generate", async (req, res) => {
  if (!AI_KEY) {
    res.status(503).json({ error: "AI API key not configured on server" });
    return;
  }

  const { system, prompt, maxTokens } = req.body as GenerateRequest;
  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,
      instructions: system || "You are a JSON generator. Respond with VALID JSON ONLY.",
      input: prompt,
      reasoning: { effort: AI_EFFORT },
      store: false,
      max_output_tokens: maxTokens ?? 1500,
    } as Parameters<typeof openai.responses.create>[0]);

    // Extract text from response
    let text = "";
    if ("output_text" in response && typeof response.output_text === "string") {
      text = response.output_text;
    } else if (Array.isArray(response.output)) {
      for (const block of response.output) {
        if (block.type === "message" && Array.isArray(block.content)) {
          for (const part of block.content) {
            if (part.type === "output_text" && typeof part.text === "string") {
              text += part.text;
            }
          }
        }
      }
    }

    res.json({ text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[server] AI generate error:", message);
    res.status(502).json({ error: "AI generation failed", detail: message });
  }
});

// ---------------------------------------------------------------------------
// Static files (Vite build output)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");
app.use(express.static(distDir, { maxAge: "1y", immutable: true }));

// data files — shorter cache
app.use("/data", express.static(path.join(distDir, "data"), { maxAge: "1h" }));

// SPA fallback: any non-API, non-file route → index.html
// Express 5 uses path-to-regexp v8 which requires {*path} instead of *
app.get("{*path}", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[server] AI provider: ${AI_BASE_URL} model=${AI_MODEL}`);
  console.log(`[server] Static dir: ${distDir}`);
});
