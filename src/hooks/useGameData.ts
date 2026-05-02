import { useState, useEffect } from "react";
import type { DlssGame, DlssData, HltbInfo, SteamInfo, MetacriticInfo, UpscalingInfo } from "../types";

// Raw shape of each entry in game_data.json
interface GameDataEntry {
  steam?:      { found?: boolean; appid?: number; rating?: string; pct?: number; total?: number; image?: string };
  hltb?:       { found?: boolean; hltb_id?: number; main?: number; extra?: number; complete?: number };
  metacritic?: { found?: boolean; score?: number };
  pcgw?:       { found?: boolean; fsr_version?: string; xess_version?: string };
}

interface GameData {
  games: DlssGame[];
  hltb: Record<string, HltbInfo>;
  steam: Record<string, SteamInfo>;
  metacritic: Record<string, MetacriticInfo>;
  upscaling: Record<string, UpscalingInfo>;
  loading: boolean;
  error: string | null;
}

export function useGameData(): GameData {
  const [games, setGames] = useState<DlssGame[]>([]);
  const [hltb, setHltb] = useState<Record<string, HltbInfo>>({});
  const [steam, setSteam] = useState<Record<string, SteamInfo>>({});
  const [metacritic, setMetacritic] = useState<Record<string, MetacriticInfo>>({});
  const [upscaling, setUpscaling] = useState<Record<string, UpscalingInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const fetchJson = <T,>(url: string, required = false): Promise<T> =>
      fetch(url, { signal }).then((r) => {
        if (!r.ok) {
          if (required) throw new Error(`Failed to load ${url}`);
          return {} as T;
        }
        return r.json() as Promise<T>;
      }).catch((err) => {
        if (err.name === "AbortError") throw err;
        if (required) throw err;
        return {} as T;
      });

    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetchJson<DlssData>(`${base}dlss-rt-games-apps-overrides.json`, true),
      fetchJson<Record<string, GameDataEntry>>(`${base}game_data.json`, true),
    ])
      .then(([dlss, raw]) => {
        if (signal.aborted) return;
        const filtered = dlss.data
          .filter((e) => e.type === "Game")
          .map((e) => ({ ...e, name: String(e.name) }));

        // Extract per-source records from unified game_data.json
        const steamData: Record<string, SteamInfo> = {};
        const hltbData: Record<string, HltbInfo> = {};
        const metacriticData: Record<string, MetacriticInfo> = {};
        const upscalingData: Record<string, UpscalingInfo> = {};

        for (const [name, entry] of Object.entries(raw)) {
          if (entry.steam?.found)      steamData[name]      = entry.steam as SteamInfo;
          if (entry.hltb?.found)       hltbData[name]       = entry.hltb as HltbInfo;
          if (entry.metacritic?.found && entry.metacritic.score != null)
                                       metacriticData[name] = entry.metacritic as MetacriticInfo;
          if (entry.pcgw?.found)       upscalingData[name]  = entry.pcgw as UpscalingInfo;
        }

        setGames(filtered);
        setSteam(steamData);
        setHltb(hltbData);
        setMetacritic(metacriticData);
        setUpscaling(upscalingData);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return { games, hltb, steam, metacritic, upscaling, loading, error };
}
