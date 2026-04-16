import { useState, useEffect } from "react";
import type { DlssGame, DlssData, HltbInfo, SteamInfo, MetacriticInfo, UpscalingInfo } from "../types";

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
    const fetchJson = <T,>(url: string, required = false): Promise<T> =>
      fetch(url).then((r) => {
        if (!r.ok) {
          if (required) throw new Error(`Failed to load ${url}`);
          return {} as T;
        }
        return r.json() as Promise<T>;
      }).catch((err) => {
        if (required) throw err;
        return {} as T;
      });

    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetchJson<DlssData>(`${base}dlss-rt-games-apps-overrides.json`, true),
      fetchJson<Record<string, HltbInfo>>(`${base}hltb_data.json`),
      fetchJson<Record<string, SteamInfo>>(`${base}steam_data.json`),
      fetchJson<Record<string, MetacriticInfo>>(`${base}metacritic_data.json`),
      fetchJson<Record<string, UpscalingInfo>>(`${base}upscaling_data.json`),
    ])
      .then(([dlss, hltbData, steamData, metacriticData, upscalingData]) => {
        const filtered = dlss.data
          .filter((e) => e.type === "Game")
          .map((e) => ({ ...e, name: String(e.name) }));
        setGames(filtered);
        setHltb(hltbData);
        setSteam(steamData);
        setMetacritic(metacriticData);
        setUpscaling(upscalingData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { games, hltb, steam, metacritic, upscaling, loading, error };
}
