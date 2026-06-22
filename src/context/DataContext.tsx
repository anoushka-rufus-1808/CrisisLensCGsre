import {
  createContext, useContext, useMemo,
  useState, useCallback, useEffect, ReactNode,
} from "react";
import { useWeather, type CityWeather } from "@/hooks/useWeather";
import { useAuth } from "@/contexts/AuthContext";
import { mockFacilities } from "@/data/facilities";

export interface Coordinates { lat: number; lng: number; }

export interface BaseFacility {
  id: string; name: string; district: string; contactEmail: string;
  lgd_district_code?: string; lgd_block_code?: string; lgd_village_code?: string;
  address: string; coordinates: Coordinates;
  dailyPowerCutHours: number; solarAvailable: boolean;
  primaryWaterSource: "tap" | "handpump" | "borewell" | "tanker";
  alternateWaterSource: boolean; summerDailyWaterAvailability: boolean;
  waterShortageDaysPerMonth: number; rainwaterHarvesting: boolean;
  waterQualityIssue: boolean; totalToilets: number; functionalToilets: number;
  riskOverall: number; riskHeatwave: number; riskWaterScarcity: number;
  riskInfrastructure: number; peakRiskDate: string;
  riskLevel: "Low" | "Medium" | "High";
}

export interface Hospital extends BaseFacility {
  facilityType: "hospital";
  subType: "PHC" | "CHC" | "District Hospital";
  ownership: "Govt" | "Private";
  avgDailyFootfall: number; ambulanceAvailable: boolean;
  emergencyUnit: boolean; summerPowerCutFreq: "Low" | "Medium" | "High";
  generatorAvailable: boolean; backupDurationHours: number;
  heatstrokeCasesCount: number; powerOutageDisruptionDays: number;
  waterScarcityDisruptionDays: number; tankCount: number;
  sanitationCondition: "Good" | "Average" | "Poor";
}

export interface School extends BaseFacility {
  facilityType: "school";
  subType: "Primary" | "Secondary" | "Higher Secondary";
  udiseCode: string; totalStudents: number; boysCount: number; girlsCount: number;
  buildingCondition: "Good" | "Average" | "Poor";
  roofType: "RCC" | "Tin" | "Asbestos";
  fansWorkingCount: number; attendanceDropSummer: boolean;
  tankAvailable: boolean; waterInToilets: boolean;
  closureDaysLastYear: number; heatwaveClosureDays3Years: number;
  heatIllnessCasesCount: number;
}

export type Facility = Hospital | School;
export type RiskLevel = "Low" | "Medium" | "High";

