import { useState, useEffect, useRef, useMemo } from "react";
import { format, addDays } from "date-fns";
import { useData } from "@/context/DataContext";
import type { Facility } from "@/context/DataContext";
import { TrendingUp, TrendingDown, Minus, School, Hospital, AlertTriangle, Info } from "lucide-react";

function computeRiskScore(temp: number, humidity: number, rain: number): number {
  const heat  = Math.max(0, Math.min(100, ((temp - 15) / 30) * 100));
  const humid = Math.max(0, Math.min(100, humidity));
  const flood = Math.max(0, Math.min(100, (rain / 80) * 100));
  return parseFloat((heat * 0.35 + humid * 0.25 + flood * 0.40).toFixed(2));
}

function buildSeasonalMap(history: { date: string; value: number }[]): Record<number, number> {
  const buckets: Record<number, number[]> = {};
  for (const row of history) {
    const d   = new Date(row.date);
    const jan = new Date(d.getFullYear(), 0, 0);
    const doy = Math.round((d.getTime() - jan.getTime()) / 86400000);
    if (!buckets[doy]) buckets[doy] = [];
    buckets[doy].push(row.value);
  }
  const result: Record<number, number> = {};
  for (const [doy, vals] of Object.entries(buckets)) {
    result[+doy] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  }
  return result;
}

