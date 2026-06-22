import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useAlertEmail } from "@/hooks/useAlertEmail";
import type { Facility } from "@/context/DataContext";
import {
  AlertTriangle,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  School,
  Hospital,
  Droplets,
  Building2,
  MapPin,
  Sun,
  Phone,
} from "lucide-react";

interface Props {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  facility:     Facility | null;
}

type SendStatus = "idle" | "sending" | "done";

export function AlertModal({ open, onOpenChange, facility }: Props) {
  const { user }       = useAuth();
  const { sendAlert }  = useAlertEmail();

  const [sendStatus,   setSendStatus]  = useState<SendStatus>("idle");
  const [sendResults,  setSendResults] = useState<{ status: string; message: string; email: string }[]>([]);
  const [customNote,   setCustomNote]  = useState("");

  const handleClose = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setSendStatus("idle");
      setSendResults([]);
      setCustomNote("");
    }
  };

  if (!facility) return null;

  const isHigh   = facility.riskLevel === "High";
  const isMedium = facility.riskLevel === "Medium";

  // Facility-specific email (if set in facility data)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const facilityEmail   = (facility as any).contactEmail  as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const facilityPhone   = (facility as any).contactPhone  as string | undefined;

  const riskBg = isHigh
    ? "bg-red-50 border-red-200"
    : isMedium
    ? "bg-orange-50 border-orange-200"
    : "bg-green-50 border-green-200";

  const riskTextColor = isHigh
    ? "text-red-700"
    : isMedium
    ? "text-orange-700"
    : "text-green-700";

  const riskBadge = isHigh
    ? "bg-red-100 text-red-800 border-red-300"
    : isMedium
    ? "bg-orange-100 text-orange-800 border-orange-300"
    : "bg-green-100 text-green-800 border-green-300";

  const handleSendEmail = async () => {
    setSendStatus("sending");
    setSendResults([]);
    const results = await sendAlert(
      facility,
      user?.name ?? "Dashboard User",
      customNote.trim() || undefined,
    );
    setSendResults(results);
    setSendStatus("done");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
            {facility.facilityType === "school" ? (
              <School   className="w-5 h-5 text-blue-600"   />
            ) : (
              <Hospital className="w-5 h-5 text-purple-600" />
            )}
            {facility.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">

          {/* ── Risk Score Banner ────────────────────────────────────────── */}
          <div className={`flex items-center justify-between rounded-xl border p-4 ${riskBg}`}>
            <div>
              <div className={`text-xs font-semibold uppercase tracking-wide ${riskTextColor}`}>
                ML Risk Score
              </div>
              <div className={`text-4xl font-black ${riskTextColor}`}>
                {facility.riskOverall}%
              </div>
            </div>
            <span className={`text-sm font-bold px-3 py-1.5 rounded-full border ${riskBadge}`}>
              {facility.riskLevel} Risk
            </span>
          </div>

          {/* ── Location ─────────────────────────────────────────────────── */}
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>{facility.address}, {facility.district}</span>
          </div>

          {/* ── Risk Breakdown ───────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Heatwave",
                value: facility.riskHeatwave,
                icon:  <Sun       className="w-3 h-3" />,
                color: "text-red-600",
                bg:    "bg-red-50",
              },
              {
                label: "Water",
                value: facility.riskWaterScarcity,
                icon:  <Droplets  className="w-3 h-3" />,
                color: "text-blue-600",
                bg:    "bg-blue-50",
              },
              {
                label: "Infra",
                value: facility.riskInfrastructure,
                icon:  <Building2 className="w-3 h-3" />,
                color: "text-orange-600",
                bg:    "bg-orange-50",
              },
            ].map(({ label, value, icon, color, bg }) => (
              <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
                <div className={`flex items-center justify-center gap-1 text-xs font-semibold ${color} mb-1`}>
                  {icon} {label}
                </div>
                <div className={`text-2xl font-black ${color}`}>{value}%</div>
              </div>
            ))}
          </div>

          {/* ── Facility Details ─────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs text-gray-600">
            <div className="text-sm font-semibold text-gray-800 mb-2">Facility Details</div>

            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <span className="font-semibold capitalize">{(facility as any).subType}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Water Source</span>
              <span className={`font-semibold capitalize ${
                facility.primaryWaterSource === "tanker" ? "text-red-600" : "text-gray-800"
              }`}>
                {facility.primaryWaterSource}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Power Cut</span>
              <span className={`font-semibold ${
                facility.dailyPowerCutHours > 4 ? "text-red-600" : "text-gray-800"
              }`}>
                {facility.dailyPowerCutHours} hrs/day
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Water Shortage</span>
              <span className={`font-semibold ${
                facility.waterShortageDaysPerMonth > 10 ? "text-red-600" : "text-gray-800"
              }`}>
                {facility.waterShortageDaysPerMonth} days/month
              </span>
            </div>

            {facility.facilityType === "hospital" && (() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const h = facility as any;
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Generator</span>
                    <span className={`font-semibold ${h.generatorAvailable ? "text-green-600" : "text-red-600"}`}>
                      {h.generatorAvailable ? `Available (${h.backupDurationHours}h backup)` : "Not Available"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ambulance</span>
                    <span className={`font-semibold ${h.ambulanceAvailable ? "text-green-600" : "text-red-600"}`}>
                      {h.ambulanceAvailable ? "Available" : "Not Available"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Heatstroke Cases</span>
                    <span className={`font-semibold ${h.heatstrokeCasesCount > 5 ? "text-red-600" : "text-gray-800"}`}>
                      {h.heatstrokeCasesCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Daily Footfall</span>
                    <span className="font-semibold">{h.avgDailyFootfall} patients</span>
                  </div>
                </>
              );
            })()}

            {facility.facilityType === "school" && (() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const s = facility as any;
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Students</span>
                    <span className="font-semibold">{s.totalStudents} ({s.girlsCount}G / {s.boysCount}B)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Building</span>
                    <span className={`font-semibold ${s.buildingCondition === "Poor" ? "text-red-600" : "text-gray-800"}`}>
                      {s.buildingCondition} · {s.roofType} roof
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Working Fans</span>
                    <span className={`font-semibold ${s.fansWorkingCount === 0 ? "text-red-600" : "text-gray-800"}`}>
                      {s.fansWorkingCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Heat Illness Cases</span>
                    <span className={`font-semibold ${s.heatIllnessCasesCount > 0 ? "text-orange-600" : "text-gray-800"}`}>
                      {s.heatIllnessCasesCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Closure Days (3yr)</span>
                    <span className={`font-semibold ${s.heatwaveClosureDays3Years > 5 ? "text-red-600" : "text-gray-800"}`}>
                      {s.heatwaveClosureDays3Years} days
                    </span>
                  </div>
                </>
              );
            })()}

            {/* Peak risk date */}
            <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
              <span className="text-gray-500">Peak Risk Estimated</span>
              <span className="font-semibold text-indigo-700">{facility.peakRiskDate}</span>
            </div>
          </div>

          {/* ── Contact Info ─────────────────────────────────────────────── */}
          {(facilityEmail || facilityPhone) && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-1.5">
              <div className="text-xs font-semibold text-indigo-700 mb-1">Facility Contact</div>
              {facilityEmail && (
                <div className="flex items-center gap-2 text-xs text-indigo-700">
                  <Mail  className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="font-semibold">{facilityEmail}</span>
                </div>
              )}
              {facilityPhone && (
                <div className="flex items-center gap-2 text-xs text-indigo-700">
                  <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="font-semibold">{facilityPhone}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Email Alert Section ──────────────────────────────────────── */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-semibold text-gray-700">
                Send Email Alert
              </span>
            </div>

            {/* Show exactly where the email will go */}
            <div className={`text-xs rounded-lg px-3 py-2.5 flex items-start gap-2 ${
              facilityEmail
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-orange-50 border border-orange-200 text-orange-700"
            }`}>
              <Mail className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                {facilityEmail ? (
                  <>
                    <span className="font-semibold">Email will go to: </span>
                    <span>{facilityEmail}</span>
                    <div className="text-[10px] mt-0.5 opacity-70">
                      (facility-specific email — only this facility receives the alert)
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">No facility email set.</span>
                    <span className="ml-1">Alert will go to admin recipients list.</span>
                    <div className="text-[10px] mt-0.5 opacity-70">
                      To set a facility email, add <code>contactEmail</code> to this facility in mockFacilities.
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Custom note */}
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Add a custom note to include in the email (optional)…"
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-700 placeholder-gray-400"
            />

            {/* Send button */}
            {sendStatus === "idle" && (
              <button
                onClick={handleSendEmail}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  isHigh
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : isMedium
                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                <Mail className="w-4 h-4" />
                Send Alert Email{isHigh ? " (URGENT)" : ""}
              </button>
            )}

            {/* Sending spinner */}
            {sendStatus === "sending" && (
              <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-indigo-100 text-indigo-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending email…
              </div>
            )}

            {/* Results */}
            {sendStatus === "done" && (
              <div className="space-y-2">
                {sendResults.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${
                      r.status === "success"
                        ? "bg-green-50 border border-green-200 text-green-700"
                        : "bg-red-50 border border-red-200 text-red-700"
                    }`}
                  >
                    {r.status === "success" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle      className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold">{r.message}</div>
                      <div className="opacity-70">{r.email}</div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => { setSendStatus("idle"); setSendResults([]); }}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
                >
                  ↩ Send again
                </button>
              </div>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}