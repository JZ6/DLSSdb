#!/usr/bin/env python3
"""
Update DLSSdb data sources: DLSS games, Steam reviews, HLTB times, and Metacritic scores.

Data source: https://www.nvidia.com/en-us/geforce/news/nvidia-rtx-games-engines-apps/

Usage:
  python scripts/update_data.py --all              # update all sources
  python scripts/update_data.py --steam            # update Steam reviews only
  python scripts/update_data.py --hltb             # update HLTB times only
  python scripts/update_data.py --metacritic       # update Metacritic (Steam API + direct scrape)
  python scripts/update_data.py --dlss             # update NVIDIA DLSS list
  python scripts/update_data.py --backfill         # backfill appid + metadata for Steam entries
  python scripts/update_data.py --backfill-total   # backfill total review counts
  python scripts/update_data.py --steam --limit 10 # update 10 missing Steam entries
  python scripts/update_data.py --test 6           # test with 6 random games
"""

import argparse
import asyncio
import json
import random
import re
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

DLSS_FILE = PUBLIC / "dlss-rt-games-apps-overrides.json"
STEAM_FILE = PUBLIC / "steam_data.json"
HLTB_FILE = PUBLIC / "hltb_data.json"
METACRITIC_FILE = PUBLIC / "metacritic_data.json"
UPSCALING_FILE = PUBLIC / "upscaling_data.json"

# Rate limit delays (seconds)
RATE_FAST = 0.3    # Steam search/reviews API
RATE_NORMAL = 0.5  # Steam appdetails, PCGamingWiki, web search
RATE_SLOW = 0.8    # Metacritic scraping (be polite)

UA_BOT = "DLSSdb/1.0"
UA_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

# Steam review categories from their API
STEAM_RATING_MAP = {
    "Overwhelmingly Positive": "Overwhelmingly Positive",
    "Very Positive": "Very Positive",
    "Positive": "Positive",
    "Mostly Positive": "Mostly Positive",
    "Mixed": "Mixed",
    "Mostly Negative": "Mostly Negative",
    "Negative": "Negative",
    "Very Negative": "Very Negative",
    "Overwhelmingly Negative": "Very Negative",
}


def load_json(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


def save_json(path: Path, data: dict):
    tmp = path.with_suffix(".tmp")
    try:
        with open(tmp, "w") as f:
            json.dump(dict(sorted(data.items())), f, indent=2, ensure_ascii=False)
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    print(f"  Saved {len(data)} entries to {path.name}")


def fetch_json(url: str, headers: dict | None = None, timeout: int = 10) -> dict | None:
    """Fetch URL and parse JSON. Returns None on error."""
    hdrs = headers or {"User-Agent": UA_BOT}
    try:
        req = urllib.request.Request(url, headers=hdrs)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"    [warn] {e}")
        return None


def fetch_text(url: str, headers: dict | None = None, timeout: int = 10) -> str | None:
    """Fetch URL and return decoded text. Returns None on error."""
    hdrs = headers or {"User-Agent": UA_BROWSER}
    try:
        req = urllib.request.Request(url, headers=hdrs)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError:
        return None
    except Exception as e:
        print(f"    [warn] {e}")
        return None


def get_game_names() -> list[str]:
    """Extract game names from the DLSS JSON."""
    data = load_json(DLSS_FILE)
    return [str(e["name"]) for e in data.get("data", []) if e.get("type") == "Game"]


def name_to_metacritic_slug(name: str) -> str:
    """Convert game name to Metacritic URL slug."""
    s = name.lower()
    s = re.sub(r'[™®©]', '', s)
    s = re.sub(r"[':./!,\(\)\[\]&+]", '', s)
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s-]+', '-', s).strip('-')
    return s


