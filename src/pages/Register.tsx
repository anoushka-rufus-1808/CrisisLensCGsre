import { useState } from "react";
import { useData } from "@/context/DataContext";
import { computeHeatwaveScore, computeWaterScarcityScore, computeOverallRisk } from "@/engine/scoringMetrics";
import {
  Building2, Users, Droplets, Shield, CheckCircle2, ChevronRight,
  ChevronLeft, Thermometer, Zap, Info, MapPin, ClipboardList, AlertTriangle,
} from "lucide-react";
import type { Hospital, School, Facility, BaseFacility } from "@/context/DataContext";

const CG_DISTRICTS = ["Durg", "Bhilai", "Raipur", "Bilaspur", "Rajnandgaon", "Korba", "Raigarh", "Surguja", "Bastar", "Jagdalpur", "Other"];

const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  Durg: { lat: 21.1904, lng: 81.2849 },
  Bhilai: { lat: 21.2090, lng: 81.4285 },
  Raipur: { lat: 21.2514, lng: 81.6296 },
  Bilaspur: { lat: 22.0797, lng: 82.1391 },
  Rajnandgaon: { lat: 21.0968, lng: 80.6980 },
  Korba: { lat: 22.3595, lng: 82.6850 },
  Raigarh: { lat: 21.8977, lng: 83.3950 },
  Surguja: { lat: 23.1168, lng: 83.2016 },
  Bastar: { lat: 19.1228, lng: 81.9469 },
  Jagdalpur: { lat: 19.0830, lng: 82.0160 },
  Other: { lat: 21.2514, lng: 81.6296 },
};

interface FormState {
  facilityType: "school" | "hospital";
  name: string;
  district: string;
  block: string;
  village: string;
  address: string;
  lat: string;
  lng: string;
  subTypeSchool: "Primary" | "Secondary" | "Higher Secondary";
  subTypeHospital: "PHC" | "CHC" | "District Hospital";
  ownership: "Govt" | "Private";
  udiseCode: string;
  totalStudents: string;
  boysCount: string;
  girlsCount: string;
  buildingCondition: "Good" | "Average" | "Poor";
  roofType: "RCC" | "Tin" | "Asbestos";
  fansWorkingCount: string;
  tankAvailable: boolean;
  waterInToilets: boolean;
  avgDailyFootfall: string;
  ambulanceAvailable: boolean;
  emergencyUnit: boolean;
  generatorAvailable: boolean;
  backupDurationHours: string;
  tankCount: string;
  sanitationCondition: "Good" | "Average" | "Poor";
  totalToilets: string;
  functionalToilets: string;
  primaryWaterSource: "tap" | "handpump" | "borewell" | "tanker";
  alternateWaterSource: boolean;
  waterShortageDaysPerMonth: string;
  dailyPowerCutHours: string;
  solarAvailable: boolean;
  rainwaterHarvesting: boolean;
  waterQualityIssue: boolean;
  summerDailyWaterAvailability: boolean;
  heatIllnessCasesCount: string;
  closureDaysLastYear: string;
  heatwaveClosureDays3Years: string;
  attendanceDropSummer: boolean;
  heatstrokeCasesCount: string;
  powerOutageDisruptionDays: string;
  waterScarcityDisruptionDays: string;
  summerPowerCutFreq: "Low" | "Medium" | "High";
}

const INITIAL: FormState = {
  facilityType: "school",
  name: "", district: "Durg", block: "", village: "", address: "",
  lat: "", lng: "",
  subTypeSchool: "Primary", subTypeHospital: "PHC", ownership: "Govt",
  udiseCode: "", totalStudents: "", boysCount: "", girlsCount: "",
  buildingCondition: "Good", roofType: "RCC", fansWorkingCount: "",
  tankAvailable: false, waterInToilets: false,
  avgDailyFootfall: "", ambulanceAvailable: false, emergencyUnit: false,
  generatorAvailable: false, backupDurationHours: "", tankCount: "",
  sanitationCondition: "Good",
  totalToilets: "", functionalToilets: "",
  primaryWaterSource: "tap", alternateWaterSource: false,
  waterShortageDaysPerMonth: "0", dailyPowerCutHours: "0",
  solarAvailable: false, rainwaterHarvesting: false,
  waterQualityIssue: false, summerDailyWaterAvailability: true,
  heatIllnessCasesCount: "0", closureDaysLastYear: "0",
  heatwaveClosureDays3Years: "0", attendanceDropSummer: false,
  heatstrokeCasesCount: "0", powerOutageDisruptionDays: "0",
  waterScarcityDisruptionDays: "0", summerPowerCutFreq: "Medium",
};

