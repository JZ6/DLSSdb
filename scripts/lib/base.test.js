// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Updater } from "./base.js";
import { syncGameList } from "./util.js";

/** Minimal subclass — processOne writes a fake entry for targeting tests. */
class TestUpdater extends Updater {
  sourceKey = "test";
  label = "Test";
  backfillFilter(e) { return !e.extra; }

  async processOne(gameData, name, prefix) {
    gameData[name].test = { found: true, score: 99, updated_at: "2026-05-05" };
    return true;
  }
}

const updater = new TestUpdater();

/**
 * Build a fake gameData object from a shorthand map.
 * Keys are game names, values are the source sub-entry (or undefined to omit).
 */
function makeGameData(entries) {
  const gd = {};
  for (const [name, sourceEntry] of Object.entries(entries)) {
    gd[name] = sourceEntry !== undefined ? { test: sourceEntry } : {};
  }
  return gd;
}

describe("getUncheckedTargets", () => {
  it("picks up games with no source key", () => {
    const gd = makeGameData({ "Game A": undefined });
    expect(updater.getUncheckedTargets(gd, ["Game A"])).toEqual(["Game A"]);
  });

  it("picks up games with empty {} source entry", () => {
    const gd = makeGameData({ "Game A": {} });
    expect(updater.getUncheckedTargets(gd, ["Game A"])).toEqual(["Game A"]);
  });

  it("skips games with found: true", () => {
    const gd = makeGameData({ "Game A": { found: true, updated_at: "2026-01-01" } });
    expect(updater.getUncheckedTargets(gd, ["Game A"])).toEqual([]);
  });

  it("skips games with found: false", () => {
    const gd = makeGameData({ "Game A": { found: false } });
    expect(updater.getUncheckedTargets(gd, ["Game A"])).toEqual([]);
  });

  it("new game from DLSS list with empty entry gets picked up", () => {
    const gd = makeGameData({
      "Existing Game": { found: true, updated_at: "2026-01-01" },
      "Failed Game": { found: false },
    });
    gd["Brand New Game"] = {};
    const allNames = ["Existing Game", "Failed Game", "Brand New Game"];
    const unchecked = updater.getUncheckedTargets(gd, allNames);
    expect(unchecked).toEqual(["Brand New Game"]);
  });

  it("new game from DLSS list not in gameData at all gets picked up", () => {
    const gd = makeGameData({
      "Existing Game": { found: true, updated_at: "2026-01-01" },
    });
    // "Brand New Game" is in the DLSS names list but has no gameData entry
    const allNames = ["Existing Game", "Brand New Game"];
    const unchecked = updater.getUncheckedTargets(gd, allNames);
    expect(unchecked).toEqual(["Brand New Game"]);
  });
});

describe("getRetryTargets", () => {
  it("picks up found: false", () => {
    const gd = makeGameData({ "Game A": { found: false } });
    expect(updater.getRetryTargets(gd, ["Game A"])).toEqual(["Game A"]);
  });

  it("skips found: true", () => {
    const gd = makeGameData({ "Game A": { found: true } });
    expect(updater.getRetryTargets(gd, ["Game A"])).toEqual([]);
  });

  it("skips empty {}", () => {
    const gd = makeGameData({ "Game A": {} });
    expect(updater.getRetryTargets(gd, ["Game A"])).toEqual([]);
  });
});

describe("getRefreshTargets", () => {
  it("picks up stale entries", () => {
    const gd = makeGameData({ "Game A": { found: true, updated_at: "2020-01-01" } });
    expect(updater.getRefreshTargets(gd, ["Game A"], 30)).toEqual(["Game A"]);
  });

  it("skips recent entries", () => {
    const today = new Date().toISOString().slice(0, 10);
    const gd = makeGameData({ "Game A": { found: true, updated_at: today } });
    expect(updater.getRefreshTargets(gd, ["Game A"], 30)).toEqual([]);
  });

  it("skips found: false", () => {
    const gd = makeGameData({ "Game A": { found: false } });
    expect(updater.getRefreshTargets(gd, ["Game A"], 30)).toEqual([]);
  });

  it("skips empty {}", () => {
    const gd = makeGameData({ "Game A": {} });
    expect(updater.getRefreshTargets(gd, ["Game A"], 30)).toEqual([]);
  });
});

