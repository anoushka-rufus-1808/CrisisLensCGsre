import { useState, useEffect, useRef, useMemo } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format, parseISO, addDays } from "date-fns";
import { useHistoricalData } from "@/hooks/useHistoricalData";

function computeRiskScore(temp: number, humidity: number, rain: number): number {
  const heat  = Math.max(0, Math.min(100, ((temp - 15) / 30) * 100));
  const humid = Math.max(0, Math.min(100, humidity));
  const flood = Math.max(0, Math.min(100, (rain / 80) * 100));
  return parseFloat((heat * 0.35 + humid * 0.25 + flood * 0.40).toFixed(2));
}

function useDailyWeather() {
  const [data,      setData]      = useState<{ date: string; value: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/data/historical/durg_weather.csv`)
      .then((r) => {
        if (!r.ok) throw new Error(`CSV fetch failed: ${r.status}`);
        return r.text();
      })
      .then((text) => {
        const lines = text.trim().split("\n");
        const rows = lines.slice(1)
          .map((line) => line.split(","))
          .filter((cols) => cols.length >= 7 && cols[1])
          .map((cols) => ({
            date:  cols[1].trim(),
            value: computeRiskScore(
              parseFloat(cols[2]) || 0,
              parseFloat(cols[5]) || 0,
              parseFloat(cols[6]) || 0,
            ),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
        setData(rows);
        setIsLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setIsLoading(false);
      });
  }, []);

  return { data, isLoading, error };
}

type ForecastPoint   = { date: string; predicted: number; lower: number; upper: number };
type ModelResult     = { forecast: ForecastPoint[]; mape: number | null };
type SingleResponse  = { metric_name: string; state: string | null; model: string; horizon: number; forecast: ForecastPoint[]; training_points: number; mape: number | null };
type CompareResponse = { metric_name: string; state: string | null; horizon: number; prophet: ModelResult; random_forest: ModelResult };

const HORIZONS = [30, 60, 90] as const;
type Horizon = (typeof HORIZONS)[number];
const MODELS = ["prophet", "random_forest", "compare"] as const;
type Model = (typeof MODELS)[number];
const MODEL_LABELS: Record<Model, string> = {
  prophet: "Prophet", random_forest: "Random Forest", compare: "Compare Both",
};
const ACCENT = { prophet: "#6366f1", random_forest: "#f59e0b", actual: "#10b981" };

function buildSeasonalMap(history: { date: string; value: number }[]): Record<number, number> {
  const doyBuckets: Record<number, number[]> = {};
  for (const row of history) {
    const d   = new Date(row.date);
    const jan = new Date(d.getFullYear(), 0, 0);
    const doy = Math.round((d.getTime() - jan.getTime()) / 86400000);
    if (!doyBuckets[doy]) doyBuckets[doy] = [];
    doyBuckets[doy].push(row.value);
  }
  const result: Record<number, number> = {};
  for (const [doy, vals] of Object.entries(doyBuckets)) {
    result[+doy] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  }
  return result;
}

function labelForIdx(forecast: ForecastPoint[], idx: number): string {
  const pt = forecast[idx];
  if (!pt) return `Day ${idx + 1}`;
  return format(parseISO(pt.date), "d MMM");
}

function MapeTag({ mape, model }: { mape: number | null; model: string }) {
  if (mape === null) return null;
  const c = mape < 5 ? "text-emerald-400" : mape < 15 ? "text-yellow-400" : "text-red-400";
  return (
    <span className={`text-xs font-mono font-semibold ${c}`}>
      {model} MAPE: {mape.toFixed(1)}%
    </span>
  );
}

const TIP = {
  contentStyle: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 },
  labelStyle:   { color: "#94a3b8" },
  itemStyle:    { color: "#e2e8f0" },
};

function SingleChart({ data, color, forecastKey }: {
  data: object[]; color: string; forecastKey: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="conf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} interval="preserveStartEnd" tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
        <Tooltip {...TIP} />
        <Area type="monotone" dataKey="upper" stroke="none" fill="url(#conf)" stackId="b" legendType="none" activeDot={false} />
        <Area type="monotone" dataKey="lower" stroke="none" fill="#0f172a"    stackId="b" legendType="none" activeDot={false} />
        <Line type="monotone" dataKey={forecastKey} stroke={color} strokeWidth={2.5} dot={false} strokeDasharray="6 3" name="Forecast" />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function CompareChart({ data }: { data: object[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} interval="preserveStartEnd" tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
        <Tooltip {...TIP} />
        <Line type="monotone" dataKey="prophet_pred" stroke={ACCENT.prophet}       strokeWidth={2.5} dot={false} strokeDasharray="6 3" name="Prophet" />
        <Line type="monotone" dataKey="rf_pred"      stroke={ACCENT.random_forest} strokeWidth={2.5} dot={false} strokeDasharray="8 4" name="Random Forest" />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Safe JSON fetch ───────────────────────────────────────────────────────────
// Prevents "Unexpected token 'I'" crash when server returns plain-text errors.
async function safePostJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Cannot reach the forecast service — is it running on port 8001?");
  }

  const text = await res.text();

  // Parse response text as JSON (guards against plain "Internal Server Error")
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      res.ok
        ? `Unexpected server response: "${text.slice(0, 120)}"`
        : `Forecast service error (${res.status}): "${text.slice(0, 120)}"`,
    );
  }

  if (!res.ok) {
    const d = data as Record<string, string>;
    throw new Error(d?.detail ?? d?.error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

export default function ForecastPanel() {
  const [horizon, setHorizon] = useState<Horizon>(90);
  const [model,   setModel]   = useState<Model>("prophet");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<SingleResponse | CompareResponse | null>(null);

  const { data: HISTORY, isLoading: dataLoading, error: dataError } = useDailyWeather();
  const { weather: yearlyStats } = useHistoricalData();
  const latestYear = yearlyStats[yearlyStats.length - 1];

  const todayLabel       = format(new Date(), "MMM d");
  const forecastEndLabel = useMemo(() => format(addDays(new Date(), horizon), "MMMM yyyy"), [horizon]);

  const isReady = !dataLoading && HISTORY.length >= 20;

  const horizonRef = useRef(horizon);
  const modelRef   = useRef(model);
  horizonRef.current = horizon;
  modelRef.current   = model;

  // Abort controller — cancels in-flight request if user navigates away
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const runForecast = async (h: Horizon, m: Model) => {
    // Cancel any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const seasonal    = buildSeasonalMap(HISTORY);
      const fallbackAvg = HISTORY.slice(-60).reduce((s, r) => s + r.value, 0) / Math.min(60, HISTORY.length);
      const lastCsvDate = new Date(HISTORY[HISTORY.length - 1]?.date ?? new Date().toISOString().slice(0, 10));
      const todayDate   = new Date(); todayDate.setHours(0, 0, 0, 0);
      const extended    = [...HISTORY];
      const cursor      = new Date(lastCsvDate);
      cursor.setDate(cursor.getDate() + 1);

      while (cursor <= todayDate) {
        const jan = new Date(cursor.getFullYear(), 0, 0);
        const doy = Math.round((cursor.getTime() - jan.getTime()) / 86400000);
        extended.push({
          date:  cursor.toISOString().slice(0, 10),
          value: seasonal[doy] ?? parseFloat(fallbackAvg.toFixed(2)),
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      const endpoint = m === "compare" ? "/api/forecast/compare" : "/api/forecast";
      const payload  = {
        data:        extended,
        horizon:     h,
        model:       m === "compare" ? "prophet" : m,
        metric_name: "risk_score",
        state:       "Durg",
      };

      // FIX: safePostJson handles plain-text error responses without crashing
      const data = await safePostJson<SingleResponse | CompareResponse>(
        endpoint,
        payload,
        controller.signal,
      );

      // Only update state if this request wasn't cancelled
      if (!controller.signal.aborted) {
        setResult(data);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return; // navigated away — ignore
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const autoRan = useRef(false);
  useEffect(() => {
    if (isReady && !autoRan.current) {
      autoRan.current = true;
      runForecast(horizonRef.current, modelRef.current);
    }
  }, [isReady]);

  const handleForecast = () => runForecast(horizon, model);

  const chartData = useMemo(() => {
    if (!result) return null;
    if ("prophet" in result) {
      const r = result as CompareResponse;
      return r.prophet.forecast.map((f, i) => ({
        date:         f.date,
        prophet_pred: +f.predicted.toFixed(2),
        rf_pred:      +(r.random_forest.forecast[i]?.predicted ?? 0).toFixed(2),
        label:        format(parseISO(f.date), "MMM d"),
      }));
    }
    const fc = (result as SingleResponse).forecast;
    return fc.map((f) => ({
      date:      f.date,
      predicted: +f.predicted.toFixed(2),
      lower:     +f.lower.toFixed(2),
      upper:     +f.upper.toFixed(2),
      label:     format(parseISO(f.date), "MMM d"),
    }));
  }, [result]);

  return (
    <div className="min-h-screen bg-[#080f1a] text-slate-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Durg Climate Risk Forecast</h1>
            <p className="text-sm text-slate-400 mt-1">
              Climate index (heat 35% · humidity 25% · rainfall 40%) · predicting through{" "}
              <span className="text-slate-300 font-medium">{forecastEndLabel}</span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {latestYear && (
              <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full font-mono">
                {latestYear.year} peak: {latestYear.summerPeakMaxTemp}°C
              </span>
            )}
            <span className={`text-xs px-3 py-1 rounded-full font-mono border ${
              dataLoading ? "bg-slate-800 text-slate-400 border-slate-700"
              : dataError  ? "bg-red-900/40 text-red-300 border-red-800"
                           : "bg-emerald-900/40 text-emerald-400 border-emerald-800"
            }`}>
              {dataLoading ? "Loading…" : dataError ? "CSV error" : `${HISTORY.length.toLocaleString()} records`}
            </span>
          </div>
        </div>

        {dataError && (
          <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-xl p-4 text-sm">
            <span className="font-semibold">Could not load durg_weather.csv: </span>{dataError}
          </div>
        )}

        {/* Controls */}
        <div className="bg-[#0d1826] border border-slate-800 rounded-xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Forecast Horizon</label>
              <div className="flex gap-2">
                {HORIZONS.map((h) => (
                  <button key={h} onClick={() => setHorizon(h)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                      horizon === h ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}>{h}d
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-600">Until: {forecastEndLabel}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Model</label>
              <div className="flex flex-col gap-1.5">
                {MODELS.map((m) => (
                  <button key={m} onClick={() => setModel(m)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold text-left transition-all border ${
                      model === m
                        ? m === "compare"
                          ? "bg-gradient-to-r from-indigo-900/60 to-amber-900/60 border-indigo-700/50 text-slate-100"
                          : m === "prophet"
                          ? "bg-indigo-900/50 border-indigo-700 text-indigo-300"
                          : "bg-amber-900/50 border-amber-700 text-amber-300"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700 border-transparent"
                    }`}>
                    {MODEL_LABELS[m]}
                    {m === "compare" && <span className="ml-2 text-[10px] opacity-60">side-by-side</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-end gap-2">
              <button onClick={handleForecast} disabled={loading || !isReady}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-sm transition-all">
                {loading
                  ? <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Running model…
                    </span>
                  : dataLoading ? "Loading weather data…"
                  : `Run ${horizon}-Day Forecast`}
              </button>
              <p className="text-[11px] text-slate-500 text-center">Raw climate index — for facility-adjusted risk use Predictive Risk Pipeline</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4 text-[11px] font-mono">
          <span className="text-emerald-400">0–30 = Low Risk</span>
          <span className="text-yellow-400">30–60 = Medium Risk</span>
          <span className="text-red-400">60–100 = High Risk</span>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-xl p-4 text-sm">
            <span className="font-semibold">Error: </span>{error}
          </div>
        )}

        {loading && !result && (
          <div className="bg-[#0d1826] border border-slate-800 rounded-xl p-16 text-center">
            <svg className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p className="text-slate-400 text-sm">
              Running {MODEL_LABELS[model === "compare" ? "prophet" : model]} on {HISTORY.length.toLocaleString()} records…
            </p>
            <p className="text-slate-600 text-xs mt-1">Forecasting through {forecastEndLabel}</p>
          </div>
        )}

        {result && chartData && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 items-center">
              {"prophet" in result ? (
                <>
                  <MapeTag mape={(result as CompareResponse).prophet.mape}       model="Prophet" />
                  <MapeTag mape={(result as CompareResponse).random_forest.mape} model="Random Forest" />
                </>
              ) : (
                <MapeTag mape={(result as SingleResponse).mape} model={MODEL_LABELS[model as Exclude<Model, "compare">]} />
              )}
              <span className="text-xs text-slate-500 ml-auto">
                {result.horizon}-day horizon · Today: {todayLabel} → {forecastEndLabel}
              </span>
            </div>

            <div className="bg-[#0d1826] border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-1">
                Durg Climate Risk Index —{" "}
                {"prophet" in result ? "Prophet vs Random Forest" : MODEL_LABELS[model as Exclude<Model, "compare">]}{" "}
                (through {forecastEndLabel})
              </h2>
              <p className="text-[11px] text-slate-600 mb-4">
                Forecast starts today ({todayLabel}) · Trained on 10 years of Durg weather data
              </p>
              {"prophet" in result
                ? <CompareChart data={chartData} />
                : <SingleChart data={chartData} forecastKey="predicted"
                    color={model === "prophet" ? ACCENT.prophet : ACCENT.random_forest} />}
              <p className="text-[11px] text-slate-600 mt-3">
                Shaded = 95% confidence interval · Dashed = forecast from today
              </p>
            </div>

            <div className="bg-[#0d1826] border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Forecast Summary</h2>
              <div className="grid grid-cols-3 gap-3">
                {(() => {
                  const forecast = "prophet" in result
                    ? (result as CompareResponse).prophet.forecast
                    : (result as SingleResponse).forecast;
                  const pts = [
                    { idx: 0,                              label: labelForIdx(forecast, 0) },
                    { idx: Math.floor(result.horizon / 2), label: labelForIdx(forecast, Math.floor(result.horizon / 2)) },
                    { idx: result.horizon - 1,             label: labelForIdx(forecast, result.horizon - 1) },
                  ];
                  return pts.map(({ idx, label }) => {
                    const pt  = forecast[idx];
                    const col = !pt ? "" : pt.predicted < 30 ? "text-emerald-300"
                                        : pt.predicted < 60 ? "text-yellow-300" : "text-red-300";
                    return (
                      <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                        <p className="text-[11px] text-slate-500 mb-1">{label}</p>
                        {pt ? (
                          <>
                            <p className={`text-xl font-bold ${col}`}>{pt.predicted.toFixed(1)}</p>
                            <p className="text-[11px] text-slate-500">[{pt.lower.toFixed(1)}, {pt.upper.toFixed(1)}]</p>
                            <p className="text-[10px] text-slate-600">{pt.date}</p>
                          </>
                        ) : <p className="text-slate-600">—</p>}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}