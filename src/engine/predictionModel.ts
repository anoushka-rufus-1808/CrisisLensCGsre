/**
 * Heatwave & Water Scarcity Prediction Model
 *
 * Uses:
 * 1. Live temperature from Open-Meteo (Durg/Bhilai station)
 * 2. Historical summer max-temp baselines from durg_weather.csv
 * 3. Historical rainfall deficit patterns from durg_water_scarcity.csv
 */

import {
  computeInfrastructureScore,
  computeWaterScarcityScore,
  smoothWeatherAdjustment,
} from "@/engine/scoringMetrics";

export interface ForecastPoint {
  date: string;
  dayOffset: number;
  projectedMaxTemp: number;
  heatwaveRisk: number;
  waterScarcityRisk: number;
  overallRisk: number;
  rainfallDeficitPct: number;
}

function seasonalTempOffset(dayOfSeason: number): number {
  if (dayOfSeason <= 0)  return 0;
  if (dayOfSeason <= 55) return (dayOfSeason / 55) * 4.5;
  if (dayOfSeason <= 90) return 4.5 - ((dayOfSeason - 55) / 35) * 4.5;
  return 0;
}

function seasonalRainfallDeficit(dayOfSeason: number): number {
  if (dayOfSeason <= 55) return 32 - (dayOfSeason / 55) * 10;
  if (dayOfSeason <= 90) return 22 - ((dayOfSeason - 55) / 35) * 28;
  return -6;
}

export function tempToHeatwaveRisk(temp: number): number {
  if (temp < 32) return 10;
  if (temp < 35) return 10 + (temp - 32) * 3;
  if (temp < 38) return 19 + (temp - 35) * 6;
  if (temp < 40) return 37 + (temp - 38) * 9;
  if (temp < 42) return 55 + (temp - 40) * 12;
  if (temp < 44) return 79 + (temp - 42) * 8;
  return 95;
}

export function deficitToWaterScarcityRisk(deficitPct: number): number {
  if (deficitPct <= -20) return 5;
  if (deficitPct <= 0)   return 15 + (deficitPct + 20) * 0.5;
  if (deficitPct <= 20)  return 25 + deficitPct * 2.2;
  if (deficitPct <= 40)  return 69 + (deficitPct - 20) * 1.0;
  return 89;
}

export function computeOverallForecastRisk(heatwave: number, water: number, infra: number): number {
  return Math.min(100, Math.round(heatwave * 0.5 + water * 0.3 + infra * 0.2));
}

export function buildForecast(
  liveTemp: number | null,
  historicalAvgSummerMaxTemp: number | null,
  horizonDays: 30 | 60 | 90,
  facilityInfraScore: number = 45,
): ForecastPoint[] {
  const baseTemp       = liveTemp ?? historicalAvgSummerMaxTemp ?? 39.0;
  const historicalBase = historicalAvgSummerMaxTemp ?? 39.0;
  const tempBias       = baseTemp - historicalBase;

  const today = new Date();
  const aprFirst = new Date(today.getFullYear(), 3, 1);
  const currentDayOfSeason = Math.max(
    0,
    Math.round((today.getTime() - aprFirst.getTime()) / (1000 * 60 * 60 * 24)),
  );

  const step   = horizonDays === 30 ? 3 : horizonDays === 60 ? 5 : 7;
  const points = Math.floor(horizonDays / step) + 1;

  return Array.from({ length: points }, (_, i) => {
    const dayOffset          = i * step;
    const dayOfSeason        = currentDayOfSeason + dayOffset;
    const seasonalOffset     = seasonalTempOffset(dayOfSeason);
    const rainfallDeficitPct = parseFloat(
      (seasonalRainfallDeficit(dayOfSeason) + tempBias * 0.4).toFixed(1),
    );
    const projectedMaxTemp = parseFloat(
      Math.min(48, historicalBase + seasonalOffset + tempBias * 0.65).toFixed(1),
    );
    const heatwaveRisk      = Math.round(tempToHeatwaveRisk(projectedMaxTemp));
    const waterScarcityRisk = Math.round(deficitToWaterScarcityRisk(rainfallDeficitPct));
    const overallRisk       = computeOverallForecastRisk(heatwaveRisk, waterScarcityRisk, facilityInfraScore);

    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + dayOffset);
    const date = forecastDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" });

    return { date, dayOffset, projectedMaxTemp, heatwaveRisk, waterScarcityRisk, overallRisk, rainfallDeficitPct };
  });
}

export interface SchoolRiskInput {
  facilityType: "school" | "hospital";
  totalStudents: number;
  workingFans: number;
  roofType: "RCC" | "Tin" | "Asbestos";
  primaryWaterSource: "tap" | "handpump" | "borewell" | "tanker";
  alternateWaterSource: boolean;
  waterShortageDaysPerMonth: number;
  heatIllnessCasesCount: number;
  closureDaysLastYear: number;
  backupPowerHrs: number;
  nearWaterBody: boolean;
  currentLiveTemp: number | null;
  currentLiveRainfall?: number | null;  // NEW: optional live rainfall input
}