function useDailyWeather() {
  const [data,      setData]      = useState<{ date: string; value: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/data/historical/durg_weather.csv`)
      .then((r) => { if (!r.ok) throw new Error(`CSV ${r.status}`); return r.text(); })
      .then((text) => {
        const rows = text.trim().split("\n").slice(1)
          .map((l) => l.split(","))
          .filter((c) => c.length >= 7 && c[1])
          .map((c) => ({
            date:  c[1].trim(),
            value: computeRiskScore(parseFloat(c[2]) || 0, parseFloat(c[5]) || 0, parseFloat(c[6]) || 0),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
        setData(rows);
        setIsLoading(false);
      })
      .catch((e: unknown) => { setError(String(e)); setIsLoading(false); });
  }, []);

  return { data, isLoading, error };
}

type RiskLevel = "Low" | "Medium" | "High";
type ModelType = "prophet" | "random_forest";

interface ProjectedFacility {
  facility:          Facility;
  currentOverall:    number;
  currentLevel:      RiskLevel;
  projectedHeatwave: number;
  projectedOverall:  number;
  projectedLevel:    RiskLevel;
  change:            number;
}

function projectFacilities(
  facilities:       Facility[],
  mlScore:          number,
  districtBaseline: number,
): ProjectedFacility[] {
  const scaleFactor = districtBaseline > 0
    ? Math.max(0.5, Math.min(2.0, mlScore / districtBaseline))
    : 1;

  return facilities.map((f) => {
    const projectedHeatwave = Math.min(95, Math.round(f.riskHeatwave * scaleFactor));
    const projectedOverall  = Math.min(100, Math.round(
      projectedHeatwave * 0.5 + f.riskWaterScarcity * 0.3 + f.riskInfrastructure * 0.2
    ));
    const projectedLevel: RiskLevel =
      projectedOverall >= 68 ? "High" : projectedOverall >= 45 ? "Medium" : "Low";

    return {
      facility:         f,
      currentOverall:   f.riskOverall,
      currentLevel:     f.riskLevel as RiskLevel,
      projectedHeatwave,
      projectedOverall,
      projectedLevel,
      change:           projectedOverall - f.riskOverall,
    };
  });
}

const LEVEL_COLORS: Record<RiskLevel, string> = {
  High:   "bg-red-900/40 text-red-300 border-red-800",
  Medium: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  Low:    "bg-emerald-900/40 text-emerald-300 border-emerald-800",
};

function ChangeIcon({ change }: { change: number }) {
  if (change > 3)  return <TrendingUp  className="w-4 h-4 text-red-400" />;
  if (change < -3) return <TrendingDown className="w-4 h-4 text-emerald-400" />;
  return <Minus className="w-4 h-4 text-slate-500" />;
}

const HORIZONS = [30, 60, 90] as const;
type Horizon = (typeof HORIZONS)[number];

const MODEL_INFO: Record<ModelType, { label: string; badge: string; strength: string; bestFor: string; color: string; selectedBg: string }> = {
  prophet: {
    label:      "Prophet",
    badge:      "Facebook Prophet",
    strength:   "MAPE ~10%",
    bestFor:    "Best for 60–90 day seasonal forecasts",
    color:      "text-blue-600",
    selectedBg: "bg-blue-600 text-white",
  },
  random_forest: {
    label:      "Random Forest",
    badge:      "Random Forest",
    strength:   "MAPE ~4.8%",
    bestFor:    "Best for 30-day short-range accuracy",
    color:      "text-orange-600",
    selectedBg: "bg-orange-500 text-white",
  },
};

// FIX: safe fetch — reads body as text first, then parses JSON.
// Prevents "Unexpected token 'I'" crash when the server returns
// plain-text "Internal Server Error" instead of a JSON body.
async function safeForecastPost(
  url: string,
  body: unknown,
): Promise<{ forecast: { date: string; predicted: number }[]; mape: number | null }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the forecast service — is it running on port 8001?");
  }

  const text = await res.text();

  type ApiResponse = { forecast: { date: string; predicted: number }[]; mape: number | null };
  let data: ApiResponse;
  try {
    data = JSON.parse(text) as ApiResponse;
  } catch {
    throw new Error(
      res.ok
        ? `Unexpected server response: "${text.slice(0, 120)}"`
        : `Forecast service error (${res.status}): "${text.slice(0, 120)}"`,
    );
  }

  if (!res.ok) {
    const d = data as unknown as Record<string, string>;
    throw new Error(d?.detail ?? d?.error ?? `HTTP ${res.status}`);
  }

  return data;
}

export default function FutureRisk() {
  const { facilities } = useData();
  const { data: HISTORY, isLoading: csvLoading, error: csvError } = useDailyWeather();

  const [horizon,     setHorizon]     = useState<Horizon>(30);
  const [model,       setModel]       = useState<ModelType>("prophet");
  const [mlScore,     setMlScore]     = useState<number | null>(null);
  const [mape,        setMape]        = useState<number | null>(null);
  const [fetching,    setFetching]    = useState(false);
  const [apiError,    setApiError]    = useState<string | null>(null);
  const [filterType,  setFilterType]  = useState<"all" | "school" | "hospital">("all");
  const [filterLevel, setFilterLevel] = useState<"all" | RiskLevel>("all");
  const [showModelInfo, setShowModelInfo] = useState(false);

  const isReady = !csvLoading && HISTORY.length >= 20;

  const districtBaseline = useMemo(() => {
    if (!facilities.length) return 50;
    return facilities.reduce((s, f) => s + f.riskHeatwave, 0) / facilities.length;
  }, [facilities]);

  const targetMonthLabel = useMemo(
    () => format(addDays(new Date(), horizon), "MMMM yyyy"),
    [horizon]
  );

  const runForecast = async (h: Horizon, m: ModelType) => {
    setFetching(true); setApiError(null); setMlScore(null); setMape(null);
    try {
      const seasonal  = buildSeasonalMap(HISTORY);
      const fallback  = HISTORY.slice(-60).reduce((s, r) => s + r.value, 0) / Math.min(60, HISTORY.length);
      const lastDate  = new Date(HISTORY[HISTORY.length - 1]?.date ?? new Date().toISOString().slice(0, 10));
      const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
      const extended  = [...HISTORY];
      const cursor    = new Date(lastDate);
      cursor.setDate(cursor.getDate() + 1);
      while (cursor <= todayDate) {
        const jan = new Date(cursor.getFullYear(), 0, 0);
        const doy = Math.round((cursor.getTime() - jan.getTime()) / 86400000);
        extended.push({
          date:  cursor.toISOString().slice(0, 10),
          value: seasonal[doy] ?? parseFloat(fallback.toFixed(2)),
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      // FIX: use safeForecastPost instead of raw fetch + res.json()
      const data = await safeForecastPost("/api/forecast", {
        data:        extended,
        horizon:     h,
        model:       m,
        metric_name: "risk_score",
        state:       "Durg",
      });

      const targetPoint = data.forecast[data.forecast.length - 1];
      setMlScore(targetPoint?.predicted ?? null);
      setMape(data.mape ?? null);
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  };

  const autoRan = useRef(false);
  useEffect(() => {
    if (isReady && !autoRan.current) {
      autoRan.current = true;
      runForecast(horizon, model);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const handleHorizonChange = (h: Horizon) => { setHorizon(h); if (isReady) runForecast(h, model); };
  const handleModelChange   = (m: ModelType) => { setModel(m); if (isReady) runForecast(horizon, m); };

  const projected = useMemo<ProjectedFacility[]>(() => {
    if (mlScore === null || !facilities.length) return [];
    return projectFacilities(facilities, mlScore, districtBaseline)
      .sort((a, b) => b.projectedOverall - a.projectedOverall);
  }, [mlScore, facilities, districtBaseline]);

  const filtered = useMemo(() => projected.filter((p) => {
    if (filterType  !== "all" && p.facility.facilityType !== filterType) return false;
    if (filterLevel !== "all" && p.projectedLevel !== filterLevel)        return false;
    return true;
  }), [projected, filterType, filterLevel]);

  const highCount   = projected.filter((p) => p.projectedLevel === "High").length;
  const mediumCount = projected.filter((p) => p.projectedLevel === "Medium").length;
  const lowCount    = projected.filter((p) => p.projectedLevel === "Low").length;

  const info = MODEL_INFO[model];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Future Facility Risk</h1>
          <p className="text-sm text-gray-500 mt-1">
            Per-school &amp; hospital projections driven by ML forecast ·{" "}
            <span className="font-medium text-gray-700">Target: {targetMonthLabel}</span>
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Target Month</p>
              <div className="flex gap-2">
                {HORIZONS.map((h) => (
                  <button key={h} onClick={() => handleHorizonChange(h)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      horizon === h ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}>
                    {format(addDays(new Date(), h), "MMM")}
                    <span className="text-[10px] ml-1 opacity-70">+{h}d</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ML Model</p>
                <button onClick={() => setShowModelInfo(!showModelInfo)} className="text-gray-400 hover:text-gray-600">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                {(Object.keys(MODEL_INFO) as ModelType[]).map((m) => (
                  <button key={m} onClick={() => handleModelChange(m)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      model === m ? MODEL_INFO[m].selectedBg : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}>
                    {MODEL_INFO[m].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ml-auto self-center">
              {fetching && (
                <div className="flex items-center gap-2 text-indigo-600 text-sm">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Running {info.label}…
                </div>
              )}
              {mlScore !== null && !fetching && (
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-0.5">
                    <span className={`font-bold ${info.color}`}>{info.label}</span> signal for {targetMonthLabel}
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <span className={`font-black text-2xl ${
                      mlScore >= 60 ? "text-red-600" : mlScore >= 30 ? "text-yellow-600" : "text-emerald-600"
                    }`}>{mlScore.toFixed(1)}</span>
                    <span className="text-xs text-gray-400">/ 100</span>
                    {mape !== null && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">
                        MAPE {mape.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {showModelInfo && (
            <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
              {(Object.entries(MODEL_INFO) as [ModelType, typeof MODEL_INFO[ModelType]][]).map(([key, m]) => (
                <div key={key} className={`rounded-lg p-3 border ${
                  model === key ? "border-indigo-300 bg-indigo-50" : "border-gray-200 bg-gray-50"
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-bold ${m.color}`}>{m.badge}</span>
                    {model === key && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold">ACTIVE</span>}
                  </div>
                  <p className="text-xs text-gray-500">{m.bestFor}</p>
                  <p className="text-xs font-semibold text-gray-700 mt-1">{m.strength}</p>
                </div>
              ))}
              <div className="col-span-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <span className="font-semibold">Recommendation: </span>
                Use <span className="font-bold">Prophet</span> for August/September (60–90 days). Use{" "}
                <span className="font-bold">Random Forest</span> for July (30 days).
              </div>
            </div>
          )}
        </div>

        {csvError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">CSV load error: {csvError}</div>
        )}
        {apiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            Forecast API error: {apiError}
          </div>
        )}

        {projected.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "High Risk",   count: highCount,   color: "text-red-600",     bg: "bg-red-50 border-red-200",         level: "High"   as const },
              { label: "Medium Risk", count: mediumCount, color: "text-yellow-600",  bg: "bg-yellow-50 border-yellow-200",   level: "Medium" as const },
              { label: "Low Risk",    count: lowCount,    color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", level: "Low"    as const },
            ].map(({ label, count, color, bg, level }) => (
              <button key={label} onClick={() => setFilterLevel(filterLevel === level ? "all" : level)}
                className={`${bg} border rounded-xl p-4 text-left transition-all hover:shadow-sm ${filterLevel === level ? "ring-2 ring-offset-1 ring-indigo-400" : ""}`}>
                <div className={`text-2xl font-black ${color}`}>{count}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label} facilities</div>
              </button>
            ))}
          </div>
        )}

        {projected.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {(["all", "school", "hospital"] as const).map((t) => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filterType === t ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}>
                {t === "all" ? "All Facilities" : t === "school" ? "Schools" : "Hospitals"}
              </button>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Facility</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Current</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Projected ({targetMonthLabel})</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Change</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(({ facility, currentOverall, currentLevel, projectedOverall, projectedLevel, change }) => (
                  <tr key={facility.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {facility.facilityType === "school"
                          ? <School   className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          : <Hospital className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{facility.name}</div>
                          <div className="text-xs text-gray-400">{facility.district}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${currentLevel === "High" ? "text-red-600" : currentLevel === "Medium" ? "text-yellow-600" : "text-emerald-600"}`}>
                        {currentOverall}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold text-base ${projectedLevel === "High" ? "text-red-600" : projectedLevel === "Medium" ? "text-yellow-600" : "text-emerald-600"}`}>
                        {projectedOverall}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <ChangeIcon change={change} />
                        <span className={`text-xs font-semibold ${change > 3 ? "text-red-500" : change < -3 ? "text-emerald-500" : "text-gray-400"}`}>
                          {change > 0 ? "+" : ""}{change}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${LEVEL_COLORS[projectedLevel]}`}>
                        {projectedLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!fetching && !apiError && projected.length === 0 && isReady && (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No facility projections yet. Run the forecast above.</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
          <span className="font-semibold">How projections work: </span>
          <span className="font-bold">{info.label}</span> forecasts the district climate score for {targetMonthLabel}. Each
          facility's heatwave risk is scaled proportionally; water and infrastructure scores stay fixed.
          Overall = Heatwave 50% + Water 30% + Infra 20%.
        </div>
      </div>
    </div>
  );
}