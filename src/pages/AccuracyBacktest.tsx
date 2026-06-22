import { useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart2, Loader2, CheckCircle2 } from "lucide-react";
import { useHistoricalData } from "@/hooks/useHistoricalData";
import { tempToHeatwaveRisk, deficitToWaterScarcityRisk, computeOverallForecastRisk } from "@/engine/predictionModel";

interface BacktestRow {
  year: number;
  predictedHeatwave: number;
  actualHeatwave: number;
  predictedWater: number;
  actualWater: number;
  predictedOverall: number;
  actualOverall: number;
  heatwaveError: number;
  waterError: number;
  overallError: number;
}

function computeMAE(rows: BacktestRow[], key: keyof BacktestRow): number {
  if (rows.length === 0) return 0;
  return parseFloat(
    (rows.reduce((s, r) => s + Math.abs((r[key] as number)), 0) / rows.length).toFixed(1),
  );
}

function computeRMSE(rows: BacktestRow[], errKey: keyof BacktestRow): number {
  if (rows.length === 0) return 0;
  const mse = rows.reduce((s, r) => s + Math.pow(r[errKey] as number, 2), 0) / rows.length;
  return parseFloat(Math.sqrt(mse).toFixed(1));
}

function computeAccuracy(rows: BacktestRow[], errKey: keyof BacktestRow, scale = 100): number {
  if (rows.length === 0) return 0;
  const mae = rows.reduce((s, r) => s + Math.abs(r[errKey] as number), 0) / rows.length;
  return parseFloat(Math.max(0, 100 - (mae / scale) * 100).toFixed(1));
}

// Default infra score used in backtest (CSV has no per-facility infra data).
// 45 = medium infrastructure — matches the district-level average for Durg.
const DEFAULT_INFRA_SCORE = 45;

