import { useState, useEffect, useRef, useMemo } from "react";
import { format, addDays } from "date-fns";
import {
  MapContainer, TileLayer, CircleMarker,
  Tooltip as LeafletTooltip, GeoJSON,
} from "react-leaflet";
import { useData, Facility } from "@/context/DataContext";
import { AlertModal } from "@/components/AlertModal";
import { getDistrict } from "@/data/cgDistricts";
import {
  loadDistrictCSV, extendToToday,
  type ModelType, type ForecastResult,
} from "@/utils/mlForecast";
import {
  AlertTriangle, MapPin, School, Hospital,
  Droplets, Wind, Sun, CloudRain,
  BrainCircuit, RefreshCw, WifiOff, CheckCircle2,
} from "lucide-react";

type RiskLevel = "Low" | "Medium" | "High";

const HORIZONS = [30, 60, 90] as const;
type Horizon = (typeof HORIZONS)[number];

const LEVEL_BADGE: Record<RiskLevel, string> = {
  High:   "bg-red-100 text-red-700 border-red-300",
  Medium: "bg-orange-100 text-orange-700 border-orange-300",
  Low:    "bg-green-100 text-green-700 border-green-300",
};

const MODEL_INFO: Record<ModelType, { label: string; activeBg: string }> = {
  prophet:       { label: "Prophet",       activeBg: "bg-blue-600 text-white"   },
  random_forest: { label: "Random Forest", activeBg: "bg-orange-500 text-white" },
};

const CITY_BORDER_COLORS = [
  "border-red-400", "border-green-400", "border-blue-400",
  "border-orange-400", "border-purple-400",
];

function riskColor(level: RiskLevel): string {
  if (level === "High")   return "#ef4444";
  if (level === "Medium") return "#f97316";
  return "#22c55e";
}

