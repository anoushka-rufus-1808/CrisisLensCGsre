/**
 * Pure mathematical scoring functions — Single Responsibility Principle.
 * No React, no side-effects, no imports from DataContext.
 * Imported by DataContext.tsx (which re-exports the types for backward compat).
 */

export type RiskLevel = "Low" | "Medium" | "High";

/**
 * Smooth live-temperature weather adjustment (0–12 pts).
 * Replaces the old crude 3-step (+3/+6/+10).
 * Linear interpolation between calibration anchors starting at 35°C.
 * Below 35°C → no adjustment (not a heatwave condition).
 */
export function smoothWeatherAdjustment(liveTemp: number | null): number {
  if (liveTemp === null || liveTemp < 35) return 0;
  if (liveTemp < 38) return Math.round((liveTemp - 35) * 1.0);   // 0 → 3  (+1/°C)
  if (liveTemp < 40) return Math.round(3 + (liveTemp - 38) * 1.5); // 3 → 6  (+1.5/°C)
  if (liveTemp < 42) return Math.round(6 + (liveTemp - 40) * 2.0); // 6 → 10 (+2/°C)
  if (liveTemp < 44) return Math.round(10 + (liveTemp - 42) * 1.0); // 10 → 12 (+1/°C)
  return 12;
}

/**
 * Heatwave vulnerability score (0–95).
 *
 * School signals (all optional, graceful defaults):
 *   closureDays3Years: 3-year cumulative closure signal (÷15 to match annual ÷5 scale)
 * Hospital signals:
 *   backupPowerHrs < 6 → +15 vulnerability loading
 */
export function computeHeatwaveScore(params: {
  facilityType: "hospital" | "school";
  heatCasesCount: number;
  closureDaysLastYear: number;
  backupPowerHrs: number;
  workingFans: number;
  closureDays3Years?: number;
}): number {
  const { facilityType } = params;
  const heatCasesCount      = Number(params.heatCasesCount)      || 0;
  const closureDaysLastYear = Number(params.closureDaysLastYear)  || 0;
  const closureDays3Years   = Number(params.closureDays3Years)    || 0;
  const backupPowerHrs      = Number(params.backupPowerHrs)       || 0;
  const workingFans         = Number(params.workingFans)          || 0;

  const base =
    facilityType === "hospital"
      ? Math.min(90, 40 + Math.round(heatCasesCount / 3))
      : Math.min(
          75,
          30 +
          heatCasesCount * 3 +
          Math.round(closureDaysLastYear / 5) +
          Math.round(closureDays3Years / 15),
        );

  const vulnerabilityLoading =
    facilityType === "school" ? workingFans < 15 : backupPowerHrs < 6;

  return Math.min(95, base + (vulnerabilityLoading ? 15 : 0));
}

/**
 * Water scarcity risk score (0–95).
 *
 * Static signals:
 *   solely "handpump" → +30 | source contains "tanker" → +20
 *   shortage_month matches current calendar month exactly → +15
 *   no alternate water source → +10
 *
 * Live rainfall adjustment (NEW):
 *   >15 mm today  → −8  (heavy rain, active relief)
 *   5–15 mm today → −4  (moderate rain, partial relief)
 *   1–5 mm today  → −2  (light rain, minimal relief)
 *   0 mm in summer (Apr–Jun) → +5 (dry day amplifies scarcity)
 *   0 mm outside summer → 0  (no change)
 */
export function computeWaterScarcityScore(params: {
  rawWaterSource: string;
  shortageMonth: string;
  alternateWaterSource: boolean;
  currentMonth?: number;
  liveRainfallMm?: number | null;
}): number {
  const {
    shortageMonth,
    alternateWaterSource,
    currentMonth = new Date().getMonth(),
    liveRainfallMm = null,
  } = params;
  const src = String(params.rawWaterSource ?? "").toLowerCase().trim().replace(/\s+/g, "");

  const solely = src === "handpump";
  const tanker = src.includes("tanker");

  const seasonal = (() => {
    if (!shortageMonth || shortageMonth.toUpperCase() === "N/A") return false;
    const map: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };
    return shortageMonth.toLowerCase().split(",").some((m) => {
      const idx = map[m.trim()];
      return idx !== undefined && idx === currentMonth;
    });
  })();

  // ── Live rainfall adjustment ──────────────────────────────────────────────
  let rainfallAdjustment = 0;
  if (liveRainfallMm !== null) {
    if (liveRainfallMm > 15) {
      rainfallAdjustment = -8;   // heavy rain → real-time relief
    } else if (liveRainfallMm >= 5) {
      rainfallAdjustment = -4;   // moderate rain
    } else if (liveRainfallMm >= 1) {
      rainfallAdjustment = -2;   // light rain
    } else if (liveRainfallMm === 0 && currentMonth >= 3 && currentMonth <= 5) {
      rainfallAdjustment = +5;   // zero rain in Apr–Jun amplifies scarcity
    }
  }

  const base =
    (solely ? 30 : tanker ? 20 : src.includes("handpump") ? 15 : 0) +
    (seasonal ? 15 : 0) +
    (!alternateWaterSource ? 10 : 0);

  return Math.min(95, Math.max(0, base + rainfallAdjustment));
}

