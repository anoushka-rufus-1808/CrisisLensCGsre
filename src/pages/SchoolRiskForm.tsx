import { useState } from "react";
import { useData } from "@/context/DataContext";
import { predictSchoolRisk, SchoolRiskInput, SchoolRiskResult } from "@/engine/predictionModel";
import {
  Thermometer,
  Droplets,
  Shield,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Building2,
  Users,
  Wind,
  Zap,
  Info,
} from "lucide-react";

const initialInput: SchoolRiskInput = {
  facilityType: "school",
  totalStudents: 300,
  workingFans: 10,
  roofType: "RCC",
  primaryWaterSource: "tap",
  alternateWaterSource: false,
  waterShortageDaysPerMonth: 5,
  heatIllnessCasesCount: 3,
  closureDaysLastYear: 4,
  backupPowerHrs: 4,
  nearWaterBody: false,
  currentLiveTemp: null,
};

function RiskGauge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${(value / 100) * 251.2} 251.2`}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black" style={{ color }}>{value}%</span>
        </div>
      </div>
      <div className="text-xs font-semibold text-gray-600 mt-2 text-center">{label}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: "Low" | "Medium" | "High" }) {
  const styles = {
    Low: "bg-green-100 text-green-800 border-green-300",
    Medium: "bg-orange-100 text-orange-800 border-orange-300",
    High: "bg-red-100 text-red-800 border-red-300",
  };
  const icons = {
    Low: <CheckCircle2 className="w-4 h-4" />,
    Medium: <AlertTriangle className="w-4 h-4" />,
    High: <AlertTriangle className="w-4 h-4" />,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border ${styles[level]}`}>
      {icons[level]} {level} Risk
    </span>
  );
}