def name_variations(name: str) -> list[str]:
    """Generate search variations for a game name."""
    variations = [name]
    # Strip parentheticals: "System Shock (2023)" -> "System Shock"
    stripped = re.sub(r'\s*\(.*?\)\s*$', '', name).strip()
    if stripped != name:
        variations.append(stripped)
    # Strip after colon
    if ':' in name:
        first = name.split(':')[0].strip()
        if len(first) > 3:
            variations.append(first)
    # Strip after dash
    if ' - ' in name:
        first = name.split(' - ')[0].strip()
        if len(first) > 3:
            variations.append(first)
    # Remove common suffixes
    for suffix in ['Enhanced', 'Remastered', 'Definitive Edition', "Director's Cut",
                   'Complete Edition', 'RTX Version', 'PC Enhanced Edition', 'Evolved Edition',
                   'Enhanced Edition', '2.0 Edition']:
        cleaned = name.replace(suffix, '').strip().rstrip(':').rstrip('-').strip()
        if cleaned != name and len(cleaned) > 3:
            variations.append(cleaned)
    # Dedupe preserving order
    return list(dict.fromkeys(variations))


# --- DLSS ---

def update_dlss():
    """Try to download the NVIDIA DLSS JSON."""
    url = "https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/news/nvidia-rtx-games-engines-apps/dlss-rt-games-apps-overrides.json"
    print("Updating DLSS data...")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://www.nvidia.com/en-us/geforce/news/nvidia-rtx-games-engines-apps/",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            if len(raw) < 10000:
                print(f"  WARNING: NVIDIA returned a truncated file ({len(raw)} bytes).")
                print("  Download manually via browser from:")
                print(f"  {url}")
                print(f"  Save to: {DLSS_FILE}")
                return False
            # Validate JSON before writing
            data = json.loads(raw)
            games = [e for e in data.get("data", []) if e.get("type") == "Game"]
            tmp = DLSS_FILE.with_suffix(".tmp")
            with open(tmp, "wb") as f:
                f.write(raw)
            tmp.replace(DLSS_FILE)
            print(f"  Downloaded {len(games)} games ({len(raw):,} bytes)")
            return True
    except Exception as e:
        print(f"  Failed to download: {e}")
        print("  Download manually via browser from:")
        print(f"  {url}")
        return False


# --- Steam ---

def _steam_search_term(term: str) -> "int | None":
    """Search Steam for a single term and return best App ID."""
    url = f"https://store.steampowered.com/api/storesearch/?term={urllib.parse.quote(term)}&l=english&cc=US"
    data = fetch_json(url)
    if not data:
        return None
    items = data.get("items", [])
    if not items:
        return None
    # Try exact match first
    for item in items:
        if item.get("name", "").lower() == term.lower():
            return item["id"]
    # Fall back to first result
    return items[0]["id"]


def _web_search_steam_appid(name: str) -> "int | None":
    """Fallback: search DuckDuckGo for the game's Steam store page."""
    queries = [
        f"{name} store.steampowered.com/app",
        f"{name} steam game store.steampowered.com",
    ]
    for query in queries:
        url = f"https://lite.duckduckgo.com/lite/?q={urllib.parse.quote(query)}"
        html = fetch_text(url)
        if html:
            # Decode DDG redirect URLs and extract appids
            encoded_urls = re.findall(r"uddg=([^&\"]+)", html)
            decoded_urls = [urllib.parse.unquote(u) for u in encoded_urls]
            appids = []
            for u in decoded_urls:
                m = re.search(r"(?:steampowered\.com|steamdb\.info|steamcommunity\.com)/(?:app|news/app)/(\d+)", u)
                if m:
                    appids.append(m.group(1))
            if appids:
                print(f"    [web] found appid={appids[0]} via DuckDuckGo")
                return int(appids[0])
        time.sleep(RATE_NORMAL)
    return None


