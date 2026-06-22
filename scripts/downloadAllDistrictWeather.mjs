/**
 * Run once:  node scripts/downloadAllDistrictWeather.mjs
 * Downloads 5-year historical weather for all 28 CG districts from Open-Meteo.
 * Saves CSV files to:  public/data/historical/<code>_weather.csv
 */

import fs   from "fs";
import path from "path";

const OUTPUT_DIR = "./public/data/historical";

const DISTRICTS = [
  { name: "Surguja",                code: "srg", lat: 23.12, lng: 83.20 },
  { name: "Korea",                  code: "kra", lat: 23.25, lng: 82.56 },
  { name: "Balrampur",              code: "brp", lat: 23.80, lng: 83.70 },
  { name: "Surajpur",               code: "sjp", lat: 23.21, lng: 82.86 },
  { name: "Jashpur",                code: "jsp", lat: 22.89, lng: 84.14 },
  { name: "Raigarh",                code: "rgh", lat: 21.90, lng: 83.40 },
  { name: "Korba",                  code: "krb", lat: 22.35, lng: 82.70 },
  { name: "Bilaspur",               code: "bls", lat: 22.09, lng: 82.15 },
  { name: "Janjgir-Champa",         code: "jjg", lat: 21.98, lng: 82.57 },
  { name: "Mungeli",                code: "mgl", lat: 22.06, lng: 81.69 },
  { name: "Gaurela-Pendra-Marwahi", code: "gpm", lat: 22.75, lng: 81.90 },
  { name: "Raipur",                 code: "rpr", lat: 21.25, lng: 81.63 },
  { name: "Durg",                   code: "drg", lat: 21.19, lng: 81.28 },
  { name: "Rajnandgaon",            code: "rjn", lat: 20.70, lng: 80.70 },
  { name: "Kabirdham",              code: "kbd", lat: 22.01, lng: 81.23 },
  { name: "Bemetara",               code: "bmt", lat: 21.71, lng: 81.53 },
  { name: "Balodabazar",            code: "bdb", lat: 21.66, lng: 82.16 },
  { name: "Mahasamund",             code: "msm", lat: 21.11, lng: 82.10 },
  { name: "Gariaband",              code: "grb", lat: 20.63, lng: 82.07 },
  { name: "Balod",                  code: "bld", lat: 20.73, lng: 81.20 },
  { name: "Dhamtari",               code: "dhm", lat: 20.71, lng: 81.55 },
  { name: "Bastar",                 code: "bst", lat: 19.07, lng: 82.03 },
  { name: "Kondagaon",              code: "kdg", lat: 19.60, lng: 81.66 },
  { name: "Kanker",                 code: "knk", lat: 20.27, lng: 81.49 },
  { name: "Narayanpur",             code: "nrp", lat: 19.73, lng: 81.24 },
  { name: "Bijapur",                code: "bjp", lat: 18.84, lng: 80.81 },
  { name: "Dantewada",              code: "dtw", lat: 18.90, lng: 81.35 },
  { name: "Sukma",                  code: "skm", lat: 18.39, lng: 81.66 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadDistrict(district) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${district.lat}` +
    `&longitude=${district.lng}` +
    `&start_date=2019-01-01` +
    `&end_date=2024-12-31` +
    `&daily=temperature_2m_max,precipitation_sum,relative_humidity_2m_mean` +
    `&timezone=Asia%2FKolkata`;

  const res  = await fetch(url);
  const json = await res.json();

  if (!json.daily) throw new Error(JSON.stringify(json));

  const { time, temperature_2m_max, precipitation_sum, relative_humidity_2m_mean } = json.daily;

  const rows = ["date,temp_max,humidity,rainfall"];
  for (let i = 0; i < time.length; i++) {
    const temp     = (temperature_2m_max[i]         ?? 0).toFixed(1);
    const rain     = (precipitation_sum[i]           ?? 0).toFixed(1);
    const humidity = (relative_humidity_2m_mean[i]   ?? 0).toFixed(1);
    rows.push(`${time[i]},${temp},${humidity},${rain}`);
  }

  const filePath = path.join(OUTPUT_DIR, `${district.code}_weather.csv`);
  fs.writeFileSync(filePath, rows.join("\n"), "utf8");
  console.log(`✅ ${district.name.padEnd(25)} → ${filePath} (${rows.length - 1} rows)`);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`\nDownloading historical weather for ${DISTRICTS.length} CG districts...\n`);

  for (const district of DISTRICTS) {
    const filePath = path.join(OUTPUT_DIR, `${district.code}_weather.csv`);

    // Skip if already downloaded
    if (fs.existsSync(filePath)) {
      console.log(`⏭  ${district.name.padEnd(25)} already exists, skipping`);
      continue;
    }

    try {
      await downloadDistrict(district);
    } catch (err) {
      console.error(`❌ ${district.name}: ${err.message}`);
    }

    // Wait 1.2s between requests to respect Open-Meteo rate limits
    await sleep(1200);
  }

  console.log("\n✅ Done. All CSVs saved to public/data/historical/\n");
}

main();