export default function SchoolRiskForm() {
  const { liveTemp, weatherLoading } = useData();
  const [form, setForm] = useState<SchoolRiskInput>({ ...initialInput, currentLiveTemp: liveTemp });
  const [result, setResult] = useState<SchoolRiskResult | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleChange<K extends keyof SchoolRiskInput>(key: K, value: SchoolRiskInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSubmitted(false);
    setResult(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const inputWithLive: SchoolRiskInput = { ...form, currentLiveTemp: liveTemp };
    const r = predictSchoolRisk(inputWithLive);
    setResult(r);
    setSubmitted(true);
  }

  function handleReset() {
    setForm({ ...initialInput, currentLiveTemp: liveTemp });
    setResult(null);
    setSubmitted(false);
  }

  const isSchool = form.facilityType === "school";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Facility Risk Prediction Form</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-300 text-indigo-800 text-xs font-semibold px-3 py-1.5 rounded-md">
            <ClipboardList className="w-3 h-3" />
            Enter facility details to predict heatwave and water scarcity risk
          </div>
          {!weatherLoading && liveTemp !== null && (
            <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-300 text-orange-800 text-xs font-semibold px-3 py-1.5 rounded-md">
              <Thermometer className="w-3 h-3" />
              Live weather: {liveTemp.toFixed(1)}°C Durg/Bhilai — applied automatically
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Fill in your school or hospital's details. The model uses live weather data from Open-Meteo
          and the same scoring engine that powers the facility dashboard.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-gray-800">Facility Type</span>
              </div>
              <div className="flex gap-4">
                {(["school", "hospital"] as const).map((t) => (
                  <label
                    key={t}
                    className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      form.facilityType === t
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 hover:border-indigo-300"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      checked={form.facilityType === t}
                      onChange={() => handleChange("facilityType", t)}
                    />
                    <span className="font-semibold capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <Users className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-gray-800">Basic Information</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {isSchool ? "Total Students" : "Avg Daily Footfall"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.totalStudents}
                    onChange={(e) => handleChange("totalStudents", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                {isSchool ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Working Fans Count</label>
                    <input
                      type="number"
                      min={0}
                      value={form.workingFans}
                      onChange={(e) => handleChange("workingFans", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">{"<"}15 fans triggers vulnerability loading</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Backup Power Hours</label>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={form.backupPowerHrs}
                      onChange={(e) => handleChange("backupPowerHrs", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">{"<"}6 hrs triggers vulnerability loading</p>
                  </div>
                )}
              </div>
              {isSchool && (
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Roof Type</label>
                  <select
                    value={form.roofType}
                    onChange={(e) => handleChange("roofType", e.target.value as SchoolRiskInput["roofType"])}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="RCC">RCC (Concrete)</option>
                    <option value="Tin">Tin Sheet</option>
                    <option value="Asbestos">Asbestos Sheet</option>
                  </select>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <Thermometer className="w-4 h-4 text-red-500" />
                <span className="font-semibold text-gray-800">Heat Exposure History</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {isSchool ? "Heat Illness Cases (last season)" : "Heatstroke Cases (last season)"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.heatIllnessCasesCount}
                    onChange={(e) => handleChange("heatIllnessCasesCount", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                {isSchool && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Closure Days Last Year</label>
                    <input
                      type="number"
                      min={0}
                      value={form.closureDaysLastYear}
                      onChange={(e) => handleChange("closureDaysLastYear", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <Droplets className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-gray-800">Water Access</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Primary Water Source</label>
                  <select
                    value={form.primaryWaterSource}
                    onChange={(e) => handleChange("primaryWaterSource", e.target.value as SchoolRiskInput["primaryWaterSource"])}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="tap">Tap Water (Municipal)</option>
                    <option value="borewell">Borewell</option>
                    <option value="handpump">Handpump</option>
                    <option value="tanker">Tanker Supply</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Water Shortage Days/Month</label>
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={form.waterShortageDaysPerMonth}
                    onChange={(e) => handleChange("waterShortageDaysPerMonth", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.alternateWaterSource}
                    onChange={(e) => handleChange("alternateWaterSource", e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Has alternate water source</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.nearWaterBody}
                    onChange={(e) => handleChange("nearWaterBody", e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Near river / water body</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl hover:bg-indigo-800 transition-colors flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                Predict Risk
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        <div className="col-span-1">
          {!submitted ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
              <ClipboardList className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-400">Fill in the form and click</p>
              <p className="text-sm font-bold text-indigo-400 mt-1">Predict Risk</p>
              <p className="text-xs text-gray-400 mt-4">
                The model uses live weather from Open-Meteo and the same scoring engine as the dashboard.
              </p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-gray-700">Risk Assessment</span>
                  <RiskBadge level={result.riskLevel} />
                </div>
                <div className="flex justify-around">
                  <RiskGauge value={result.heatwaveRisk} label="Heatwave" color="#ef4444" />
                  <RiskGauge value={result.waterScarcityRisk} label="Water Scarcity" color="#3b82f6" />
                  <RiskGauge value={result.overallRisk} label="Overall Risk" color="#8b5cf6" />
                </div>
                {result.weatherAdjustment > 0 && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                    <Thermometer className="w-3 h-3" />
                    Live weather added +{result.weatherAdjustment} pts to heatwave score ({liveTemp?.toFixed(1)}°C Durg)
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Score Breakdown
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    { label: "Heatwave Risk", value: result.heatwaveRisk, color: "text-red-600" },
                    { label: "Water Scarcity Risk", value: result.waterScarcityRisk, color: "text-blue-600" },
                    { label: "Infrastructure Risk", value: result.infrastructureRisk, color: "text-purple-600" },
                    { label: "Overall (50/30/20 weighted)", value: result.overallRisk, color: "text-gray-900 font-bold border-t border-gray-100 pt-2 mt-2" },
                  ].map((row) => (
                    <div key={row.label} className={`flex justify-between items-center ${row.color}`}>
                      <span className="text-gray-600 font-normal">{row.label}</span>
                      <span className="font-semibold">{row.value}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {result.recommendations.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                  <div className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Recommendations
                  </div>
                  <ul className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-900">
                        <span className="text-amber-500 font-bold mt-0.5 shrink-0">{i + 1}.</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
