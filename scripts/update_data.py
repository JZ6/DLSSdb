#!/usr/bin/env python3
"""
Update DLSSdb data sources: DLSS games, Steam reviews, and HLTB times.

Usage:
  python scripts/update_data.py --all          # update all 3 sources
  python scripts/update_data.py --steam        # update Steam reviews only
  python scripts/update_data.py --hltb         # update HLTB times only
  python scripts/update_data.py --dlss         # update NVIDIA DLSS list
  python scripts/update_data.py --steam --limit 10  # update 10 missing Steam entries
  python scripts/update_data.py --test 6       # test with 6 random games
"""

import argparse
import asyncio
import json
import random
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

# Steam review categories from their API
STEAM_RATING_MAP = {
    "Overwhelmingly Positive": "Overwhelmingly Positive",
    "Very Positive": "Very Positive",
    "Mostly Positive": "Mostly Positive",
    "Mixed": "Mixed",
    "Mostly Negative": "Mostly Negative",
    "Very Negative": "Very Negative",
    "Overwhelmingly Negative": "Very Negative",
}


def load_json(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


def save_json(path: Path, data: dict):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved {len(data)} entries to {path.name}")


def get_game_names() -> list[str]:
    """Extract game names from the DLSS JSON."""
    data = load_json(DLSS_FILE)
    return [str(e["name"]) for e in data.get("data", []) if e.get("type") == "Game"]


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
            with open(DLSS_FILE, "wb") as f:
                f.write(raw)
            data = json.loads(raw)
            games = [e for e in data.get("data", []) if e.get("type") == "Game"]
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
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DLSSdb/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            items = data.get("items", [])
            if not items:
                return None
            # Try exact match first
            for item in items:
                if item.get("name", "").lower() == term.lower():
                    return item["id"]
            # Fall back to first result
            return items[0]["id"]
    except Exception:
        return None


def steam_search(name: str) -> "int | None":
    """Search Steam with fallback strategies for name mismatches."""
    import re
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
    return None


def steam_reviews(app_id: int) -> "dict | None":
    """Get Steam review summary for an app."""
    url = f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&purchase_type=all&num_per_page=0"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DLSSdb/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            summary = data.get("query_summary", {})
            desc = summary.get("review_score_desc", "")
            total = summary.get("total_reviews", 0)
            positive = summary.get("total_positive", 0)
            if not desc or total == 0:
                return None
            rating = STEAM_RATING_MAP.get(desc)
            if not rating:
                return None
            pct = round(positive / total * 100)
            return {"rating": rating, "pct": pct}
    except Exception:
        return None


def update_steam(game_names: list[str], limit: int = 0):
    """Update Steam review data for games missing entries."""
    print("Updating Steam reviews...")
    existing = load_json(STEAM_FILE)
    missing = [n for n in game_names if n not in existing]
    print(f"  {len(existing)} existing, {len(missing)} missing")

    if limit > 0:
        missing = missing[:limit]
    if not missing:
        print("  All games already have Steam data")
        return

    print(f"  Fetching {len(missing)} games...")
    added = 0
    for i, name in enumerate(missing):
        app_id = steam_search(name)
        if app_id:
            info = steam_reviews(app_id)
            if info:
                existing[name] = info
                added += 1
                print(f"  [{i+1}/{len(missing)}] {name}: {info['rating']} ({info['pct']}%)")
            else:
                print(f"  [{i+1}/{len(missing)}] {name}: no reviews found (appid={app_id})")
        else:
            print(f"  [{i+1}/{len(missing)}] {name}: not found on Steam")
        time.sleep(0.3)  # rate limit

    save_json(STEAM_FILE, existing)
    print(f"  Added {added} new Steam entries")


# --- HLTB ---

def update_hltb(game_names: list[str], limit: int = 0):
    """Update HLTB data for games missing entries."""
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
                    r = await HowLongToBeat().async_search(name, similarity_case_sensitive=False)
                    if r:
                        best = max(r, key=lambda x: x.similarity)
                        if best.similarity > 0.3:
                            d = {}
                            if best.main_story and best.main_story > 0:
                                d["main"] = best.main_story
                            if best.main_extra and best.main_extra > 0:
                                d["extra"] = best.main_extra
                            if best.completionist and best.completionist > 0:
                                d["complete"] = best.completionist
                            if d:
                                existing[name] = d
                                added += 1
                                main = d.get("main", "?")
                                print(f"  [{idx+1}/{len(missing)}] {name}: {main}h")
                                return
                    print(f"  [{idx+1}/{len(missing)}] {name}: not found")
                except Exception:
                    print(f"  [{idx+1}/{len(missing)}] {name}: error")

        batch_size = 20
        for i in range(0, len(missing), batch_size):
            batch = missing[i:i+batch_size]
            await asyncio.gather(*(fetch(i+j, n) for j, n in enumerate(batch)))

        save_json(HLTB_FILE, existing)
        print(f"  Added {added} new HLTB entries")

    asyncio.run(run())


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Update DLSSdb data sources")
    parser.add_argument("--dlss", action="store_true", help="Update NVIDIA DLSS game list")
    parser.add_argument("--steam", action="store_true", help="Update Steam reviews")
    parser.add_argument("--hltb", action="store_true", help="Update HLTB completion times")
    parser.add_argument("--all", action="store_true", help="Update all sources")
    parser.add_argument("--limit", type=int, default=0, help="Max games to fetch (0 = all missing)")
    parser.add_argument("--test", type=int, default=0, help="Test mode: update N random missing games")
    args = parser.parse_args()

    if not any([args.dlss, args.steam, args.hltb, args.all, args.test]):
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
        return

    if args.all or args.dlss:
        update_dlss()
        print()

    if args.all or args.steam:
        update_steam(game_names, limit=args.limit)
        print()

    if args.all or args.hltb:
        update_hltb(game_names, limit=args.limit)


if __name__ == "__main__":
    main()