export interface SchoolRiskResult {
  heatwaveRisk: number;
  waterScarcityRisk: number;
  infrastructureRisk: number;
  overallRisk: number;
  riskLevel: "Low" | "Medium" | "High";
  recommendations: string[];
  weatherAdjustment: number;
}

/**
 * School/hospital risk prediction from form inputs.
 * Now uses shared smoothWeatherAdjustment() and computeWaterScarcityScore()
 * so this form and the dashboard always produce consistent numbers.
 */
export function predictSchoolRisk(input: SchoolRiskInput): SchoolRiskResult {
  const {
    facilityType,
    workingFans,
    roofType,
    primaryWaterSource,
    alternateWaterSource,
    waterShortageDaysPerMonth,
    heatIllnessCasesCount,
    closureDaysLastYear,
    backupPowerHrs,
    nearWaterBody,
    currentLiveTemp,
    currentLiveRainfall = null,
  } = input;

  const isSchool = facilityType === "school";

  // ── Heatwave score ────────────────────────────────────────────────────────
  let heatwaveBase: number;
  if (isSchool) {
    heatwaveBase = Math.min(75, 30 + heatIllnessCasesCount * 3 + Math.round(closureDaysLastYear / 5));
    if (workingFans < 15)        heatwaveBase = Math.min(95, heatwaveBase + 15);
    if (roofType === "Tin")      heatwaveBase = Math.min(95, heatwaveBase + 10);
    if (roofType === "Asbestos") heatwaveBase = Math.min(95, heatwaveBase + 8);
  } else {
    heatwaveBase = Math.min(90, 40 + Math.round(heatIllnessCasesCount / 3));
    if (backupPowerHrs < 6) heatwaveBase = Math.min(95, heatwaveBase + 15);
  }

  // FIXED: use shared smooth curve — consistent with DataContext
  const weatherAdjustment = smoothWeatherAdjustment(currentLiveTemp);
  const heatwaveRisk = Math.min(95, heatwaveBase + weatherAdjustment);

  // ── Water scarcity score — shared with DataContext ────────────────────────
  // nearWaterBody handled as a bonus after the shared score
  const currentMonth = new Date().getMonth();
  const shortageMonth = waterShortageDaysPerMonth > 5 ? [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december",
  ][currentMonth] : "N/A";

  let waterScarcityRisk = computeWaterScarcityScore({
    rawWaterSource:       primaryWaterSource,
    shortageMonth,
    alternateWaterSource,
    currentMonth,
    liveRainfallMm:       currentLiveRainfall,
  });

  // nearWaterBody is form-specific (not in facility data) — apply here
  if (nearWaterBody) waterScarcityRisk = Math.max(0, waterScarcityRisk - 5);

  // ── Infrastructure score ──────────────────────────────────────────────────
  const infrastructureRisk = computeInfrastructureScore(
    isSchool
      ? {
          facilityType:    "school",
          roofType,
          fansWorkingCount: workingFans,
          tankAvailable:   alternateWaterSource,
          waterInToilets:  waterShortageDaysPerMonth < 10,
        }
      : {
          facilityType:        "hospital",
          backupDurationHours: backupPowerHrs,
        },
  );

  // ── Overall risk ──────────────────────────────────────────────────────────
  const raw         = Math.round(heatwaveRisk * 0.5 + waterScarcityRisk * 0.3 + infrastructureRisk * 0.2);
  const overallRisk = Math.min(100, Math.max(0, raw));
  const riskLevel: "Low" | "Medium" | "High" =
    overallRisk >= 68 ? "High" : overallRisk >= 45 ? "Medium" : "Low";

  const recommendations: string[] = [];
  if (heatwaveRisk >= 60)                          recommendations.push("Install additional fans or coolers immediately");
  if (roofType === "Tin" || roofType === "Asbestos") recommendations.push("Apply heat-reflective roof coating or add false ceiling insulation");
  if (primaryWaterSource === "handpump" || primaryWaterSource === "tanker")
                                                    recommendations.push("Develop alternative water source (borewell or tap connection)");
  if (!alternateWaterSource)                        recommendations.push("Set up alternate water storage (overhead tank, rainwater harvesting)");
  if (waterShortageDaysPerMonth > 10)               recommendations.push("Pre-monsoon water storage planning required");
  if (heatIllnessCasesCount > 5)                    recommendations.push("Train staff in heat illness recognition and first aid");
  if (closureDaysLastYear > 10)                     recommendations.push("Install early-warning alert system linked to IMD heatwave advisories");
  if (isSchool && workingFans < 10)                 recommendations.push("Priority: Ensure minimum 15 working fans per classroom");
  if (!isSchool && backupPowerHrs < 6)              recommendations.push("Upgrade generator capacity to maintain 6+ hours backup power");
  if (recommendations.length === 0)                 recommendations.push("Maintain current preparedness levels and conduct quarterly drills");

  return { heatwaveRisk, waterScarcityRisk, infrastructureRisk, overallRisk, riskLevel, recommendations, weatherAdjustment };
}