// ─── Infrastructure Score ─────────────────────────────────────────────────────
export interface InfraInput {
  facilityType: "hospital" | "school";
  // Hospital
  backupDurationHours?: number;
  generatorAvailable?: boolean;
  solarAvailable?: boolean;
  sanitationCondition?: "Good" | "Average" | "Poor";
  dailyPowerCutHours?: number;
  powerOutageDisruptionDays?: number;
  waterScarcityDisruptionDays?: number;
  // School
  roofType?: "RCC" | "Tin" | "Asbestos";
  fansWorkingCount?: number;
  buildingCondition?: "Good" | "Average" | "Poor";
  tankAvailable?: boolean;
  waterQualityIssue?: boolean;
  waterInToilets?: boolean;
}

export function computeInfrastructureScore(params: InfraInput): number {
  if (params.facilityType === "hospital") {
    const backupHrs            = Number(params.backupDurationHours)        || 0;
    const genAvail             = params.generatorAvailable                  ?? true;
    const solar                = params.solarAvailable                      ?? false;
    const sanitation           = params.sanitationCondition                 ?? "Average";
    const powerCut             = Number(params.dailyPowerCutHours)          || 0;
    const outageDays           = Number(params.powerOutageDisruptionDays)   || 0;
    const waterDisruptDays     = Number(params.waterScarcityDisruptionDays) || 0;

    let score = 30;

    if      (backupHrs < 2)  score += 35;
    else if (backupHrs < 4)  score += 25;
    else if (backupHrs < 6)  score += 15;
    else if (backupHrs < 8)  score += 8;
    else if (backupHrs < 12) score += 3;

    if (!genAvail) score += 12;
    if (solar)     score -= 6;

    if      (sanitation === "Poor")    score += 15;
    else if (sanitation === "Average") score += 7;

    if      (powerCut > 4) score += 8;
    else if (powerCut > 0) score += 3;

    if      (outageDays > 7) score += 8;
    else if (outageDays > 3) score += 4;

    if      (waterDisruptDays > 5) score += 5;
    else if (waterDisruptDays > 2) score += 2;

    return Math.min(95, Math.max(10, score));

  } else {
    const roofType       = params.roofType          ?? "RCC";
    const fans           = Number(params.fansWorkingCount) || 0;
    const buildingCond   = params.buildingCondition  ?? "Average";
    const tankAvail      = params.tankAvailable      ?? true;
    const waterQuality   = params.waterQualityIssue  ?? false;
    const waterInToilets = params.waterInToilets     ?? true;

    const roofScore = roofType === "RCC" ? 15 : roofType === "Asbestos" ? 52 : 63;
    const fanScore  = fans > 30 ? 10 : fans > 20 ? 20 : fans > 10 ? 35 : fans > 5 ? 55 : 75;
    const heatVuln  = Math.round((roofScore + fanScore) / 2);

    let waterScore = 30;
    if (!tankAvail)      waterScore += 18;
    if (waterQuality)    waterScore += 10;
    if (!waterInToilets) waterScore += 6;
    waterScore = Math.min(90, waterScore);

    const buildingScore = buildingCond === "Good" ? 15 : buildingCond === "Average" ? 40 : 68;

    return Math.min(
      95,
      Math.max(10, Math.round(heatVuln * 0.55 + waterScore * 0.30 + buildingScore * 0.15)),
    );
  }
}

/**
 * Overall risk and level derived from component scores.
 * Weights: Heatwave 50% · Water Scarcity 30% · Infrastructure 20%.
 */
export function computeOverallRisk(
  heatwave: number,
  waterScarcity: number,
  infrastructure: number,
): { riskOverall: number; riskLevel: RiskLevel } {
  const raw = Math.round(heatwave * 0.5 + waterScarcity * 0.3 + infrastructure * 0.2);
  const riskOverall = Math.min(100, Math.max(0, raw));
  const riskLevel: RiskLevel =
    riskOverall >= 68 ? "High" : riskOverall >= 45 ? "Medium" : "Low";
  return { riskOverall, riskLevel };
}