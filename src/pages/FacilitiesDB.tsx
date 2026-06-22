import { useState } from "react";
import { useData, Facility, Hospital, School } from "@/context/DataContext";
import { AlertModal } from "@/components/AlertModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Database, Download } from "lucide-react";

function RiskBadge({ level, value }: { level: string; value?: number }) {
  const cls =
    level === "High"
      ? "bg-red-100 text-red-700"
      : level === "Medium"
      ? "bg-orange-100 text-orange-700"
      : "bg-green-100 text-green-700";
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${cls}`}>
      {level}{value !== undefined ? ` — ${value}%` : ""}
    </span>
  );
}

function FacilityDetail({ facility }: { facility: Facility }) {
  const isHospital = facility.facilityType === "hospital";
  const h = isHospital ? (facility as Hospital) : null;
  const s = !isHospital ? (facility as School) : null;

  return (
    <div className="space-y-6 text-sm">
      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Basic Info</div>
        <div className="grid grid-cols-2 gap-2">
          <Row label="District" value={facility.district} />
          <Row label="Address" value={facility.address} />
          <Row label="Type" value={facility.facilityType === "hospital" ? `Hospital — ${h?.subType}` : `School — ${s?.subType}`} />
          {isHospital && h && (
            <>
              <Row label="Ownership" value={h.ownership} />
              <Row label="Daily Footfall" value={`${h.avgDailyFootfall} patients`} />
              <Row label="Ambulance" value={h.ambulanceAvailable ? "Yes" : "No"} />
              <Row label="Emergency Unit" value={h.emergencyUnit ? "Yes" : "No"} />
            </>
          )}
          {!isHospital && s && (
            <>
              <Row label="UDISE Code" value={s.udiseCode} />
              <Row label="Total Students" value={`${s.totalStudents} (B: ${s.boysCount}, G: ${s.girlsCount})`} />
              <Row label="Building Condition" value={s.buildingCondition} />
              <Row label="Roof Type" value={s.roofType} />
              <Row label="Working Fans" value={`${s.fansWorkingCount}`} />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Power Infrastructure</div>
        <div className="grid grid-cols-2 gap-2">
          <Row label="Daily Power Cut" value={`${facility.dailyPowerCutHours} hrs`} />
          <Row label="Solar Available" value={facility.solarAvailable ? "Yes" : "No"} />
          {isHospital && h && (
            <>
              <Row label="Power Cut Freq" value={h.summerPowerCutFreq} />
              <Row label="Generator" value={h.generatorAvailable ? "Yes" : "No"} />
              <Row label="Backup Duration" value={`${h.backupDurationHours} hrs`} />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Water &amp; Sanitation</div>
        <div className="grid grid-cols-2 gap-2">
          <Row label="Primary Source" value={facility.primaryWaterSource} />
          <Row label="Alternate Source" value={facility.alternateWaterSource ? "Yes" : "No"} />
          <Row label="Summer Water Avail." value={facility.summerDailyWaterAvailability ? "Yes" : "No"} />
          <Row label="Shortage Days/Month" value={`${facility.waterShortageDaysPerMonth}`} />
          <Row label="Rainwater Harvest." value={facility.rainwaterHarvesting ? "Yes" : "No"} />
          <Row label="Water Quality Issue" value={facility.waterQualityIssue ? "Yes" : "No"} />
          <Row label="Toilets (Total/Func.)" value={`${facility.totalToilets} / ${facility.functionalToilets}`} />
          {isHospital && h && <Row label="Sanitation Condition" value={h.sanitationCondition} />}
          {!isHospital && s && (
            <>
              <Row label="Tank Available" value={s.tankAvailable ? "Yes" : "No"} />
              <Row label="Water In Toilets" value={s.waterInToilets ? "Yes" : "No"} />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">ML Indicators</div>
        <div className="grid grid-cols-2 gap-2">
          {isHospital && h && (
            <>
              <Row label="Heatstroke Cases" value={`${h.heatstrokeCasesCount}`} />
              <Row label="Power Outage Days" value={`${h.powerOutageDisruptionDays}`} />
              <Row label="Water Scarcity Days" value={`${h.waterScarcityDisruptionDays}`} />
            </>
          )}
          {!isHospital && s && (
            <>
              <Row label="Closure Days (Yr)" value={`${s.closureDaysLastYear}`} />
              <Row label="Heatwave Closure (3Y)" value={`${s.heatwaveClosureDays3Years}`} />
              <Row label="Heat Illness Cases" value={`${s.heatIllnessCasesCount}`} />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Future Risk Forecast</div>
        {[
          { label: "Overall Risk", value: facility.riskOverall, color: "bg-red-500" },
          { label: "Heatwave Risk", value: facility.riskHeatwave, color: "bg-orange-500" },
          { label: "Water Scarcity", value: facility.riskWaterScarcity, color: "bg-blue-500" },
          { label: "Infrastructure", value: facility.riskInfrastructure, color: "bg-purple-500" },
        ].map((r) => (
          <div key={r.label} className="mb-2">
            <div className="flex justify-between mb-0.5">
              <span className="text-gray-600">{r.label}</span>
              <span className="font-bold">{r.value}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${r.color} rounded-full`} style={{ width: `${r.value}%` }}></div>
            </div>
          </div>
        ))}
        <div className="mt-2 text-xs text-gray-400">Peak Risk Date: {new Date(facility.peakRiskDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="font-medium text-gray-800">{value}</div>
    </div>
  );
}

