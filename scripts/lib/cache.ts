// scripts/lib/cache.ts
// Tiny fs-backed JSON cache + sha1 helper used by every pipeline stage.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJsonCache<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeJsonCache<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeFileBuffer(filePath: string, data: Buffer): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, data);
}

export async function readFileBuffer(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

/**
 * Download a URL to a file (with cache). Returns the file path.
 * Skips fetch if the file already exists.
 */
export async function downloadCached(
  url: string,
  destPath: string,
  opts?: { force?: boolean; referer?: string }
): Promise<string> {
  if (!opts?.force && (await fileExists(destPath))) {
    return destPath;
  }
  await ensureDir(path.dirname(destPath));
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    Accept: "*/*",
  };
  if (opts?.referer) headers["Referer"] = opts.referer;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`downloadCached: ${url} -> HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
  return destPath;
}