describe("getBackfillTargets", () => {
  it("picks up found: true with missing fields", () => {
    const gd = makeGameData({ "Game A": { found: true } }); // no "extra" field
    expect(updater.getBackfillTargets(gd, ["Game A"])).toEqual(["Game A"]);
  });

  it("skips complete entries", () => {
    const gd = makeGameData({ "Game A": { found: true, extra: "data" } });
    expect(updater.getBackfillTargets(gd, ["Game A"])).toEqual([]);
  });

  it("skips found: false", () => {
    const gd = makeGameData({ "Game A": { found: false } });
    expect(updater.getBackfillTargets(gd, ["Game A"])).toEqual([]);
  });

  it("skips empty {}", () => {
    const gd = makeGameData({ "Game A": {} });
    expect(updater.getBackfillTargets(gd, ["Game A"])).toEqual([]);
  });
});

describe("update() creates gameData entries for new games", () => {
  it("creates entry and writes source data for a game not in gameData", async () => {
    const gd = {
      "Existing Game": { test: { found: true, updated_at: "2026-01-01" } },
    };
    // "Brand New Game" is in DLSS list but not in gameData at all
    expect(gd["Brand New Game"]).toBeUndefined();

    await updater.update(gd, ["Brand New Game"]);

    // update() should have created the top-level entry via init guard
    expect(gd["Brand New Game"]).toBeDefined();
    // processOne should have written the source data
    expect(gd["Brand New Game"].test).toEqual({ found: true, score: 99, updated_at: "2026-05-05" });
  });

  it("does not overwrite existing top-level entry", async () => {
    const gd = {
      "Game A": { steam: { found: true, appid: 12345 } },
    };
    await updater.update(gd, ["Game A"]);

    // steam data should still be there
    expect(gd["Game A"].steam).toEqual({ found: true, appid: 12345 });
    // test data should be added alongside
    expect(gd["Game A"].test).toEqual({ found: true, score: 99, updated_at: "2026-05-05" });
  });
});

describe("getTargets dispatcher", () => {
  const gd = makeGameData({
    "Unchecked": undefined,
    "Empty": {},
    "Found": { found: true, updated_at: "2020-01-01" },
    "NotFound": { found: false },
    "Complete": { found: true, extra: "data", updated_at: "2020-01-01" },
  });
  const names = Object.keys(gd);

  it("defaults to unchecked", () => {
    const { list, label } = updater.getTargets(gd, names);
    expect(label).toBe("unchecked");
    expect(list).toContain("Unchecked");
    expect(list).toContain("Empty");
    expect(list).not.toContain("Found");
  });

  it("retry flag selects not-found", () => {
    const { list, label } = updater.getTargets(gd, names, { retry: true });
    expect(label).toBe("to retry");
    expect(list).toEqual(["NotFound"]);
  });

  it("refresh flag selects stale", () => {
    const { list, label } = updater.getTargets(gd, names, { refresh: 30 });
    expect(label).toMatch(/stale/);
    expect(list).toContain("Found");
    expect(list).toContain("Complete");
  });

  it("backfill flag selects incomplete", () => {
    const { list, label } = updater.getTargets(gd, names, { backfill: true });
    expect(label).toBe("to backfill");
    expect(list).toEqual(["Found"]); // missing "extra" field
  });
});

describe("syncGameList", () => {
  it("adds new games from DLSS list to gameData", () => {
    const gd = { "Existing Game": { steam: { found: true } } };

    const added = syncGameList(gd, ["Existing Game", "Brand New Game"]);

    expect(added).toBe(1);
    expect(gd["Brand New Game"]).toEqual({});
  });

  it("does not overwrite existing entries", () => {
    const gd = { "Existing Game": { steam: { found: true, appid: 12345 } } };

    const added = syncGameList(gd, ["Existing Game"]);

    expect(added).toBe(0);
    expect(gd["Existing Game"].steam.appid).toBe(12345);
  });

  it("returns 0 when no new games", () => {
    const gd = { "Game A": {}, "Game B": {} };

    expect(syncGameList(gd, ["Game A", "Game B"])).toBe(0);
  });

  it("adds multiple new games at once", () => {
    const gd = { "Old": { steam: { found: true } } };

    const added = syncGameList(gd, ["Old", "New 1", "New 2", "New 3"]);

    expect(added).toBe(3);
    expect(Object.keys(gd)).toEqual(["Old", "New 1", "New 2", "New 3"]);
  });
});
