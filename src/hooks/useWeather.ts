import { useState, useEffect } from "react";

export interface CityWeather {
  city: string;
  temp: string;
  condition: string;
  humidity: number;
  rainfall: number;
  wind: number;
  uv: number;
  loading: boolean;
}

// ─── localStorage cache layer — 15-minute TTL ─────────────────────────────────
// v2: bumped when city list changed (Durg/Bhilai added) to bust stale 4-city cache
const CACHE_KEY = "cg_weather_cache_v2";
const CACHE_TTL_MS = 15 * 60 * 1000;

interface WeatherCacheEntry {
  timestamp: number;
  data: Omit<CityWeather, "loading">[];
}

function readCache(): WeatherCacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: WeatherCacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(data: Omit<CityWeather, "loading">[]): void {
  try {
    const entry: WeatherCacheEntry = { timestamp: Date.now(), data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage quota exceeded — proceed without caching
  }
}

// ─── City list — Durg/Bhilai is primary focus; listed first ──────────────────
const CITIES = [
  {
    city: "Durg/Bhilai",
    lat: 21.192,
    lng: 81.318,
    fallback: { temp: "38.5", condition: "Partly Cloudy", humidity: 42, rainfall: 0, wind: 6.0, uv: 8 },
  },
  {
    city: "Raipur",
    lat: 21.2514,
    lng: 81.6296,
    fallback: { temp: "38.0", condition: "Partly Cloudy", humidity: 44, rainfall: 0, wind: 6.5, uv: 8 },
  },
  {
    city: "Bilaspur",
    lat: 22.0797,
    lng: 82.1409,
    fallback: { temp: "36.4", condition: "Partly Cloudy", humidity: 39, rainfall: 0, wind: 4.6, uv: 7 },
  },
  {
    city: "Jagdalpur",
    lat: 19.0748,
    lng: 82.0138,
    fallback: { temp: "35.2", condition: "Clear", humidity: 68, rainfall: 0, wind: 11.1, uv: 7 },
  },
  {
    city: "Ambikapur",
    lat: 23.1189,
    lng: 83.1969,
    fallback: { temp: "33.8", condition: "Partly Cloudy", humidity: 34, rainfall: 0, wind: 4.8, uv: 6 },
  },
];

function weatherCodeToCondition(code: number): string {
  if (code === 0) return "Clear Sky";
  if (code <= 2) return "Mainly Clear";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Drizzle";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain Showers";
  if (code >= 95) return "Thunderstorm";
  return "Partly Cloudy";
}

async function fetchCityWeather(lat: number, lng: number) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,uv_index` +
    `&timezone=Asia%2FKolkata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

export function useWeather(): CityWeather[] {
  const [weather, setWeather] = useState<CityWeather[]>(
    CITIES.map((c) => ({
      city: c.city,
      ...c.fallback,
      loading: true,
    }))
  );

  useEffect(() => {
    let cancelled = false;

    // ── Check cache first — skip network if valid entry exists ────────────────
    const cached = readCache();
    if (cached) {
      setWeather(cached.data.map((d) => ({ ...d, loading: false })));
      return;
    }

    // ── No valid cache — fetch all cities in parallel ─────────────────────────
    Promise.allSettled(
      CITIES.map((c) => fetchCityWeather(c.lat, c.lng))
    ).then((results) => {
      if (cancelled) return;

      const resolved = CITIES.map((c, i) => {
        const result = results[i];
        if (result.status === "fulfilled") {
          try {
            const cur = result.value.current;
            return {
              city: c.city,
              temp: parseFloat(cur.temperature_2m).toFixed(1),
              condition: weatherCodeToCondition(cur.weather_code),
              humidity: cur.relative_humidity_2m ?? c.fallback.humidity,
              rainfall: cur.precipitation ?? c.fallback.rainfall,
              wind: parseFloat((cur.wind_speed_10m ?? c.fallback.wind).toFixed(1)),
              uv: cur.uv_index ?? c.fallback.uv,
            };
          } catch {
            return { city: c.city, ...c.fallback };
          }
        }
        return { city: c.city, ...c.fallback };
      });

      writeCache(resolved);
      setWeather(resolved.map((d) => ({ ...d, loading: false })));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return weather;
}