def steam_search(name: str) -> "int | None":
    """Search Steam with fallback strategies for name mismatches.
    Falls back to DuckDuckGo web search for delisted/removed games.
    """
    # Try exact name first
    result = _steam_search_term(name)
    if result:
        return result
    # Try without parenthetical suffixes: "System Shock (2023)" -> "System Shock"
    stripped = re.sub(r"\s*\(.*?\)\s*$", "", name).strip()
    if stripped != name:
        result = _steam_search_term(stripped)
        if result:
            return result
    # Try without subtitle after colon/dash: "Alien: Rogue Incursion - Part One" -> "Alien Rogue Incursion"
    simplified = re.sub(r"[:\-–—]", " ", name)
    simplified = re.sub(r"\s+", " ", simplified).strip()
    if simplified != name:
        result = _steam_search_term(simplified)
        if result:
            return result
    # Try just the first part before colon: "Desynced: Autonomous Colony Simulator" -> "Desynced"
    if ":" in name:
        first_part = name.split(":")[0].strip()
        if len(first_part) > 3:
            result = _steam_search_term(first_part)
            if result:
                return result
    # Final fallback: web search via DuckDuckGo
    return _web_search_steam_appid(name)


def steam_reviews(app_id: int) -> "dict | None":
    """Get Steam review summary for an app."""
    url = f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&purchase_type=all&num_per_page=0"
    data = fetch_json(url)
    if not data:
        return None
    summary = data.get("query_summary", {})
    desc = summary.get("review_score_desc", "")
    total = summary.get("total_reviews", 0)
    positive = summary.get("total_positive", 0)
    if not desc or total == 0:
        return None
    rating = STEAM_RATING_MAP.get(desc)
    if not rating:
        # Handle low-review games (Steam returns "N user reviews")
        if total > 0:
            pct = round(positive / total * 100)
            if pct >= 80:
                rating = "Positive"
            elif pct >= 70:
                rating = "Mostly Positive"
            elif pct >= 40:
                rating = "Mixed"
            else:
                rating = "Negative"
        else:
            return None
    pct = round(positive / total * 100)
    return {"rating": rating, "pct": pct, "total": total}


def steam_appdetails(app_id: int) -> "dict | None":
    """Get Metacritic score from Steam appdetails API."""
    url = f"https://store.steampowered.com/api/appdetails?appids={app_id}"
    data = fetch_json(url)
    if not data:
        return None
    game_data = data.get(str(app_id), {}).get("data", {})
    mc = game_data.get("metacritic", {})
    if mc and mc.get("score"):
        return {"score": mc["score"]}
    return None


# --- Metacritic ---

def metacritic_scrape(name: str) -> "dict | None":
    """Scrape Metacritic score directly from their website.
    Tries slug variations and extracts ratingValue from JSON-LD.
    """
    slugs = [name_to_metacritic_slug(name)]
    # Also try slug from name variations
    for v in name_variations(name)[1:]:
        s = name_to_metacritic_slug(v)
        if s not in slugs:
            slugs.append(s)

    for slug in slugs:
        url = f"https://www.metacritic.com/game/{slug}/"
        html = fetch_text(url, headers={"User-Agent": UA_BROWSER, "Accept": "text/html"})
        if html:
            scores = re.findall(r'"ratingValue"[:\s]*"?(\d+)"?', html)
            if scores:
                return {"score": int(scores[0]), "source": "metacritic", "metacritic_slug": slug}
        time.sleep(RATE_NORMAL)
    return None


