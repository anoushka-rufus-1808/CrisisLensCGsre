/**
 * mlForecast.ts
 *
 * Improvements over previous version:
 * 1. Loads district-specific CSV (falls back to Durg if not found)
 * 2. Builds per-facility risk history by applying vulnerability to each point
 * 3. Runs ML per FACILITY, not per district — each facility gets its own prediction
 */

export type ModelType = "prophet" | "random_forest";

export interface HistoryRow {
  date:  string;
  value: number;
}

export interface ForecastResult {
  score:       number;
  mape:        number | null;
  source:      "ml" | "statistical_fallback";
  facilityId?: string;
  district?:   string;
}

// ─── Seasonal fallback ────────────────────────────────────────────────────────

function dayOfYear(d: Date): number {
  const jan = new Date(d.getFullYear(), 0, 0);
  return Math.round((d.getTime() - jan.getTime()) / 86400000);
}

export function statisticalForecast(
  history:   HistoryRow[],
  daysAhead: number,
  window = 14,
): number {
  if (history.length === 0) return 45;
  const target    = new Date();
  target.setDate(target.getDate() + daysAhead);
  const targetDoy = dayOfYear(target);

  const seasonal = history.filter((row) => {
    const doy  = dayOfYear(new Date(row.date));
    const diff = Math.abs(doy - targetDoy);
    return diff <= window || diff >= 365 - window;
  });

  const pool = seasonal.length > 0 ? seasonal : history.slice(-30);
  return parseFloat(
    (pool.reduce((s, r) => s + r.value, 0) / pool.length).toFixed(1),
  );
}

// ─── District CSV loader ──────────────────────────────────────────────────────

function computeRawScore(temp: number, humidity: number, rain: number): number {
  const heat  = Math.max(0, Math.min(100, ((temp - 15) / 30) * 100));
  const humid = Math.max(0, Math.min(100, humidity));
  const flood = Math.max(0, Math.min(100, (rain / 80) * 100));
  return parseFloat((heat * 0.35 + humid * 0.25 + flood * 0.40).toFixed(2));
}

