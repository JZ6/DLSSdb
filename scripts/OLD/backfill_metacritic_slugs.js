#!/usr/bin/env node
/**
 * One-time backfill: find metacritic_slug for entries that have a score but no slug.
 * Tries slug variations against metacritic.com/game/{slug}/ and extracts ratingValue.
 */

import { join } from "path";
import { PUBLIC, loadJson, saveJson, nameVariations } from "../util.js";

const FILE = join(PUBLIC, "metacritic_data.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function toSlug(name) {
  return name.toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[':./!,()[\]&+]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function trySlug(slug) {
  const resp = await fetch(`https://www.metacritic.com/game/${slug}/`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  if (!resp.ok) return null;
  const html = await resp.text();
  const m = html.match(/"ratingValue"[:\s]*"?(\d+)"?/);
  return m ? slug : null;
}

async function findSlug(name) {
  const slugs = [...new Set(nameVariations(name).map(toSlug))];
  for (const slug of slugs) {
    const found = await trySlug(slug);
    if (found) return found;
  }
  return null;
}

const existing = loadJson(FILE);
const noSlug = Object.entries(existing).filter(([, v]) => !v.metacritic_slug);
console.log(`${noSlug.length} entries missing metacritic_slug`);

let found = 0;
const batchSize = 3;
for (let i = 0; i < noSlug.length; i += batchSize) {
  const batch = noSlug.slice(i, i + batchSize);
  await Promise.all(batch.map(async ([name], j) => {
    const idx = i + j;
    const slug = await findSlug(name);
    if (slug) {
      existing[name].metacritic_slug = slug;
      found++;
      console.log(`  [${idx + 1}/${noSlug.length}] ${name}: ${slug}`);
    } else {
      console.log(`  [${idx + 1}/${noSlug.length}] ${name}: not found`);
    }
  }));
}

saveJson(FILE, existing);
console.log(`Backfilled ${found}/${noSlug.length} slugs`);
