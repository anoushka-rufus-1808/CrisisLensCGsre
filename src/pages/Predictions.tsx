import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useHistoricalData } from "@/hooks/useHistoricalData";
import { buildForecast } from "@/engine/predictionModel";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Thermometer, Droplets, Activity, Loader2, Building2 } from "lucide-react";

export default function Predictions() {
  const { liveTemp, weatherLoading, facilities } = useData();
  const historical = useHistoricalData();
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>("__district__");

  // Find the selected facility (if any) to read its computed infra score
  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId);
  const facilityInfraScore = selectedFacility?.riskInfrastructure ?? 45;

  const forecast = buildForecast(
    liveTemp,
    historical.tenYearAvgSummerMaxTemp,
    horizon,
    facilityInfraScore,
  );

  const chartData = forecast.map((pt) => ({
    date: pt.date,
    "Projected Max Temp (°C)": pt.projectedMaxTemp,
    "Heatwave Risk": pt.heatwaveRisk,
    "Water Scarcity Risk": pt.waterScarcityRisk,
    "Overall Risk": pt.overallRisk,
    "Rainfall Deficit %": pt.rainfallDeficitPct,
  }));

  const peakHeatwave = forecast.reduce(
    (max, pt) => (pt.heatwaveRisk > max.heatwaveRisk ? pt : max),
    forecast[0] ?? { heatwaveRisk: 0, date: "—", projectedMaxTemp: 0 },
  );

  const peakOverall = forecast.reduce(
    (max, pt) => (pt.overallRisk > max.overallRisk ? pt : max),
    forecast[0] ?? { overallRisk: 0, date: "—" },
  );

  const avgWaterRisk =
    forecast.length > 0
      ? Math.round(forecast.reduce((s, pt) => s + pt.waterScarcityRisk, 0) / forecast.length)
      : 0;

  const modelTempAnchor = liveTemp !== null ? liveTemp : historical.tenYearAvgSummerMaxTemp ?? 39.0;

  const hospitals = facilities.filter((f) => f.facilityType === "hospital");
  const schools   = facilities.filter((f) => f.facilityType === "school");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Predictive Risk Pipeline</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <div className="inline-flex items-center gap-2 bg-green-50 border border-green-300 text-green-800 text-xs font-semibold px-3 py-1.5 rounded-md">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse"></span>
            Model Live — Weighted Regression + Open-Meteo Feed
          </div>
          {weatherLoading ? (
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-md">
              <Loader2 className="w-3 h-3 animate-spin" />
              Fetching live weather anchor…
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-300 text-indigo-800 text-xs font-semibold px-3 py-1.5 rounded-md">
              <Thermometer className="w-3 h-3" />
              Temp anchor: {modelTempAnchor.toFixed(1)}°C (Durg/Bhilai live)
              {historical.tenYearAvgSummerMaxTemp !== null && (
                <span className="text-indigo-500 font-normal ml-1">
                  · 10-yr baseline {historical.tenYearAvgSummerMaxTemp}°C
                </span>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Deterministic forecast using live temperature from Open-Meteo as the seasonal anchor,
          adjusted by 10-year historical summer baselines from Durg weather station data (2015–2025).
        </p>
      </div>

      {/* Facility selector — plugs real infra score into Overall Risk */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Building2 className="w-4 h-4 text-indigo-500" />
          Facility Infrastructure Context:
        </div>
        <select
          value={selectedFacilityId}
          onChange={(e) => setSelectedFacilityId(e.target.value)}
          className="flex-1 min-w-[220px] border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="__district__">District average (infra score: 45)</option>
          <optgroup label="Hospitals">
            {hospitals.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} — infra {f.riskInfrastructure}
              </option>
            ))}
          </optgroup>
          <optgroup label="Schools">
            {schools.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} — infra {f.riskInfrastructure}
              </option>
            ))}
          </optgroup>
        </select>
        {selectedFacility && (
          <div className="flex items-center gap-3 text-xs">
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">
              Infra score: {selectedFacility.riskInfrastructure}
            </span>
            <span className={`px-2.5 py-1 rounded-full font-semibold border ${
              selectedFacility.riskLevel === "High"
                ? "bg-red-50 border-red-200 text-red-700"
                : selectedFacility.riskLevel === "Medium"
                ? "bg-orange-50 border-orange-200 text-orange-700"
                : "bg-green-50 border-green-200 text-green-700"
            }`}>
              {selectedFacility.riskLevel} risk facility
            </span>
            <span className="text-gray-400">
              Overall Risk reflects this facility's infrastructure vulnerability
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-semibold text-gray-700 mr-4">Forecast Horizon:</span>
        {([30, 60, 90] as const).map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
              horizon === h
                ? "bg-indigo-700 text-white border-indigo-700"
                : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
            }`}
          >
            {h} Days
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Thermometer className="w-3 h-3" /> Peak Heatwave Risk
          </div>
          <div className="text-4xl font-black text-red-600">
            {peakHeatwave.heatwaveRisk}
            <span className="text-xl ml-0.5">%</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {peakHeatwave.date} · {peakHeatwave.projectedMaxTemp}°C projected
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Droplets className="w-3 h-3" /> Avg Water Scarcity Risk
          </div>
          <div className="text-4xl font-black text-blue-600">
            {avgWaterRisk}
            <span className="text-xl ml-0.5">%</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">Across {horizon}-day horizon</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Peak Overall Risk
          </div>
          <div className="text-4xl font-black text-purple-600">
            {peakOverall.overallRisk}
            <span className="text-xl ml-0.5">%</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {peakOverall.date}
            {selectedFacility && (
              <span className="ml-1 text-purple-400">· {selectedFacility.name}</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="text-sm font-semibold text-gray-700 mb-1">
          Heatwave Risk vs Water Scarcity Risk vs Overall Risk ({horizon}-Day Forecast)
        </div>
        <div className="text-xs text-gray-400 mb-4">
          Anchored to live {modelTempAnchor.toFixed(1)}°C · Seasonal curve from 2015–2025 Durg station data
          {selectedFacility && (
            <span className="ml-2 text-indigo-500">
              · Overall Risk uses {selectedFacility.name} infra score ({selectedFacility.riskInfrastructure})
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="heatGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="overallGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(val: number, name: string) => [`${val}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Heatwave Risk" stroke="#ef4444" strokeWidth={2} fill="url(#heatGrad)" />
            <Area type="monotone" dataKey="Water Scarcity Risk" stroke="#3b82f6" strokeWidth={2} fill="url(#waterGrad)" />
            <Area type="monotone" dataKey="Overall Risk" stroke="#8b5cf6" strokeWidth={2} fill="url(#overallGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="text-sm font-semibold text-gray-700 mb-4">
          Projected Maximum Temperature Curve ({horizon} Days)
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tempGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={[30, 50]} tick={{ fontSize: 11, fill: "#94a3b8" }} unit="°C" />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(val: number) => [`${val}°C`, "Projected Max Temp"]}
            />
            <Area
              type="monotone"
              dataKey="Projected Max Temp (°C)"
              stroke="#f97316"
              strokeWidth={2.5}
              fill="url(#tempGrad2)"
              dot={{ r: 3, fill: "#f97316" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="text-sm font-semibold text-gray-700 mb-4">Detailed Forecast Table</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Date", "Max Temp", "Heatwave Risk", "Water Scarcity", "Rainfall Deficit", "Overall Risk"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.map((pt, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{pt.date}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-bold ${pt.projectedMaxTemp >= 42 ? "text-red-600" : pt.projectedMaxTemp >= 40 ? "text-orange-500" : "text-gray-700"}`}>
                      {pt.projectedMaxTemp}°C
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`font-bold ${pt.heatwaveRisk >= 68 ? "text-red-600" : pt.heatwaveRisk >= 45 ? "text-orange-500" : "text-green-600"}`}>
                      {pt.heatwaveRisk}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`font-bold ${pt.waterScarcityRisk >= 45 ? "text-blue-700" : "text-blue-400"}`}>
                      {pt.waterScarcityRisk}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {pt.rainfallDeficitPct > 0 ? `+${pt.rainfallDeficitPct}%` : `${pt.rainfallDeficitPct}%`}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pt.overallRisk >= 68 ? "bg-red-100 text-red-700" : pt.overallRisk >= 45 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                      {pt.overallRisk}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}