def update_metacritic(game_names: list[str], limit: int = 0):
    """Update Metacritic scores for games missing entries.

    Two-pass approach:
    1. Try Steam appdetails API (fast, uses cached appid)
    2. Scrape Metacritic directly for remaining missing games
    """
    print("Updating Metacritic scores...")
    existing = load_json(METACRITIC_FILE)
    steam_data = load_json(STEAM_FILE)
    missing = [n for n in game_names if n not in existing]
    print(f"  {len(existing)} existing, {len(missing)} missing")

    if limit > 0:
        missing = missing[:limit]
    if not missing:
        print("  All games already have Metacritic data")
        return

    # Pass 1: Steam appdetails API
    print(f"  Pass 1: Steam appdetails for {len(missing)} games...")
    added = 0
    still_missing = []
    for i, name in enumerate(missing):
        app_id = steam_data.get(name, {}).get("appid") or steam_search(name)
        if app_id:
            info = steam_appdetails(app_id)
            if info:
                info["source"] = "steam"
                info["appid"] = app_id
                existing[name] = {**existing.get(name, {}), **info}
                added += 1
                print(f"  [{i+1}/{len(missing)}] {name}: {info['score']} [steam appid={app_id}]")
            else:
                still_missing.append(name)
        else:
            still_missing.append(name)
        time.sleep(RATE_NORMAL)

    print(f"  Pass 1 found {added} scores, {len(still_missing)} remaining")

    # Pass 2: Direct Metacritic scrape
    if still_missing:
        print(f"\n  Pass 2: Metacritic scrape for {len(still_missing)} games...")
        scraped = 0
        for i, name in enumerate(still_missing):
            info = metacritic_scrape(name)
            if info:
                existing[name] = {**existing.get(name, {}), **info}
                scraped += 1
                print(f"  [{i+1}/{len(still_missing)}] {name}: {info['score']} [metacritic slug={info['metacritic_slug']}]")
            time.sleep(RATE_SLOW)
        print(f"  Pass 2 found {scraped} scores")
        added += scraped

    save_json(METACRITIC_FILE, existing)
    print(f"  Total: added {added} new Metacritic entries")


def update_steam(game_names: list[str], limit: int = 0):
    """Update Steam review data for games missing entries.

    Entries in steam_data.json can have an "appid" field for manual overrides.
    Add {"appid": 12345} for games that Steam search can't find by name,
    and the script will use that appid to fetch reviews.
    """
    print("Updating Steam reviews...")
    existing = load_json(STEAM_FILE)
    # Missing = not in file OR has appid override but no rating yet
    missing = [n for n in game_names
               if n not in existing or (n in existing and "appid" in existing[n] and "rating" not in existing[n])]
    print(f"  {len(existing)} existing, {len(missing)} missing")

    if limit > 0:
        missing = missing[:limit]
    if not missing:
        print("  All games already have Steam data")
        return

    print(f"  Fetching {len(missing)} games...")
    added = 0
    for i, name in enumerate(missing):
        # Use manual appid override if present, otherwise search
        app_id = existing.get(name, {}).get("appid") or steam_search(name)
        if app_id:
            info = steam_reviews(app_id)
            if info:
                info["appid"] = app_id
                existing[name] = {**existing.get(name, {}), **info}
                added += 1
                print(f"  [{i+1}/{len(missing)}] {name}: {info['rating']} ({info['pct']}%) [{info['total']} reviews] [appid={app_id}]")
            else:
                print(f"  [{i+1}/{len(missing)}] {name}: no reviews found (appid={app_id})")
        else:
            print(f"  [{i+1}/{len(missing)}] {name}: not found on Steam")
        time.sleep(RATE_FAST)

    save_json(STEAM_FILE, existing)
    print(f"  Added {added} new Steam entries")


# --- HLTB ---