function parseDistrictCSV(text: string): HistoryRow[] {
  const lines = text.trim().split("\n");
  const header = lines[0].toLowerCase();

  // New simple format:  date,temp_max,humidity,rainfall
  if (header.startsWith("date,temp")) {
    return lines
      .slice(1)
      .map((l) => l.split(","))
      .filter((c) => c.length >= 4 && c[0])
      .map((c) => ({
        date:  c[0].trim(),
        value: computeRawScore(
          parseFloat(c[1]) || 0,
          parseFloat(c[2]) || 0,
          parseFloat(c[3]) || 0,
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Legacy Durg format: id, date, temp, ..., humidity, rainfall
  return lines
    .slice(1)
    .map((l) => l.split(","))
    .filter((c) => c.length >= 7 && c[1])
    .map((c) => ({
      date:  c[1].trim(),
      value: computeRawScore(
        parseFloat(c[2]) || 0,
        parseFloat(c[5]) || 0,
        parseFloat(c[6]) || 0,
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Load historical weather CSV for a district.
 * Tries <code>_weather.csv first, falls back to durg_weather.csv.
 */
export async function loadDistrictCSV(
  districtCode: string,
  base: string,
): Promise<{ rows: HistoryRow[]; isExact: boolean }> {
  const cleanBase = base.replace(/\/$/, "");
  const code      = districtCode.toLowerCase().trim();

  // Try district-specific file first
  try {
    const res = await fetch(`${cleanBase}/data/historical/${code}_weather.csv`);
    if (res.ok) {
      const text = await res.text();
      const rows = parseDistrictCSV(text);
      if (rows.length >= 20) return { rows, isExact: true };
    }
  } catch { /* not found */ }

  // Fall back to Durg
  try {
    const res = await fetch(`${cleanBase}/data/historical/durg_weather.csv`);
    if (res.ok) {
      const text = await res.text();
      const rows = parseDistrictCSV(text);
      return { rows, isExact: false };
    }
  } catch { /* nothing */ }

  return { rows: [], isExact: false };
}

// ─── Gap filling ──────────────────────────────────────────────────────────────

export function buildSeasonalMap(history: HistoryRow[]): Record<number, number> {
  const buckets: Record<number, number[]> = {};
  for (const row of history) {
    const doy = dayOfYear(new Date(row.date));
    if (!buckets[doy]) buckets[doy] = [];
    buckets[doy].push(row.value);
  }
  const result: Record<number, number> = {};
  for (const [doy, vals] of Object.entries(buckets)) {
    result[+doy] = parseFloat(
      (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
    );
  }
  return result;
}

export function extendToToday(history: HistoryRow[]): HistoryRow[] {
  if (history.length === 0) return [];
  const seasonal  = buildSeasonalMap(history);
  const fallback  = history.slice(-60).reduce((s, r) => s + r.value, 0)
                  / Math.min(60, history.length);
  const lastDate  = new Date(history[history.length - 1].date);
  const today     = new Date();
  today.setHours(0, 0, 0, 0);
  const extended  = [...history];
  const cursor    = new Date(lastDate);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= today) {
    const doy = dayOfYear(cursor);
    extended.push({
      date:  cursor.toISOString().slice(0, 10),
      value: seasonal[doy] ?? parseFloat(fallback.toFixed(2)),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return extended;
}

// ─── Per-facility history ─────────────────────────────────────────────────────

/**
 * Apply facility vulnerability to each data point in the district history.
 * This creates a time series that represents THIS facility's actual risk
 * over the past 5 years — not just the district climate.
 *
 * vulnerability: 0.0 (very safe) → 1.0 (very vulnerable)
 *
 * Formula: facilityValue = districtValue × (0.5 + 1.0 × vulnerability)
 * Result:
 *   vulnerability 0.2 → each point scaled by 0.70 (safer than average)
 *   vulnerability 0.5 → each point scaled by 1.00 (average)
 *   vulnerability 0.9 → each point scaled by 1.40 (more vulnerable)
 */
export function buildFacilityHistory(
  districtHistory: HistoryRow[],
  vulnerability:   number,
): HistoryRow[] {
  const scale = 0.85 + 0.30 * Math.max(0, Math.min(1, vulnerability));
  return districtHistory.map((row) => ({
    date:  row.date,
    value: parseFloat(Math.max(0, Math.min(100, row.value * scale)).toFixed(2)),
  }));
}

// ─── ML service call ──────────────────────────────────────────────────────────

const ML_TIMEOUT_MS = 15_000;

async function postWithTimeout(url: string, body: unknown): Promise<Response> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ML_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Per-facility forecast ────────────────────────────────────────────────────

/**
 * Run ML forecast for one specific facility.
 * Uses a facility-specific history (district weather × vulnerability).
 * Falls back to seasonal statistics if ML service is unavailable.
 */
export async function runFacilityForecast(params: {
  facilityId:    string;
  facilityName:  string;
  districtCode:  string;
  districtName:  string;
  vulnerability: number;      // 0–1
  districtHistory: HistoryRow[];
  horizon:       number;
  model:         ModelType;
}): Promise<ForecastResult> {
  const {
    facilityId, facilityName, districtCode, districtName,
    vulnerability, districtHistory, horizon, model,
  } = params;

  // Build this facility's unique risk history
  const facilityHistory = buildFacilityHistory(districtHistory, vulnerability);

  const body = {
    data:        facilityHistory,
    horizon,
    model,
    metric_name: "risk_score",
    state:       `${districtCode}_${facilityId}`,
  };

  try {
    const res  = await postWithTimeout("/api/forecast", body);
    const text = await res.text();

    type ApiResp = {
      forecast: { date: string; predicted: number }[];
      mape:     number | null;
    };

    let data: ApiResp;
    try {
      data = JSON.parse(text) as ApiResp;
    } catch {
      throw new Error(`Non-JSON response (status ${res.status})`);
    }

    if (!res.ok) {
      const d = data as unknown as Record<string, string>;
      throw new Error(d?.detail ?? d?.error ?? `HTTP ${res.status}`);
    }

    const last = data.forecast[data.forecast.length - 1];
    if (!last) throw new Error("Empty forecast");

    return {
      score:       Math.max(0, Math.min(100, parseFloat(last.predicted.toFixed(1)))),
      mape:        data.mape,
      source:      "ml",
      facilityId,
      district:    districtName,
    };
  } catch {
    // Seasonal fallback
    const score = statisticalForecast(facilityHistory, horizon);
    return {
      score:       Math.max(0, Math.min(100, score)),
      mape:        null,
      source:      "statistical_fallback",
      facilityId,
      district:    districtName,
    };
  }
}

// ─── Batch runner ─────────────────────────────────────────────────────────────

/**
 * Run per-facility ML forecasts with a concurrency limit.
 * Prevents flooding the ML service with too many parallel requests.
 */
export async function runAllFacilityForecasts<F extends {
  id:          string;
  name:        string;
  district:    string;
  vulnerability: number;
}>(params: {
  facilities:     F[];
  districtHistories: Record<string, HistoryRow[]>;  // districtName → history
  horizon:        number;
  model:          ModelType;
  concurrency?:   number;
  onProgress?:    (done: number, total: number) => void;
}): Promise<ForecastResult[]> {
  const {
    facilities, districtHistories, horizon, model,
    concurrency = 5,
    onProgress,
  } = params;

  const results: ForecastResult[] = [];
  let  done = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < facilities.length; i += concurrency) {
    const batch = facilities.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map((f) => {
        const districtHistory = districtHistories[f.district] ?? [];
        const code = f.district.toLowerCase().replace(/\s+/g, "_").slice(0, 3);
        return runFacilityForecast({
          facilityId:      f.id,
          facilityName:    f.name,
          districtCode:    code,
          districtName:    f.district,
          vulnerability:   f.vulnerability,
          districtHistory,
          horizon,
          model,
        });
      }),
    );

    results.push(...batchResults);
    done += batch.length;
    onProgress?.(done, facilities.length);
  }

  return results;
}