const STEPS = [
  { label: "Facility Type", icon: Building2 },
  { label: "Identity & Location", icon: MapPin },
  { label: "Facility Details", icon: Users },
  { label: "Infrastructure", icon: Zap },
  { label: "Risk History", icon: Thermometer },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder = "", min, max }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string; min?: string; max?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
    />
  );
}

function Select<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { label: string; value: T }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function RiskGauge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="12" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="12"
            strokeDasharray={`${(value / 100) * 251.2} 251.2`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black" style={{ color }}>{value}%</span>
        </div>
      </div>
      <div className="text-xs font-semibold text-gray-600 mt-1 text-center">{label}</div>
    </div>
  );
}

export default function Register() {
  const { registerFacility, liveTemp } = useData();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [registeredFacility, setRegisteredFacility] = useState<Facility | null>(null);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleDistrictChange(d: string) {
    set("district", d);
    const coords = DISTRICT_COORDS[d] ?? DISTRICT_COORDS["Other"];
    if (!form.lat && !form.lng) {
      set("lat", String(coords.lat));
      set("lng", String(coords.lng));
    }
  }

  function canAdvance(): boolean {
    if (step === 1) return form.name.trim().length > 0 && form.address.trim().length > 0;
    return true;
  }

  function handleSubmit() {
    const isSchool = form.facilityType === "school";
    const coords = {
      lat: parseFloat(form.lat) || DISTRICT_COORDS[form.district]?.lat || 21.1904,
      lng: parseFloat(form.lng) || DISTRICT_COORDS[form.district]?.lng || 81.2849,
    };

    const id = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const waterShortageDays = parseInt(form.waterShortageDaysPerMonth) || 0;
    const shortageMonth = waterShortageDays > 8 ? "may" : "N/A";

    const heatCasesCount = isSchool
      ? parseInt(form.heatIllnessCasesCount) || 0
      : parseInt(form.heatstrokeCasesCount) || 0;
    const backupPowerHrs = parseFloat(form.backupDurationHours) || 0;
    const workingFans = parseInt(form.fansWorkingCount) || 0;
    const closureDaysLastYear = parseInt(form.closureDaysLastYear) || 0;

    let riskHeatwave = computeHeatwaveScore({
      facilityType: form.facilityType,
      heatCasesCount,
      closureDaysLastYear,
      backupPowerHrs,
      workingFans,
    });
    if (liveTemp !== null) {
      if (liveTemp > 42) riskHeatwave = Math.min(95, riskHeatwave + 10);
      else if (liveTemp > 40) riskHeatwave = Math.min(95, riskHeatwave + 6);
      else if (liveTemp > 38) riskHeatwave = Math.min(95, riskHeatwave + 3);
    }

    const riskWaterScarcity = computeWaterScarcityScore({
      rawWaterSource: form.primaryWaterSource,
      shortageMonth,
      alternateWaterSource: form.alternateWaterSource,
    });

    const infraBase = isSchool
      ? (form.roofType === "RCC" ? 20 : form.roofType === "Tin" ? 55 : 50) * 0.5 +
        (workingFans > 20 ? 20 : workingFans > 10 ? 40 : 65) * 0.5
      : (backupPowerHrs >= 8 ? 20 : backupPowerHrs >= 4 ? 40 : 65) * 0.5 +
        (form.alternateWaterSource ? 25 : 55) * 0.5;
    const riskInfrastructure = Math.round(infraBase);

    const { riskOverall, riskLevel } = computeOverallRisk(riskHeatwave, riskWaterScarcity, riskInfrastructure);

    const base: BaseFacility = {
      id, name: form.name.trim(), district: form.district,
      lgd_district_code: undefined, lgd_block_code: undefined, lgd_village_code: undefined,
      address: form.address.trim(), coordinates: coords,
      dailyPowerCutHours: parseFloat(form.dailyPowerCutHours) || 0,
      solarAvailable: form.solarAvailable,
      primaryWaterSource: form.primaryWaterSource,
      alternateWaterSource: form.alternateWaterSource,
      summerDailyWaterAvailability: form.summerDailyWaterAvailability,
      waterShortageDaysPerMonth: waterShortageDays,
      rainwaterHarvesting: form.rainwaterHarvesting,
      waterQualityIssue: form.waterQualityIssue,
      totalToilets: parseInt(form.totalToilets) || 0,
      functionalToilets: parseInt(form.functionalToilets) || 0,
      riskOverall, riskHeatwave, riskWaterScarcity, riskInfrastructure,
      peakRiskDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      riskLevel,
    };

    let facility: Facility;
    if (isSchool) {
      facility = {
        ...base,
        facilityType: "school",
        subType: form.subTypeSchool,
        udiseCode: form.udiseCode,
        totalStudents: parseInt(form.totalStudents) || 0,
        boysCount: parseInt(form.boysCount) || 0,
        girlsCount: parseInt(form.girlsCount) || 0,
        buildingCondition: form.buildingCondition,
        roofType: form.roofType,
        fansWorkingCount: workingFans,
        attendanceDropSummer: form.attendanceDropSummer,
        tankAvailable: form.tankAvailable,
        waterInToilets: form.waterInToilets,
        closureDaysLastYear,
        heatwaveClosureDays3Years: parseInt(form.heatwaveClosureDays3Years) || 0,
        heatIllnessCasesCount: heatCasesCount,
      } as School;
    } else {
      facility = {
        ...base,
        facilityType: "hospital",
        subType: form.subTypeHospital,
        ownership: form.ownership,
        avgDailyFootfall: parseInt(form.avgDailyFootfall) || 0,
        ambulanceAvailable: form.ambulanceAvailable,
        emergencyUnit: form.emergencyUnit,
        summerPowerCutFreq: form.summerPowerCutFreq,
        generatorAvailable: form.generatorAvailable,
        backupDurationHours: backupPowerHrs,
        heatstrokeCasesCount: heatCasesCount,
        powerOutageDisruptionDays: parseInt(form.powerOutageDisruptionDays) || 0,
        waterScarcityDisruptionDays: parseInt(form.waterScarcityDisruptionDays) || 0,
        tankCount: parseInt(form.tankCount) || 0,
        sanitationCondition: form.sanitationCondition,
      } as Hospital;
    }

    registerFacility(facility);
    setRegisteredFacility(facility);
    setSubmitted(true);
  }

  function handleReset() {
    setForm(INITIAL);
    setStep(0);
    setSubmitted(false);
    setRegisteredFacility(null);
  }

  if (submitted && registeredFacility) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-green-50 border border-green-300 rounded-xl p-6 mb-6 flex items-start gap-4">
          <CheckCircle2 className="w-8 h-8 text-green-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-lg font-bold text-green-800">Registration Successful!</div>
            <div className="text-sm text-green-700 mt-1">
              <span className="font-semibold">{registeredFacility.name}</span> has been registered
              and is now visible in the Facilities DB and Dashboard.
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-600" /> Computed Risk Scores
          </div>
          <div className="flex justify-around mb-4">
            <RiskGauge value={registeredFacility.riskHeatwave} label="Heatwave" color="#ef4444" />
            <RiskGauge value={registeredFacility.riskWaterScarcity} label="Water Scarcity" color="#3b82f6" />
            <RiskGauge value={registeredFacility.riskInfrastructure} label="Infrastructure" color="#8b5cf6" />
            <RiskGauge value={registeredFacility.riskOverall} label="Overall" color={
              registeredFacility.riskLevel === "High" ? "#dc2626" :
              registeredFacility.riskLevel === "Medium" ? "#f97316" : "#16a34a"
            } />
          </div>
          <div className={`text-center py-2 rounded-lg text-sm font-bold ${
            registeredFacility.riskLevel === "High" ? "bg-red-100 text-red-700" :
            registeredFacility.riskLevel === "Medium" ? "bg-orange-100 text-orange-700" :
            "bg-green-100 text-green-700"
          }`}>
            {registeredFacility.riskLevel} Risk Facility
          </div>
          {liveTemp !== null && (
            <div className="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <Thermometer className="w-3 h-3" />
              Live weather ({liveTemp.toFixed(1)}°C Durg) was automatically applied to heatwave score
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Registration Summary</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Facility ID", registeredFacility.id],
              ["Type", `${registeredFacility.facilityType === "school" ? "School" : "Hospital"} · ${(registeredFacility as School | Hospital).subType ?? ""}`],
              ["District", registeredFacility.district],
              ["Address", registeredFacility.address],
              ["Water Source", registeredFacility.primaryWaterSource],
              ["Alternate Water", registeredFacility.alternateWaterSource ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-gray-500 shrink-0">{k}:</span>
                <span className="font-medium text-gray-800 truncate">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl hover:bg-indigo-800 transition-colors"
          >
            Register Another Facility
          </button>
          <a href="/facilities-db" className="px-6 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
            View in Facilities DB
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Facility Registration</h1>
        <p className="text-sm text-gray-500 mt-1">
          Register your school or hospital. Risk scores are computed instantly from your inputs
          using the same engine as the main dashboard.
        </p>
      </div>

      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                  done ? "bg-indigo-600 border-indigo-600" :
                  active ? "bg-white border-indigo-600" :
                  "bg-white border-gray-300"
                }`}>
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  ) : (
                    <Icon className={`w-4 h-4 ${active ? "text-indigo-600" : "text-gray-400"}`} />
                  )}
                </div>
                <span className={`text-[10px] font-semibold mt-1 text-center leading-tight ${
                  active ? "text-indigo-700" : done ? "text-indigo-500" : "text-gray-400"
                }`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mb-4 mx-1 transition-all ${i < step ? "bg-indigo-600" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {step === 0 && (
          <div>
            <div className="text-base font-bold text-gray-800 mb-4">What type of facility are you registering?</div>
            <div className="grid grid-cols-2 gap-4">
              {([["school", "School", "Primary, Secondary, Higher Secondary Government / Aided Schools"],
                 ["hospital", "Hospital", "PHC, CHC, District Hospitals, Government / Private"]] as const).map(([val, label, desc]) => (
                <label key={val} className={`flex flex-col gap-2 p-5 rounded-xl border-2 cursor-pointer transition-colors ${
                  form.facilityType === val ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-300"
                }`}>
                  <input type="radio" className="sr-only" checked={form.facilityType === val} onChange={() => set("facilityType", val)} />
                  <span className="font-bold text-gray-800 text-lg">{label}</span>
                  <span className="text-xs text-gray-500">{desc}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" /> Identity & Location
            </div>
            <div className="space-y-4">
              <Field label="Facility Name *">
                <Input value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. Govt Primary School Borsi" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="District *">
                  <Select value={form.district} onChange={handleDistrictChange}
                    options={CG_DISTRICTS.map((d) => ({ label: d, value: d }))} />
                </Field>
                <Field label="Block / Tehsil">
                  <Input value={form.block} onChange={(v) => set("block", v)} placeholder="Block name" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Village / Ward">
                  <Input value={form.village} onChange={(v) => set("village", v)} placeholder="Village or ward name" />
                </Field>
                {form.facilityType === "school" && (
                  <Field label="UDISE Code" hint="11-digit school code">
                    <Input value={form.udiseCode} onChange={(v) => set("udiseCode", v)} placeholder="e.g. 22370400101" />
                  </Field>
                )}
              </div>
              <Field label="Full Address *">
                <Input value={form.address} onChange={(v) => set("address", v)} placeholder="Street, locality, PIN code" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Latitude (GPS)" hint="Auto-filled from district">
                  <Input value={form.lat} onChange={(v) => set("lat", v)} placeholder="21.1904" />
                </Field>
                <Field label="Longitude (GPS)" hint="Auto-filled from district">
                  <Input value={form.lng} onChange={(v) => set("lng", v)} placeholder="81.2849" />
                </Field>
              </div>
            </div>
          </div>
        )}

        {step === 2 && form.facilityType === "school" && (
          <div>
            <div className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" /> School Details
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="School Sub-type">
                  <Select value={form.subTypeSchool} onChange={(v) => set("subTypeSchool", v)}
                    options={[{ label: "Primary (1–5)", value: "Primary" }, { label: "Secondary (6–10)", value: "Secondary" }, { label: "Higher Secondary (11–12)", value: "Higher Secondary" }]} />
                </Field>
                <Field label="Building Condition">
                  <Select value={form.buildingCondition} onChange={(v) => set("buildingCondition", v)}
                    options={[{ label: "Good", value: "Good" }, { label: "Average", value: "Average" }, { label: "Poor", value: "Poor" }]} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Total Students">
                  <Input type="number" value={form.totalStudents} onChange={(v) => set("totalStudents", v)} min="0" />
                </Field>
                <Field label="Boys Count">
                  <Input type="number" value={form.boysCount} onChange={(v) => set("boysCount", v)} min="0" />
                </Field>
                <Field label="Girls Count">
                  <Input type="number" value={form.girlsCount} onChange={(v) => set("girlsCount", v)} min="0" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Roof Type" hint="Affects heatwave vulnerability">
                  <Select value={form.roofType} onChange={(v) => set("roofType", v)}
                    options={[{ label: "RCC (Concrete)", value: "RCC" }, { label: "Tin Sheet", value: "Tin" }, { label: "Asbestos Sheet", value: "Asbestos" }]} />
                </Field>
                <Field label="Working Fans Count" hint="<15 triggers vulnerability loading">
                  <Input type="number" value={form.fansWorkingCount} onChange={(v) => set("fansWorkingCount", v)} min="0" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Total Toilets">
                  <Input type="number" value={form.totalToilets} onChange={(v) => set("totalToilets", v)} min="0" />
                </Field>
                <Field label="Functional Toilets">
                  <Input type="number" value={form.functionalToilets} onChange={(v) => set("functionalToilets", v)} min="0" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-6 pt-2">
                <Toggle checked={form.tankAvailable} onChange={(v) => set("tankAvailable", v)} label="Water tank available" />
                <Toggle checked={form.waterInToilets} onChange={(v) => set("waterInToilets", v)} label="Water available in toilets" />
                <Toggle checked={form.attendanceDropSummer} onChange={(v) => set("attendanceDropSummer", v)} label="Attendance drops in summer" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && form.facilityType === "hospital" && (
          <div>
            <div className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" /> Hospital Details
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Hospital Sub-type">
                  <Select value={form.subTypeHospital} onChange={(v) => set("subTypeHospital", v)}
                    options={[{ label: "PHC", value: "PHC" }, { label: "CHC", value: "CHC" }, { label: "District Hospital", value: "District Hospital" }]} />
                </Field>
                <Field label="Ownership">
                  <Select value={form.ownership} onChange={(v) => set("ownership", v)}
                    options={[{ label: "Government", value: "Govt" }, { label: "Private", value: "Private" }]} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Avg Daily Footfall">
                  <Input type="number" value={form.avgDailyFootfall} onChange={(v) => set("avgDailyFootfall", v)} min="0" />
                </Field>
                <Field label="Backup Generator Hours" hint="<6 hrs triggers vulnerability loading">
                  <Input type="number" value={form.backupDurationHours} onChange={(v) => set("backupDurationHours", v)} min="0" max="24" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Water Tank Count">
                  <Input type="number" value={form.tankCount} onChange={(v) => set("tankCount", v)} min="0" />
                </Field>
                <Field label="Sanitation Condition">
                  <Select value={form.sanitationCondition} onChange={(v) => set("sanitationCondition", v)}
                    options={[{ label: "Good", value: "Good" }, { label: "Average", value: "Average" }, { label: "Poor", value: "Poor" }]} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Summer Power Cut Frequency">
                  <Select value={form.summerPowerCutFreq} onChange={(v) => set("summerPowerCutFreq", v)}
                    options={[{ label: "Low (<2 hrs/day)", value: "Low" }, { label: "Medium (2–6 hrs/day)", value: "Medium" }, { label: "High (>6 hrs/day)", value: "High" }]} />
                </Field>
                <Field label="Total Toilets">
                  <Input type="number" value={form.totalToilets} onChange={(v) => set("totalToilets", v)} min="0" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-6 pt-2">
                <Toggle checked={form.ambulanceAvailable} onChange={(v) => set("ambulanceAvailable", v)} label="Ambulance available" />
                <Toggle checked={form.emergencyUnit} onChange={(v) => set("emergencyUnit", v)} label="Emergency unit" />
                <Toggle checked={form.generatorAvailable} onChange={(v) => set("generatorAvailable", v)} label="Generator available" />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-600" /> Infrastructure & Water
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Primary Water Source">
                  <Select value={form.primaryWaterSource} onChange={(v) => set("primaryWaterSource", v)}
                    options={[
                      { label: "Tap Water (Municipal)", value: "tap" },
                      { label: "Borewell", value: "borewell" },
                      { label: "Handpump", value: "handpump" },
                      { label: "Tanker Supply", value: "tanker" },
                    ]} />
                </Field>
                <Field label="Water Shortage Days / Month" hint="Average across summer">
                  <Input type="number" value={form.waterShortageDaysPerMonth} onChange={(v) => set("waterShortageDaysPerMonth", v)} min="0" max="31" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Daily Power Cut Hours" hint="Average in summer">
                  <Input type="number" value={form.dailyPowerCutHours} onChange={(v) => set("dailyPowerCutHours", v)} min="0" max="24" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
                <Toggle checked={form.alternateWaterSource} onChange={(v) => set("alternateWaterSource", v)} label="Has alternate water source" />
                <Toggle checked={form.summerDailyWaterAvailability} onChange={(v) => set("summerDailyWaterAvailability", v)} label="Daily water available in summer" />
                <Toggle checked={form.solarAvailable} onChange={(v) => set("solarAvailable", v)} label="Solar power available" />
                <Toggle checked={form.rainwaterHarvesting} onChange={(v) => set("rainwaterHarvesting", v)} label="Rainwater harvesting" />
                <Toggle checked={form.waterQualityIssue} onChange={(v) => set("waterQualityIssue", v)} label="Water quality issues reported" />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-red-500" /> Risk History
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                This data is used to compute your facility's heatwave risk score. Enter 0 if no incidents occurred.
              </p>
            </div>
            <div className="space-y-4">
              {form.facilityType === "school" ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Heat Illness Cases (last season)">
                      <Input type="number" value={form.heatIllnessCasesCount} onChange={(v) => set("heatIllnessCasesCount", v)} min="0" />
                    </Field>
                    <Field label="School Closure Days (last year)">
                      <Input type="number" value={form.closureDaysLastYear} onChange={(v) => set("closureDaysLastYear", v)} min="0" />
                    </Field>
                  </div>
                  <Field label="Heatwave Closure Days (last 3 years total)">
                    <Input type="number" value={form.heatwaveClosureDays3Years} onChange={(v) => set("heatwaveClosureDays3Years", v)} min="0" />
                  </Field>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Heatstroke Cases (last season)">
                      <Input type="number" value={form.heatstrokeCasesCount} onChange={(v) => set("heatstrokeCasesCount", v)} min="0" />
                    </Field>
                    <Field label="Power Outage Disruption Days">
                      <Input type="number" value={form.powerOutageDisruptionDays} onChange={(v) => set("powerOutageDisruptionDays", v)} min="0" />
                    </Field>
                    <Field label="Water Scarcity Disruption Days">
                      <Input type="number" value={form.waterScarcityDisruptionDays} onChange={(v) => set("waterScarcityDisruptionDays", v)} min="0" />
                    </Field>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <span className="text-xs text-gray-400">Step {step + 1} of {STEPS.length}</span>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canAdvance() && setStep((s) => s + 1)}
            disabled={!canAdvance()}
            className="flex items-center gap-2 bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 bg-green-700 text-white font-bold px-6 py-2.5 rounded-lg hover:bg-green-800 transition-colors"
          >
            <ClipboardList className="w-4 h-4" /> Submit Registration
          </button>
        )}
      </div>
    </div>
  );
}