def update_hltb(game_names: list[str], limit: int = 0):
    """Update HLTB data for games missing entries.
    Uses name variations to improve matching.
    """
    try:
        from howlongtobeatpy import HowLongToBeat
    except ImportError:
        print("  ERROR: howlongtobeatpy not installed. Run: pip install howlongtobeatpy")
        return

    print("Updating HLTB data...")
    existing = load_json(HLTB_FILE)
    missing = [n for n in game_names if n not in existing]
    print(f"  {len(existing)} existing, {len(missing)} missing")

    if limit > 0:
        missing = missing[:limit]
    if not missing:
        print("  All games already have HLTB data")
        return

    print(f"  Fetching {len(missing)} games...")

    async def run():
        sem = asyncio.Semaphore(5)
        added = 0

        async def fetch(idx: int, name: str):
            nonlocal added
            async with sem:
                try:
                    # Try name variations
                    for variation in name_variations(name):
                        r = await HowLongToBeat().async_search(variation, similarity_case_sensitive=False)
                        if r:
                            best = max(r, key=lambda x: x.similarity)
                            if best.similarity > 0.3:
                                d = {"hltb_id": best.game_id}
                                if best.main_story and best.main_story > 0:
                                    d["main"] = best.main_story
                                if best.main_extra and best.main_extra > 0:
                                    d["extra"] = best.main_extra
                                if best.completionist and best.completionist > 0:
                                    d["complete"] = best.completionist
                                if len(d) > 1:  # has at least one time field besides hltb_id
                                    existing[name] = {**existing.get(name, {}), **d}
                                    added += 1
                                    main = d.get("main", "?")
                                    via = f" (via \"{variation}\")" if variation != name else ""
                                    print(f"  [{idx+1}/{len(missing)}] {name}: {main}h{via} [hltb_id={best.game_id}]")
                                    return
                    print(f"  [{idx+1}/{len(missing)}] {name}: not found")
                except Exception as e:
                    print(f"  [{idx+1}/{len(missing)}] {name}: error ({e})")

        batch_size = 20
        for i in range(0, len(missing), batch_size):
            batch = missing[i:i+batch_size]
            await asyncio.gather(*(fetch(i+j, n) for j, n in enumerate(batch)))

        save_json(HLTB_FILE, existing)
        print(f"  Added {added} new HLTB entries")

    asyncio.run(run())


# --- Upscaling (PCGamingWiki) ---

def update_upscaling():
    """Fetch FSR/XeSS support data from PCGamingWiki Cargo API.
    Saves boolean flags and version numbers for each technology.
    """
    print("Updating upscaling data from PCGamingWiki...")
    steam_data = load_json(STEAM_FILE)

    # Build appid -> game name lookup
    appid_to_name: dict[int, str] = {}
    for name, v in steam_data.items():
        appid = v.get("appid")
        if appid:
            appid_to_name[appid] = name

    # Fetch all games with FSR or XeSS from PCGamingWiki
    all_results = []
    offset = 0
    limit = 500
    while True:
        url = (
            "https://www.pcgamingwiki.com/w/api.php?action=cargoquery"
            "&tables=Video,Infobox_game"
            "&join_on=Video._pageID=Infobox_game._pageID"
            "&fields=Infobox_game.Steam_AppID,Video.Upscaling"
            f"&where=Video.Upscaling+HOLDS+LIKE+'%25FSR%25'+OR+Video.Upscaling+HOLDS+LIKE+'%25XeSS%25'"
            f"&limit={limit}&offset={offset}&format=json"
        )
        data = fetch_json(url, timeout=15)
        if not data:
            break
        results = data.get("cargoquery", [])
        if not results:
            break
        all_results.extend(results)
        if len(results) < limit:
            break
        offset += limit
        time.sleep(RATE_NORMAL)

    print(f"  PCGamingWiki returned {len(all_results)} entries")

    # Parse upscaling strings and match to our games
    upscaling_data: dict[str, dict] = {}
    for r in all_results:
        t = r.get("title", {})
        appids_raw = t.get("Steam AppID", "")
        upscaling_str = t.get("Upscaling", "")
        if not appids_raw or not upscaling_str:
            continue

        parts = [p.strip() for p in upscaling_str.split(",")]
        fsr_versions = [p for p in parts if p.startswith("FSR")]
        xess_versions = [p for p in parts if p.startswith("XeSS")]

        entry: dict = {}
        if fsr_versions:
            entry["fsr_version"] = fsr_versions[-1]  # highest/latest version
        if xess_versions:
            entry["xess_version"] = xess_versions[-1]

        if not entry:
            continue

        for appid_str in str(appids_raw).split(","):
            appid_str = appid_str.strip()
            if appid_str.isdigit():
                appid = int(appid_str)
                if appid in appid_to_name:
                    upscaling_data[appid_to_name[appid]] = entry

    save_json(UPSCALING_FILE, upscaling_data)

    fsr_count = sum(1 for v in upscaling_data.values() if v.get("fsr_version"))
    xess_count = sum(1 for v in upscaling_data.values() if v.get("xess_version"))
    print(f"  Matched {len(upscaling_data)} games (FSR: {fsr_count}, XeSS: {xess_count})")