export default function FacilitiesDB() {
  const { facilities } = useData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [alertFacility, setAlertFacility] = useState<Facility | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const districts = Array.from(new Set(facilities.map((f) => f.district)));

  const filtered = facilities.filter((f) => {
    const matchesSearch =
      !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.district.toLowerCase().includes(search.toLowerCase()) ||
      f.address.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || f.facilityType === typeFilter;
    const matchesRisk = riskFilter === "all" || f.riskLevel === riskFilter;
    const matchesDistrict = districtFilter === "all" || f.district === districtFilter;
    return matchesSearch && matchesType && matchesRisk && matchesDistrict;
  });

  function openSheet(f: Facility) {
    setSelectedFacility(f);
    setSheetOpen(true);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Facilities Database</h1>
        <p className="text-sm text-gray-500 mt-1">All schools and hospitals with full operational parameters.</p>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            data-testid="search-facilities"
            type="search"
            placeholder="Search by name, district, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        </div>
        <select
          data-testid="filter-type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="all">All Types</option>
          <option value="school">Schools</option>
          <option value="hospital">Hospitals</option>
        </select>
        <select
          data-testid="filter-risk"
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="all">All Risk Levels</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select
          data-testid="filter-district"
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="all">All Districts</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Database className="w-3 h-3" />
          {filtered.length} records
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "cg-state-facilities.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 100);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            <Download className="w-3 h-3" /> Export JSON
          </button>
          <button
            onClick={() => {
              const headers = ["id", "name", "facilityType", "district", "lgd_district_code", "riskOverall", "riskHeatwave", "riskWaterScarcity", "riskInfrastructure", "riskLevel", "peakRiskDate"];
              const esc = (v: string) => `"${(v || "").toString().replace(/"/g, '""')}"`;
              const rows = filtered.map((f) =>
                [f.id, esc(f.name), esc(f.facilityType), esc(f.district), f.lgd_district_code ?? "", f.riskOverall, f.riskHeatwave, f.riskWaterScarcity, f.riskInfrastructure, esc(f.riskLevel), f.peakRiskDate].join(",")
              );
              const csv = [headers.join(","), ...rows].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "cg-state-facilities.csv";
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 100);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors"
          >
            <Download className="w-3 h-3" /> Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Name", "Type", "District", "Risk Level", "Overall %", "Heatwave %", "Water Scarcity %"].map((col) => (
                  <th key={col} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No facilities match your filters.</td>
                </tr>
              ) : (
                filtered.map((f) => (
                  <tr
                    key={f.id}
                    data-testid={`row-facility-${f.id}`}
                    className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => openSheet(f)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {f.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                        f.facilityType === "hospital" ? "bg-indigo-100 text-indigo-700" : "bg-teal-100 text-teal-700"
                      }`}>
                        {f.facilityType === "hospital" ? (f as Hospital).subType : (f as School).subType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{f.district}</td>
                    <td className="px-4 py-3"><RiskBadge level={f.riskLevel} /></td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${f.riskOverall > 75 ? "text-red-600" : f.riskOverall > 50 ? "text-orange-500" : "text-green-600"}`}>
                        {f.riskOverall}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{f.riskHeatwave}%</td>
                    <td className="px-4 py-3 text-gray-700">{f.riskWaterScarcity}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[420px] sm:w-[500px] overflow-y-auto">
          {selectedFacility && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <SheetTitle className="text-base font-bold text-gray-900 leading-snug">{selectedFacility.name}</SheetTitle>
                    <div className="text-xs text-gray-400 mt-1">{selectedFacility.district} • {selectedFacility.facilityType}</div>
                  </div>
                  <RiskBadge level={selectedFacility.riskLevel} />
                </div>
                <button
                  data-testid="open-alert-btn"
                  onClick={() => {
                    setAlertFacility(selectedFacility);
                    setAlertOpen(true);
                  }}
                  className="mt-3 w-full py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  View Alert Protocol
                </button>
              </SheetHeader>
              <FacilityDetail facility={selectedFacility} />
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertModal open={alertOpen} onOpenChange={setAlertOpen} facility={alertFacility} />
    </div>
  );
}