function computeVulnerability(f: Facility): number {
  let score = 0.5;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = f as any;
  if (f.facilityType === "school") {
    if (s.buildingCondition === "Poor")                    score += 0.15;
    else if (s.buildingCondition === "Average")            score += 0.07;
    if (s.roofType === "Tin" || s.roofType === "Asbestos") score += 0.10;
    if (!s.tankAvailable)                                  score += 0.08;
    if (!s.waterInToilets)                                 score += 0.05;
    if ((s.heatIllnessCasesCount ?? 0) > 5)               score += 0.10;
    if ((s.closureDaysLastYear   ?? 0) > 10)              score += 0.08;
    if ((s.fansWorkingCount      ?? 1) === 0)             score += 0.07;
  } else {
    if (!s.generatorAvailable)                            score += 0.15;
    if ((s.backupDurationHours   ?? 4) < 4)              score += 0.10;
    if (!s.ambulanceAvailable)                            score += 0.08;
    if (s.sanitationCondition === "Poor")                 score += 0.10;
    else if (s.sanitationCondition === "Average")         score += 0.05;
    if ((s.heatstrokeCasesCount        ?? 0) > 10)       score += 0.10;
    if ((s.waterScarcityDisruptionDays ?? 0) > 5)        score += 0.07;
  }
  if (f.primaryWaterSource === "tanker")                  score += 0.12;
  else if (f.primaryWaterSource === "handpump")           score += 0.07;
  if (!f.alternateWaterSource)                            score += 0.05;
  if (f.waterShortageDaysPerMonth > 10)                   score += 0.08;
  return Math.min(1.0, score);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useCGGeoJson(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gj, setGj] = useState<any>(null);
  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/data/chhattisgarh-districts.geojson`)
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((j: any) => setGj(j))
      .catch(() => {});
  }, []);
  return gj;
}

interface FacilityMLResult {
  score:  number;
  source: "ml" | "statistical_fallback";
}

export default function Dashboard() {
  const { facilities, weatherLoading, weather, setMLScores, setFacilityMLScores } = useData();
  const cgGeoJson = useCGGeoJson();

  const [selectedFacility,  setSelectedFacility]  = useState<Facility | null>(null);
  const [modalOpen,         setModalOpen]          = useState(false);
  const [horizon,           setHorizon]            = useState<Horizon>(30);
  const [model,             setModel]              = useState<ModelType>("prophet");
  const [fetching,          setFetching]           = useState(false);
  const [apiError,          setApiError]           = useState<string | null>(null);
  const [fallbackDistricts, setFallbackDistricts]  = useState<string[]>([]);
  const [districtResults,   setDistrictResults]    = useState<ForecastResult[]>([]);
  const [facilityResults,   setFacilityResults]    = useState<Record<string, FacilityMLResult>>({});
  const [forecastProgress,  setForecastProgress]   = useState<{ done: number; total: number } | null>(null);
  const [filterType,        setFilterType]         = useState<"all" | "school" | "hospital">("all");
  const [filterLevel,       setFilterLevel]        = useState<"all" | RiskLevel>("all");

  const activeSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => { activeSourceRef.current?.close(); };
  }, []);

  const targetMonthLabel = useMemo(
    () => format(addDays(new Date(), horizon), "MMMM yyyy"),
    [horizon],
  );

  const runForecast = async (h: Horizon, m: ModelType) => {
    if (facilities.length === 0) return;

    activeSourceRef.current?.close();
    activeSourceRef.current = null;

    setFetching(true);
    setApiError(null);
    setFallbackDistricts([]);
    setDistrictResults([]);
    setFacilityResults({});
    setForecastProgress(null);

    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

    try {
      const uniqueDistricts = Array.from(new Set(facilities.map((f) => f.district)));
      const districtHistoryMap: Record<string, import("@/utils/mlForecast").HistoryRow[]> = {};
      const isExactMap: Record<string, boolean> = {};

      await Promise.all(
        uniqueDistricts.map(async (district) => {
          const cfg  = getDistrict(district);
          const code = cfg?.code.toLowerCase() ?? district.slice(0, 3).toLowerCase();
          const { rows, isExact } = await loadDistrictCSV(code, base);
          districtHistoryMap[district] = extendToToday(rows);
          isExactMap[district]         = isExact;
        }),
      );

      const startRes = await fetch("/api/forecast/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilities:        facilities.map((f) => ({ ...f, vulnerability: computeVulnerability(f) })),
          districtHistories: districtHistoryMap,
          horizon:           h,
          model:             m,
          concurrency:       5,
        }),
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? "Failed to start forecast");
      }
      const { runId } = await startRes.json() as { runId: string };

      const collectedScores: Record<string, number> = {};
      const es = new EventSource(`/api/forecast/stream/${runId}`);
      activeSourceRef.current = es;

      es.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as {
          type:        string;
          done?:       number;
          total?:      number;
          facilityId?: string;
          score?:      number;
          source?:     string;
          district?:   string;
          averages?:   Record<string, number>;
          message?:    string;
        };

        if (msg.type === "progress") {
          setForecastProgress({ done: msg.done!, total: msg.total! });
        }

        if (msg.type === "result" && msg.facilityId != null) {
          const source = (msg.source ?? "statistical_fallback") as "ml" | "statistical_fallback";
          collectedScores[msg.facilityId] = msg.score!;

          setFacilityResults((prev) => ({
            ...prev,
            [msg.facilityId!]: { score: msg.score!, source },
          }));

          if (source === "statistical_fallback" && msg.district) {
            setFallbackDistricts((prev) =>
              prev.includes(msg.district!) ? prev : [...prev, msg.district!],
            );
          }
        }

        if (msg.type === "districtAverages" && msg.averages) {
          const distAvgResults: ForecastResult[] = Object.entries(msg.averages).map(
            ([district, score]) => ({
              district,
              score:  score as number,
              source: (isExactMap[district] ? "ml" : "statistical_fallback") as
                        "ml" | "statistical_fallback",
              mape: null,
            }),
          );
          setDistrictResults(distAvgResults);
          setMLScores(msg.averages);
        }

        if (msg.type === "done") {
          setFacilityMLScores({ ...collectedScores });
          setForecastProgress(null);
          setFetching(false);
          es.close();
          activeSourceRef.current = null;
        }

        if (msg.type === "error") {
          setApiError(msg.message ?? "Forecast failed");
          setForecastProgress(null);
          setFetching(false);
          es.close();
          activeSourceRef.current = null;
        }
      };

      es.onerror = () => {
        setApiError("Lost connection to forecast stream — please try again");
        setForecastProgress(null);
        setFetching(false);
        es.close();
        activeSourceRef.current = null;
      };

    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : String(e));
      setForecastProgress(null);
      setFetching(false);
    }
  };

  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRan.current && facilities.length > 0) {
      autoRan.current = true;
      runForecast(horizon, model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities.length]);

  const handleHorizon = (h: Horizon)   => { setHorizon(h); runForecast(h, model);   };
  const handleModel   = (m: ModelType) => { setModel(m);   runForecast(horizon, m); };

  const sortedFacilities = useMemo(
    () => [...facilities].sort((a, b) => b.riskOverall - a.riskOverall),
    [facilities],
  );

  const filtered = useMemo(
    () => sortedFacilities.filter((f) => {
      if (filterType  !== "all" && f.facilityType !== filterType) return false;
      if (filterLevel !== "all" && f.riskLevel    !== filterLevel) return false;
      return true;
    }),
    [sortedFacilities, filterType, filterLevel],
  );

  const highCount   = facilities.filter((f) => f.riskLevel === "High").length;
  const mediumCount = facilities.filter((f) => f.riskLevel === "Medium").length;
  const lowCount    = facilities.filter((f) => f.riskLevel === "Low").length;

  const mlOnline = districtResults.length > 0
    && fallbackDistricts.length < districtResults.length;

  const avgMlScore = districtResults.length > 0
    ? districtResults.reduce((s, r) => s + r.score, 0) / districtResults.length
    : null;

  const totalForecasted = Object.keys(facilityResults).length;

  return (
    <div className="space-y-6">

      {/* ML Hero Panel */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-900 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BrainCircuit className="w-5 h-5 text-indigo-300" />
              <span className="text-sm font-semibold text-indigo-300 uppercase tracking-wider">
                ML Risk Intelligence · Per-Facility Predictions
              </span>
            </div>
            <h1 className="text-2xl font-black mb-0.5">
              Chhattisgarh Facility Risk Dashboard
            </h1>
            <p className="text-indigo-300 text-sm">
              District weather CSV → Per-facility risk history → ML model →
              Individual facility prediction · Target:{" "}
              <span className="text-white font-semibold">{targetMonthLabel}</span>
            </p>
          </div>

          <div className="text-right">
            {fetching && !forecastProgress ? (
              <div className="flex items-center gap-2 text-indigo-300 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading district data…
              </div>
            ) : fetching && forecastProgress ? (
              <div className="text-right">
                <div className="text-xs text-indigo-400 mb-1">Running per-facility ML…</div>
                <div className="text-2xl font-black text-white">
                  {forecastProgress.done}
                  <span className="text-indigo-400 text-sm font-normal">
                    /{forecastProgress.total}
                  </span>
                </div>
                <div className="text-xs text-indigo-400">facilities done</div>
              </div>
            ) : avgMlScore !== null ? (
              <>
                <div className="text-xs text-indigo-400 mb-0.5">
                  Avg State ML Score · {totalForecasted} facilities
                </div>
                <div className="flex items-baseline gap-1.5 justify-end">
                  <span className={`font-black text-4xl ${
                    avgMlScore >= 60 ? "text-red-400"
                    : avgMlScore >= 30 ? "text-yellow-300"
                    : "text-emerald-400"
                  }`}>
                    {avgMlScore.toFixed(1)}
                  </span>
                  <span className="text-indigo-400 text-sm">/ 100</span>
                </div>
                <div className="flex items-center gap-1.5 justify-end mt-1">
                  {mlOnline ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-300">ML service online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-yellow-400" />
                      <span className="text-[10px] text-yellow-300">Statistical fallback active</span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="text-indigo-400 text-sm">—</div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-6 items-end">
          <div>
            <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wide mb-2">
              Forecast Horizon
            </p>
            <div className="flex gap-2">
              {HORIZONS.map((h) => (
                <button key={h} onClick={() => handleHorizon(h)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    horizon === h
                      ? "bg-white text-indigo-900"
                      : "bg-indigo-700 text-indigo-200 hover:bg-indigo-600"
                  }`}>
                  {format(addDays(new Date(), h), "MMM")}
                  <span className="text-[10px] ml-1 opacity-70">+{h}d</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wide mb-2">
              ML Model
            </p>
            <div className="flex gap-2">
              {(Object.keys(MODEL_INFO) as ModelType[]).map((m) => (
                <button key={m} onClick={() => handleModel(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    model === m
                      ? MODEL_INFO[m].activeBg
                      : "bg-indigo-700 text-indigo-200 hover:bg-indigo-600"
                  }`}>
                  {MODEL_INFO[m].label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => runForecast(horizon, model)}
            disabled={fetching || facilities.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-white text-indigo-900 hover:bg-indigo-50 disabled:opacity-40 transition-all ml-auto"
          >
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "Running…" : "Run Forecast"}
          </button>
        </div>

        {forecastProgress && (
          <div className="mt-4 bg-indigo-950 rounded-xl p-3">
            <div className="flex justify-between text-xs text-indigo-300 mb-1.5">
              <span>Per-facility ML forecasts running…</span>
              <span>{forecastProgress.done} / {forecastProgress.total} facilities</span>
            </div>
            <div className="w-full bg-indigo-900 rounded-full h-2.5">
              <div
                className="bg-white h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${(forecastProgress.done / forecastProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Fallback Warning */}
      {fallbackDistricts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex items-start gap-3">
          <WifiOff className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-yellow-800">
              ML Service Offline — Using Seasonal Statistical Forecast
            </div>
            <div className="text-xs text-yellow-700 mt-1">
              Could not reach the Python ML service at port 8001. Risk values are
              computed from seasonal historical averages.
              <br />
              <span className="font-semibold">Affected districts: </span>
              {fallbackDistricts.join(", ")}.
            </div>
            <div className="text-xs text-yellow-600 mt-1">
              To restore: start your Python service →{" "}
              <code className="font-mono bg-yellow-100 px-1 rounded">
                python forecast-service/main.py
              </code>{" "}
              then click <strong>Run Forecast</strong>.
            </div>
          </div>
        </div>
      )}

      {apiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          ⚠ Forecast error: {apiError}
        </div>
      )}

      {/* District Score Chips */}
      {districtResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-700">
              District Averages — {targetMonthLabel}
            </span>
            <span className="ml-auto text-[10px] text-gray-400">
              {mlOnline ? "🟢 ML model" : "🟡 Statistical fallback"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {districtResults.map((r) => (
              <div key={r.district}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  r.score >= 60
                    ? "bg-red-50 border-red-200 text-red-700"
                    : r.score >= 30
                    ? "bg-orange-50 border-orange-200 text-orange-700"
                    : "bg-green-50 border-green-200 text-green-700"
                }`}>
                {r.district}: <span className="font-black">{r.score.toFixed(0)}</span>
                {r.source === "statistical_fallback" && (
                  <span className="ml-1 opacity-60" title="Statistical fallback">~</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map + Priority Alerts */}
      <div className="grid grid-cols-2 gap-6">

        {/* MAP */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-700">Chhattisgarh State Map</span>
            <span className="ml-auto text-[10px] text-indigo-600 font-semibold">
              {totalForecasted > 0 ? "Per-facility ML risk" : "Loading…"}
            </span>
          </div>
          <div style={{ height: 380, borderRadius: 10, overflow: "hidden", position: "relative", zIndex: 0 }}>
            <MapContainer
              bounds={[[17.78, 80.25], [24.10, 84.40]]}
              style={{ height: "100%", width: "100%", zIndex: 0 }}
              scrollWheelZoom={false}
              zoomControl={true}
              attributionControl={false}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
              {cgGeoJson && (
                <GeoJSON
                  key="cg-districts"
                  data={cgGeoJson}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  style={() => ({
                    color: "#6366f1", weight: 1.2,
                    fillColor: "#e0e7ff", fillOpacity: 0.25, dashArray: "3",
                  })}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onEachFeature={(feature: any, layer: any) => {
                    if (feature?.properties?.district) {
                      layer.bindTooltip(feature.properties.district, {
                        permanent: false, direction: "center",
                      });
                    }
                  }}
                />
              )}
              {facilities.map((f) => (
                <CircleMarker
                  key={f.id}
                  center={[f.coordinates.lat, f.coordinates.lng]}
                  radius={8}
                  pathOptions={{
                    color: "white", weight: 1.5,
                    fillColor:   riskColor(f.riskLevel as RiskLevel),
                    fillOpacity: 0.9,
                  }}
                  eventHandlers={{
                    click: () => { setSelectedFacility(f); setModalOpen(true); },
                  }}
                >
                  <LeafletTooltip direction="top" offset={[0, -8]}>
                    <span className="text-xs font-semibold">{f.name}</span><br />
                    <span className="text-xs text-gray-500">
                      {f.district} · ML Risk {f.riskOverall}%
                    </span>
                  </LeafletTooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          <div className="flex items-center gap-5 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> High
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Medium
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Low
            </span>
            {cgGeoJson && (
              <span className="ml-auto flex items-center gap-1.5 text-indigo-500">
                <span className="w-3 h-3 rounded border border-indigo-400 bg-indigo-50 inline-block" />
                Districts
              </span>
            )}
          </div>
        </div>

        {/* PRIORITY ALERTS */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-semibold text-orange-600">Priority Alerts</span>
            <span className="ml-auto text-[10px] text-gray-400">Per-facility ML risk</span>
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[380px]">
            {sortedFacilities.slice(0, 15).map((f) => {
              const fRes         = facilityResults[f.id];
              const displayScore = f.riskOverall;
              const displayLevel = f.riskLevel as RiskLevel;
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => { setSelectedFacility(f); setModalOpen(true); }}
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="text-sm font-semibold text-gray-800 truncate">{f.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {f.district} · {f.facilityType}
                      {fRes && (
                        <span className={`ml-1.5 text-[10px] font-semibold px-1 py-0.5 rounded ${
                          fRes.source === "ml"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-yellow-50 text-yellow-600"
                        }`}>
                          {fRes.source === "ml" ? "ML" : "~Stat"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${
                      displayLevel === "High"   ? "text-red-600"
                      : displayLevel === "Medium" ? "text-orange-500"
                      : "text-green-600"
                    }`}>
                      {weatherLoading && !fRes
                        ? <span className="text-gray-400 text-xs">…</span>
                        : `${displayScore.toFixed(0)}%`}
                    </span>
                    {displayLevel === "High" && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                        HIGH
                      </span>
                    )}
                    <button
                      className={`text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1 ${
                        displayLevel === "High"
                          ? "bg-red-500 text-white"
                          : "bg-orange-400 text-white"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFacility(f);
                        setModalOpen(true);
                      }}
                    >
                      <AlertTriangle className="w-3 h-3" /> Alert
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary Count Cards */}
      <div className="grid grid-cols-3 gap-4">
        {(
          [
            { label: "High Risk",   count: highCount,   color: "text-red-600",     bg: "bg-red-50 border-red-200",         level: "High"   as RiskLevel },
            { label: "Medium Risk", count: mediumCount, color: "text-orange-600",  bg: "bg-orange-50 border-orange-200",   level: "Medium" as RiskLevel },
            { label: "Low Risk",    count: lowCount,    color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", level: "Low"    as RiskLevel },
          ] as const
        ).map(({ label, count, color, bg, level }) => (
          <button
            key={label}
            onClick={() => setFilterLevel((p) => (p === level ? "all" : level))}
            className={`${bg} border rounded-xl p-4 text-left transition-all hover:shadow-sm ${
              filterLevel === level ? "ring-2 ring-offset-1 ring-indigo-400" : ""
            }`}
          >
            <div className={`text-3xl font-black ${color}`}>{count}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label} facilities</div>
          </button>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap items-center">
        {(["all", "school", "hospital"] as const).map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === t
                ? "bg-indigo-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            {t === "all" ? "All Facilities" : t === "school" ? "Schools" : "Hospitals"}
          </button>
        ))}
        {filterLevel !== "all" && (
          <button onClick={() => setFilterLevel("all")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700">
            {filterLevel} Risk ×
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} of {facilities.length} facilities
        </span>
      </div>

      {/* Facility Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left   text-xs font-semibold text-gray-500 uppercase tracking-wide">Facility</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Per-Facility ML Score</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Risk — {targetMonthLabel}</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Level</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((f) => {
              const fRes = facilityResults[f.id];
              return (
                <tr key={f.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => { setSelectedFacility(f); setModalOpen(true); }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {f.facilityType === "school"
                        ? <School   className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        : <Hospital className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{f.name}</div>
                        <div className="text-xs text-gray-400">{f.district}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold text-base ${
                      (f.riskLevel as RiskLevel) === "High"   ? "text-red-600"
                      : (f.riskLevel as RiskLevel) === "Medium" ? "text-orange-500"
                      : "text-emerald-600"
                    }`}>
                      {fRes !== undefined ? fRes.score.toFixed(1) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold text-base ${
                      (f.riskLevel as RiskLevel) === "High"   ? "text-red-600"
                      : (f.riskLevel as RiskLevel) === "Medium" ? "text-orange-500"
                      : "text-emerald-600"
                    }`}>
                      {f.riskOverall}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${LEVEL_BADGE[f.riskLevel as RiskLevel]}`}>
                      {f.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {fRes !== undefined ? (
                      fRes.source === "ml" ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">
                          ML
                        </span>
                      ) : (
                        <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-semibold">
                          Statistical
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] bg-gray-50 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded font-semibold">
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Methodology Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <span className="font-semibold">Data pipeline: </span>
        District-specific historical weather CSV (Open-Meteo archive) →
        per-facility risk history (district weather × structural vulnerability) →
        <span className="font-bold"> Prophet / Random Forest</span> ML model per facility →
        individual facility predicted risk score.
        No manual formula used as primary risk value.
        {fallbackDistricts.length > 0 && (
          <span className="ml-1 text-yellow-700 font-semibold">
            ⚠ Fallback active for: {fallbackDistricts.join(", ")}.
          </span>
        )}
      </div>

      {/* Live Weather Cards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          <span className="text-sm font-semibold text-gray-700">Live Weather — ML Input Feed</span>
          <span className="text-xs text-gray-400 ml-1">Open-Meteo API</span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {weather.map((w, idx) => (
            <div key={w.city}
              className={`bg-white rounded-xl border-t-4 ${
                CITY_BORDER_COLORS[idx % CITY_BORDER_COLORS.length]
              } border border-gray-200 p-4 shadow-sm ${w.loading ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-gray-800 text-sm truncate mr-1">{w.city}</span>
                <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  {w.loading ? "…" : w.condition}
                </span>
              </div>
              <div className="mb-3">
                {w.loading
                  ? <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
                  : <><span className="text-2xl font-black text-indigo-700">{w.temp}°</span><span className="text-xs text-gray-400 ml-1">C</span></>}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="flex items-center gap-1 text-gray-500">
                  <Droplets className="w-3 h-3 text-blue-400 flex-shrink-0" />
                  <span>{w.loading ? "—" : `${w.humidity}%`}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <CloudRain className="w-3 h-3 text-blue-400 flex-shrink-0" />
                  <span>{w.loading ? "—" : `${w.rainfall}mm`}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <Wind className="w-3 h-3 text-blue-400 flex-shrink-0" />
                  <span>{w.loading ? "—" : `${w.wind}km/h`}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <Sun className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                  <span>{w.loading ? "—" : `UV ${w.uv}`}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedFacility && (
        <AlertModal
          open={modalOpen}
          onOpenChange={(v) => setModalOpen(v)}
          facility={selectedFacility}
        />
      )}
    </div>
  );
}