# --- Backfill ---

def backfill_steam(limit: int = 0):
    """Backfill appid + metadata for existing steam_data entries missing appid.
    Also fetches release date and genres from appdetails.
    """
    print("Backfilling Steam appids + metadata...")
    existing = load_json(STEAM_FILE)
    needs_appid = [n for n, v in existing.items() if "appid" not in v and not v.get("not_on_steam")]
    print(f"  {len(existing)} entries, {len(needs_appid)} missing appid")

    if limit > 0:
        needs_appid = needs_appid[:limit]
    if not needs_appid:
        print("  All entries already have appid")
    else:
        print(f"  Searching {len(needs_appid)} games...")
        found = 0
        for i, name in enumerate(needs_appid):
            app_id = steam_search(name)
            if app_id:
                existing[name]["appid"] = app_id
                found += 1
                print(f"  [{i+1}/{len(needs_appid)}] {name}: appid={app_id}")
            else:
                print(f"  [{i+1}/{len(needs_appid)}] {name}: not found")
            time.sleep(RATE_FAST)

        save_json(STEAM_FILE, existing)
        print(f"  Found appid for {found}/{len(needs_appid)} games")

    # Now fetch appdetails for entries that have appid but no metadata
    enrich_steam_metadata(existing, limit=limit)


def backfill_total(limit: int = 0):
    """Backfill total review counts for entries that have appid + rating but no total."""
    print("Backfilling total review counts...")
    existing = load_json(STEAM_FILE)
    needs_total = [(n, v["appid"]) for n, v in existing.items()
                   if "appid" in v and "rating" in v and "total" not in v]
    print(f"  {len(needs_total)} entries missing total")

    if limit > 0:
        needs_total = needs_total[:limit]
    if not needs_total:
        print("  All entries already have total")
        return

    print(f"  Fetching {len(needs_total)} games...")
    found = 0
    for i, (name, app_id) in enumerate(needs_total):
        url = f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&purchase_type=all&num_per_page=0"
        data = fetch_json(url)
        if data:
            total = data.get("query_summary", {}).get("total_reviews", 0)
            if total > 0:
                existing[name]["total"] = total
                found += 1
                if (i + 1) % 50 == 0:
                    print(f"  [{i+1}/{len(needs_total)}] progress... ({found} found)")
        time.sleep(RATE_FAST)

    save_json(STEAM_FILE, existing)
    print(f"  Added total for {found}/{len(needs_total)} entries")