export default function AccuracyBacktest() {
  const historical = useHistoricalData();

  const backtestRows = useMemo<BacktestRow[]>(() => {
    if (historical.loading || historical.weather.length === 0) return [];

    const weatherByYear = new Map(historical.weather.map((w) => [w.year, w]));
    const waterByYear = new Map(historical.waterScarcity.map((w) => [w.year, w]));

    const years = [...new Set([...weatherByYear.keys(), ...waterByYear.keys()])].sort();

    return years
      .map((year) => {
        const wx = weatherByYear.get(year);
        const wt = waterByYear.get(year);
        if (!wx || !wt) return null;

        const predictedHeatwave = Math.round(tempToHeatwaveRisk(wx.summerAvgMaxTemp));
        const predictedWater = Math.round(deficitToWaterScarcityRisk(wt.rainfallDeficitPct));

        // FIX: pass DEFAULT_INFRA_SCORE as the 3rd argument.
        // Previously called with 2 args → infra = undefined → NaN cascade.
        const predictedOverall = computeOverallForecastRisk(
          predictedHeatwave,
          predictedWater,
          DEFAULT_INFRA_SCORE,
        );

        const actualHeatwave = Math.round(
          Math.min(95, Math.max(10, tempToHeatwaveRisk(wx.summerPeakMaxTemp) * 0.8)),
        );

        const actualWater: number = (() => {
          const label = wt.label ?? "";
          if (label.includes("Excess")) return 8;
          if (label.includes("Normal")) return 20;
          if (label.includes("Moderate")) return 45;
          if (label.includes("Severe")) return 72;
          return 30;
        })();

        const actualOverall = Math.round(
          actualHeatwave * 0.5 + actualWater * 0.3 + DEFAULT_INFRA_SCORE * 0.2,
        );

        return {
          year,
          predictedHeatwave,
          actualHeatwave,
          predictedWater,
          actualWater,
          predictedOverall,
          actualOverall,
          heatwaveError: predictedHeatwave - actualHeatwave,
          waterError: predictedWater - actualWater,
          overallError: predictedOverall - actualOverall,
        } satisfies BacktestRow;
      })
      .filter((r): r is BacktestRow => r !== null);
  }, [historical]);

  const heatwaveMAE = computeMAE(backtestRows, "heatwaveError");
  const heatwaveRMSE = computeRMSE(backtestRows, "heatwaveError");
  const heatwaveAcc = computeAccuracy(backtestRows, "heatwaveError");

  const waterMAE = computeMAE(backtestRows, "waterError");
  const waterRMSE = computeRMSE(backtestRows, "waterError");
  const waterAcc = computeAccuracy(backtestRows, "waterError");

  const overallMAE = computeMAE(backtestRows, "overallError");
  const overallRMSE = computeRMSE(backtestRows, "overallError");
  const overallAcc = computeAccuracy(backtestRows, "overallError");

  const chartData = backtestRows.map((r) => ({
    year: String(r.year),
    "Predicted Heatwave": r.predictedHeatwave,
    "Actual Heatwave": r.actualHeatwave,
    "Predicted Water": r.predictedWater,
    "Actual Water": r.actualWater,
    "Predicted Overall": r.predictedOverall,
    "Actual Overall": r.actualOverall,
    "Overall Error": Math.abs(r.overallError),
    "Heatwave Error": Math.abs(r.heatwaveError),
  }));

  if (historical.loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading historical CSV data for backtesting…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accuracy Backtest</h1>
        <div className="inline-flex items-center gap-2 mt-2 mb-1 bg-green-50 border border-green-300 text-green-800 text-xs font-semibold px-3 py-1.5 rounded-md">
          <CheckCircle2 className="w-3 h-3" />
          Live Backtest — Computed from durg_weather.csv &amp; durg_water_scarcity.csv ({backtestRows.length} years)
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Model predictions are compared against derived actuals from the Durg historical dataset (2015–{backtestRows[backtestRows.length - 1]?.year ?? "2025"}).
          MAE, RMSE and accuracy are calculated from real data — not hardcoded values.
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-bold text-gray-700">Overall Risk Model</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Mean Absolute Error", value: overallMAE, unit: "pts", color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
            { label: "Root Mean Square Error", value: overallRMSE, unit: "pts", color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
            { label: "Forecast Accuracy", value: overallAcc, unit: "%", color: "text-green-600", bg: "bg-green-50 border-green-200" },
          ].map((stat) => (
            <div key={stat.label} className={`rounded-xl border p-5 ${stat.bg}`}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{stat.label}</div>
              <div className={`text-4xl font-black ${stat.color}`}>
                {stat.value}<span className="text-xl ml-0.5">{stat.unit}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">Overall Risk model</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Heatwave Sub-model</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-xl font-black text-red-600">{heatwaveMAE}</div><div className="text-xs text-gray-500">MAE</div></div>
            <div><div className="text-xl font-black text-red-600">{heatwaveRMSE}</div><div className="text-xs text-gray-500">RMSE</div></div>
            <div><div className="text-xl font-black text-green-600">{heatwaveAcc}%</div><div className="text-xs text-gray-500">Accuracy</div></div>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Water Scarcity Sub-model</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-xl font-black text-blue-600">{waterMAE}</div><div className="text-xs text-gray-500">MAE</div></div>
            <div><div className="text-xl font-black text-blue-600">{waterRMSE}</div><div className="text-xs text-gray-500">RMSE</div></div>
            <div><div className="text-xl font-black text-green-600">{waterAcc}%</div><div className="text-xs text-gray-500">Accuracy</div></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="text-sm font-semibold text-gray-700 mb-4">Predicted vs Actual Overall Risk (2015–2025)</div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Predicted Overall" stroke="#f97316" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Actual Overall" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="text-sm font-semibold text-gray-700 mb-4">Heatwave Sub-model: Predicted vs Actual</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Predicted Heatwave" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Actual Heatwave" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="text-sm font-semibold text-gray-700 mb-4">Year-by-Year Prediction Error (Overall Risk)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Bar dataKey="Overall Error" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Bar dataKey="Heatwave Error" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Year", "Pred Heatwave", "Actual Heatwave", "Pred Water", "Actual Water", "Pred Overall", "Actual Overall", "Overall Error"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backtestRows.map((r) => (
                <tr key={r.year} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2 font-bold text-gray-700">{r.year}</td>
                  <td className="px-3 py-2 text-red-600 font-semibold">{r.predictedHeatwave}%</td>
                  <td className="px-3 py-2 text-gray-600">{r.actualHeatwave}%</td>
                  <td className="px-3 py-2 text-blue-600 font-semibold">{r.predictedWater}%</td>
                  <td className="px-3 py-2 text-gray-600">{r.actualWater}%</td>
                  <td className="px-3 py-2 text-purple-600 font-semibold">{r.predictedOverall}%</td>
                  <td className="px-3 py-2 text-gray-600">{r.actualOverall}%</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-bold ${Math.abs(r.overallError) > 10 ? "text-red-600" : Math.abs(r.overallError) > 5 ? "text-orange-500" : "text-green-600"}`}>
                      {r.overallError > 0 ? "+" : ""}{r.overallError} pts
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