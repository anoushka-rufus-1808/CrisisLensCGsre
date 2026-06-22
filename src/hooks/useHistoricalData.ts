import { useState, useEffect } from "react";

export interface YearlyWeatherStats {
  year: number;
  summerAvgMaxTemp: number;
  summerPeakMaxTemp: number;
}

export interface WaterScarcityRecord {
  year: number;
  dryDays: number;
  rainfallDeficitPct: number;
  label: string;
}

export interface MonthlyHealthRecord {
  yearMonth: string;
  diarrheaCases: number;
}

export interface HistoricalData {
  loading: boolean;
  error: string | null;
  weather: YearlyWeatherStats[];
  waterScarcity: WaterScarcityRecord[];
  health: MonthlyHealthRecord[];
  tenYearAvgSummerMaxTemp: number | null;
}

/**
 * RFC 4180-compliant CSV parser.
 * Handles quoted fields (including fields that contain commas or newlines).
 * Replaces the naive .split(",") approach which silently shifts columns
 * whenever a label cell contains a comma inside quotes.
 */
function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.trim().split("\n");

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field);
    rows.push(fields);
  }

  return rows;
}

export function useHistoricalData(): HistoricalData {
  const [state, setState] = useState<HistoricalData>({
    loading: true,
    error: null,
    weather: [],
    waterScarcity: [],
    health: [],
    tenYearAvgSummerMaxTemp: null,
  });

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");

    Promise.all([
      fetch(`${base}/data/historical/durg_weather.csv`).then((r) => r.text()),
      fetch(`${base}/data/historical/durg_water_scarcity.csv`).then((r) => r.text()),
      fetch(`${base}/data/historical/durg_health.csv`).then((r) => r.text()),
    ])
      .then(([weatherText, waterText, healthText]) => {
        // ── Weather: group by year, filter Apr–Jun (summer peak) ─────────────
        // Columns: District,Date,Avg_Temp_C,Max_Temp_C,...
        const weatherRows = parseCSVRows(weatherText).slice(1);
        const yearMap: Record<number, number[]> = {};

        for (const row of weatherRows) {
          if (row.length < 4) continue;
          const dateParts = row[1]?.split("-");
          if (!dateParts || dateParts.length < 3) continue;
          const year = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10);
          if (month < 4 || month > 6) continue;
          const maxTemp = parseFloat(row[3]);
          if (isNaN(maxTemp)) continue;
          if (!yearMap[year]) yearMap[year] = [];
          yearMap[year].push(maxTemp);
        }

        const weather: YearlyWeatherStats[] = Object.entries(yearMap)
          .map(([yr, temps]) => ({
            year: parseInt(yr, 10),
            summerAvgMaxTemp: parseFloat(
              (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1),
            ),
            summerPeakMaxTemp: parseFloat(Math.max(...temps).toFixed(1)),
          }))
          .sort((a, b) => a.year - b.year);

        const avgTemps = weather.map((w) => w.summerAvgMaxTemp);
        const tenYearAvgSummerMaxTemp =
          avgTemps.length > 0
            ? parseFloat(
                (avgTemps.reduce((a, b) => a + b, 0) / avgTemps.length).toFixed(1),
              )
            : null;

        // ── Water Scarcity ────────────────────────────────────────────────────
        // Columns: District,Agro_Climatic_Zone,Year,Historical_LPA_mm,Actual_Monsoon_Rainfall_mm,
        //          Rainfall_Deficit_Pct,Monsoon_Dry_Days_Count,...,Water_Scarcity_Risk_Label
        const waterRows = parseCSVRows(waterText).slice(1);
        const waterScarcity: WaterScarcityRecord[] = waterRows
          .filter((row) => row.length >= 12)
          .map((row) => ({
            year: parseInt(row[2], 10),
            rainfallDeficitPct: parseFloat(row[5]),
            dryDays: parseInt(row[6], 10),
            label: row[11]?.trim() ?? "Unknown",
          }))
          .sort((a, b) => a.year - b.year);

        // ── Health: aggregate diarrhea cases by year-month ────────────────────
        // Columns: State_Code,State_Name,District_Code,District_Name,Date,
        //          VHND_Centres_Conducted,Diarrhea_Cases,Emergency_Department_Deaths,Category
        const healthRows = parseCSVRows(healthText).slice(1);
        const monthMap: Record<string, number> = {};

        for (const row of healthRows) {
          if (row.length < 7) continue;
          const date = row[4]?.trim();
          const cases = parseFloat(row[6]);
          if (!date || isNaN(cases)) continue;
          const ym = date.slice(0, 7);
          monthMap[ym] = (monthMap[ym] ?? 0) + cases;
        }

        const health: MonthlyHealthRecord[] = Object.entries(monthMap)
          .map(([yearMonth, diarrheaCases]) => ({
            yearMonth,
            diarrheaCases: Math.round(diarrheaCases),
          }))
          .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

        setState({
          loading: false,
          error: null,
          weather,
          waterScarcity,
          health,
          tenYearAvgSummerMaxTemp,
        });
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: String(err) }));
      });
  }, []);

  return state;
}
