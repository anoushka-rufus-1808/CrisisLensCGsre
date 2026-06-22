
import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from "react-leaflet";
import { useData, Facility } from "@/context/DataContext";
import { AlertModal } from "@/components/AlertModal";
import { MapPin } from "lucide-react";

function riskColor(level: string) {
  if (level === "High")   return "#ef4444";
  if (level === "Medium") return "#f97316";
  return "#22c55e";
}

export default function LiveMap() {
  const { facilities } = useData();
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [modalOpen, setModalOpen]               = useState(false);
  const [filter, setFilter]                     = useState<"all" | "schools" | "hospitals" | "high">("all");

  const filtered = facilities.filter((f) => {
    if (filter === "schools")   return f.facilityType === "school";
    if (filter === "hospitals") return f.facilityType === "hospital";
    if (filter === "high")      return f.riskLevel === "High";
    return true;
  });

  function openAlert(f: Facility) {
    setSelectedFacility(f);
    setModalOpen(true);
  }

  const filterButtons = [
    { key: "all",       label: "All"           },
    { key: "schools",   label: "Schools"       },
    { key: "hospitals", label: "Hospitals"     },
    { key: "high",      label: "High Risk Only"},
  ] as const;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Live Map</h1>
        <p className="text-sm text-gray-500 mt-1">
          Facility risk distribution across Chhattisgarh.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-5">
        {filterButtons.map((btn) => (
          <button
            key={btn.key}
            data-testid={`filter-${btn.key}`}
            onClick={() => setFilter(btn.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filter === btn.key
                ? "bg-indigo-700 text-white border-indigo-700"
                : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Map */}
        <div
          className="col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
          style={{ height: 540, position: "relative", zIndex: 0 }}
        >
          <MapContainer
            center={[21.2787, 81.8661]}
            zoom={7}
            style={{ height: "100%", width: "100%", zIndex: 0 }}
            scrollWheelZoom={true}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            />
            {filtered.map((f) => (
              <CircleMarker
                key={f.id}
                center={[f.coordinates.lat, f.coordinates.lng]}
                radius={10}
                pathOptions={{
                  color:       "white",
                  weight:      2,
                  fillColor:   riskColor(f.riskLevel),
                  fillOpacity: 0.88,
                }}
                eventHandlers={{ click: () => openAlert(f) }}
              >
                <LeafletTooltip direction="top" offset={[0, -10]}>
                  <div className="text-xs">
                    <div className="font-semibold">{f.name}</div>
                    <div className="text-gray-500">{f.district} • {f.facilityType}</div>
                    <div className="mt-0.5">
                      Risk: <span className="font-bold">{f.riskOverall}%</span>
                    </div>
                  </div>
                </LeafletTooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Sidebar */}
        <div
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col"
          style={{ height: 540 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-700">Legend &amp; Facilities</span>
          </div>

          <div className="flex flex-col gap-2 mb-5">
            {[
              { color: "bg-red-500",    label: "High Risk"   },
              { color: "bg-orange-500", label: "Medium Risk" },
              { color: "bg-green-500",  label: "Low Risk"    },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm text-gray-600">
                <span className={`w-3 h-3 rounded-full ${item.color} flex-shrink-0`}></span>
                {item.label}
              </div>
            ))}
          </div>

          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold border-t pt-3">
            {filtered.length} facilities shown
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {filtered.map((f) => (
              <div
                key={f.id}
                data-testid={`map-facility-${f.id}`}
                className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => openAlert(f)}
              >
                <div className="text-xs font-semibold text-gray-800 leading-tight">{f.name}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-400">{f.district}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      f.riskLevel === "High"
                        ? "bg-red-100 text-red-700"
                        : f.riskLevel === "Medium"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {f.riskOverall}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AlertModal open={modalOpen} onOpenChange={setModalOpen} facility={selectedFacility} />
    </div>
  );
}