def enrich_steam_metadata(existing: "dict | None" = None, limit: int = 0):
    """Fetch release date, metacritic URL, genres from appdetails for entries with appid."""
    if existing is None:
        existing = load_json(STEAM_FILE)

    needs_meta = [n for n, v in existing.items()
                  if "appid" in v and "release_date" not in v and not v.get("not_on_steam")]
    print(f"\n  Enriching metadata for {len(needs_meta)} games...")

    if limit > 0:
        needs_meta = needs_meta[:limit]
    if not needs_meta:
        print("  All entries already have metadata")
        return

    enriched = 0
    for i, name in enumerate(needs_meta):
        app_id = existing[name]["appid"]
        url = f"https://store.steampowered.com/api/appdetails?appids={app_id}"
        data = fetch_json(url)
        if data:
            game_data = data.get(str(app_id), {}).get("data", {})
            if game_data:
                rd = game_data.get("release_date", {})
                if rd.get("date"):
                    existing[name]["release_date"] = rd["date"]
                mc = game_data.get("metacritic", {})
                if mc.get("url"):
                    existing[name]["metacritic_url"] = mc["url"]
                genres = game_data.get("genres", [])
                if genres:
                    existing[name]["genres"] = [g["description"] for g in genres]
                desc = game_data.get("short_description", "")
                if desc:
                    existing[name]["description"] = desc
                capsule = game_data.get("capsule_imagev5") or game_data.get("capsule_image")
                if capsule:
                    existing[name]["image"] = capsule
                enriched += 1
                if (i + 1) % 50 == 0:
                    print(f"  [{i+1}/{len(needs_meta)}] progress... ({enriched} enriched)")
            else:
                print(f"  [{i+1}/{len(needs_meta)}] {name}: no data (appid={app_id})")
        time.sleep(RATE_NORMAL)

    save_json(STEAM_FILE, existing)
    print(f"  Enriched {enriched}/{len(needs_meta)} games")


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Update DLSSdb data sources")
    parser.add_argument("--dlss", action="store_true", help="Update NVIDIA DLSS game list")
    parser.add_argument("--steam", action="store_true", help="Update Steam reviews")
    parser.add_argument("--hltb", action="store_true", help="Update HLTB completion times")
    parser.add_argument("--metacritic", action="store_true", help="Update Metacritic scores (Steam API + direct scrape)")
    parser.add_argument("--upscaling", action="store_true", help="Update FSR/XeSS data from PCGamingWiki")
    parser.add_argument("--backfill", action="store_true", help="Backfill appid + metadata for existing Steam entries")
    parser.add_argument("--backfill-total", action="store_true", help="Backfill total review counts for Steam entries")
    parser.add_argument("--all", action="store_true", help="Update all sources")
    parser.add_argument("--limit", type=int, default=0, help="Max games to fetch (0 = all missing)")
    parser.add_argument("--test", type=int, default=0, help="Test mode: update N random missing games")
    args = parser.parse_args()

    if not any([args.dlss, args.steam, args.hltb, args.metacritic, args.upscaling, args.backfill, args.backfill_total, args.all, args.test]):
        parser.print_help()
        sys.exit(1)

    game_names = get_game_names()
    if not game_names:
        print("ERROR: No games found. Make sure dlss-rt-games-apps-overrides.json exists.")
        sys.exit(1)

    print(f"DLSSdb Data Updater — {len(game_names)} games in DLSS list\n")

    if args.test:
        # Test mode: pick N random games that are missing from both Steam and HLTB
        steam_existing = load_json(STEAM_FILE)
        hltb_existing = load_json(HLTB_FILE)
        missing_both = [n for n in game_names if n not in steam_existing and n not in hltb_existing]
        if len(missing_both) < args.test:
            test_names = missing_both
        else:
            test_names = random.sample(missing_both, args.test)
        print(f"TEST MODE: updating {len(test_names)} random games:\n  " + "\n  ".join(test_names))
        print()
        update_steam(test_names, limit=args.test)
        print()
        update_hltb(test_names, limit=args.test)
        print()
        update_metacritic(test_names, limit=args.test)
        return

    if args.all or args.dlss:
        update_dlss()
        print()

    if args.all or args.steam:
        update_steam(game_names, limit=args.limit)
        print()

    if args.all or args.hltb:
        update_hltb(game_names, limit=args.limit)
        print()

    if args.all or args.metacritic:
        update_metacritic(game_names, limit=args.limit)

    if args.all or args.upscaling:
        update_upscaling()
        print()

    if args.backfill:
        backfill_steam(limit=args.limit)

    if args.backfill_total:
        backfill_total(limit=args.limit)


if __name__ == "__main__":
    main()