function vulnerabilityFactor(f: Facility): number {
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

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; detail?: string };
    throw new Error(err.error ?? err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface DataContextType {
  facilities:          Facility[];
  allFacilities:       Facility[];
  liveTemp:            number | null;
  liveRainfall:        number | null;
  weatherLoading:      boolean;
  weather:             CityWeather[];
  dbLoading:           boolean;
  mlScoresByDistrict:  Record<string, number>;
  setMLScores:         (scores: Record<string, number>) => void;
  setFacilityMLScores: (scores: Record<string, number>) => void;
  registerFacility:    (f: Facility) => Promise<void>;
  updateFacility:      (id: string, patch: Partial<Facility>) => Promise<void>;
  deleteFacility:      (id: string) => Promise<void>;
  resetFacilities:     () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const weather        = useWeather();
  const { user }       = useAuth();

  const durgEntry      = weather.find((w) => w.city === "Durg/Bhilai");
  const weatherLoading = durgEntry?.loading ?? true;
  const liveTemp       = durgEntry && !durgEntry.loading ? parseFloat(durgEntry.temp) : null;
  const liveRainfall   = durgEntry && !durgEntry.loading ? durgEntry.rainfall : null;

  const [rawFacilities,         setRawFacilities]         = useState<Facility[]>([]);
  const [dbLoading,             setDbLoading]             = useState(true);
  const [mlScoresByDistrict,    setMLScoresState]         = useState<Record<string, number>>({});
  const [mlScoresByFacility,    setFacilityMLScoresState] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<Facility[]>("/api/facilities");
        if (cancelled) return;
        if (data.length === 0) {
          const seed    = mockFacilities as unknown as Facility[];
          const payload = seed.map((f) => ({
            id: f.id, name: f.name, district: f.district,
            facilityType: f.facilityType,
            data: f as unknown as Record<string, unknown>,
          }));
          await apiFetch("/api/facilities/bulk", { method: "POST", body: JSON.stringify(payload) });
          if (!cancelled) setRawFacilities(seed);
        } else {
          if (!cancelled) setRawFacilities(data);
        }
      } catch {
        // Python service not running — fall back to localStorage then mock
        try {
          const stored = localStorage.getItem("cg_facilities");
          if (!cancelled) setRawFacilities(
            stored ? (JSON.parse(stored) as Facility[]) : (mockFacilities as unknown as Facility[])
          );
        } catch {
          if (!cancelled) setRawFacilities(mockFacilities as unknown as Facility[]);
        }
      } finally {
        if (!cancelled) setDbLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setMLScores         = useCallback((s: Record<string, number>) => setMLScoresState(s), []);
  const setFacilityMLScores = useCallback((s: Record<string, number>) => setFacilityMLScoresState(s), []);

  const facilitiesWithScores = useMemo<Facility[]>(() => {
    if (dbLoading) return [];
    return rawFacilities.map((f) => {
      const vuln           = vulnerabilityFactor(f);
      const facilityML     = mlScoresByFacility[f.id] ?? null;
      const distKey        = f.district.toLowerCase().trim();
      const districtEntry  = Object.entries(mlScoresByDistrict).find(
        ([k]) => k.toLowerCase().includes(distKey) || distKey.includes(k.toLowerCase()),
      );
      const mlScore = facilityML ?? districtEntry?.[1] ?? null;

      let riskOverall: number;
      let riskLevel:   RiskLevel;
      if (mlScore !== null) {
        riskOverall = Math.min(100, Math.round(mlScore * (0.7 + 0.6 * vuln)));
        riskLevel   = riskOverall >= 78 ? "High" : riskOverall >= 52 ? "Medium" : "Low";
      } else {
        riskOverall = Math.round(30 + vuln * 50);
        riskLevel   = riskOverall >= 72 ? "High" : riskOverall >= 52 ? "Medium" : "Low";
      }

      const heatAdd = liveTemp ? (liveTemp - 30) * 1.5 : 0;
      return {
        ...f,
        riskOverall,
        riskLevel,
        riskHeatwave:       Math.min(100, Math.round(vuln * 80 + heatAdd)),
        riskWaterScarcity:  Math.min(100, Math.round(
          (f.primaryWaterSource === "tanker" ? 70
            : f.primaryWaterSource === "handpump" ? 55 : 35)
          + f.waterShortageDaysPerMonth * 1.5,
        )),
        riskInfrastructure: Math.round(vuln * 60),
        peakRiskDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + Math.round(30 + vuln * 60));
          return d.toISOString().slice(0, 10);
        })(),
      };
    });
  }, [rawFacilities, mlScoresByDistrict, mlScoresByFacility, liveTemp, dbLoading]);

  const facilities = useMemo<Facility[]>(() => {
    if (!user || user.role === "admin") return facilitiesWithScores;
    const orgId   = user.organizationId ?? "";
    const orgType = orgId.includes("school") ? "school" : orgId.includes("hospital") ? "hospital" : null;
    const nameKey = orgId.split("_")[0].toLowerCase();
    return facilitiesWithScores.filter((f) => {
      if (orgType && f.facilityType !== orgType) return false;
      if (nameKey && nameKey.length > 2) return f.name.toLowerCase().includes(nameKey);
      return true;
    });
  }, [facilitiesWithScores, user]);

  const registerFacility = useCallback(async (f: Facility) => {
    await apiFetch("/api/facilities", {
      method: "POST",
      body:   JSON.stringify({ id: f.id, name: f.name, district: f.district, facilityType: f.facilityType, data: f }),
    });
    setRawFacilities((prev) => [...prev, f]);
  }, []);

  const updateFacility = useCallback(async (id: string, patch: Partial<Facility>) => {
    setRawFacilities((prev) => {
      const next   = prev.map((f) => f.id === id ? { ...f, ...patch } as Facility : f);
      const target = next.find((f) => f.id === id);
      if (target) {
        apiFetch(`/api/facilities/${id}`, {
          method: "PUT",
          body:   JSON.stringify({ id, name: target.name, district: target.district, facilityType: target.facilityType, data: target }),
        }).catch(console.error);
      }
      return next;
    });
  }, []);

  const deleteFacility = useCallback(async (id: string) => {
    await apiFetch(`/api/facilities/${id}`, { method: "DELETE" });
    setRawFacilities((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const resetFacilities = useCallback(async () => {
    const seed    = mockFacilities as unknown as Facility[];
    await Promise.all(rawFacilities.map((f) =>
      apiFetch(`/api/facilities/${f.id}`, { method: "DELETE" }).catch(() => {}),
    ));
    const payload = seed.map((f) => ({
      id: f.id, name: f.name, district: f.district, facilityType: f.facilityType,
      data: f as unknown as Record<string, unknown>,
    }));
    await apiFetch("/api/facilities/bulk", { method: "POST", body: JSON.stringify(payload) });
    setRawFacilities(seed);
  }, [rawFacilities]);

  return (
    <DataContext.Provider value={{
      facilities, allFacilities: facilitiesWithScores,
      liveTemp, liveRainfall, weatherLoading, weather,
      dbLoading,
      mlScoresByDistrict, setMLScores, setFacilityMLScores,
      registerFacility, updateFacility, deleteFacility, resetFacilities,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}