"""
update_historical.py
--------------------
Fetches the latest daily weather data for Durg from Open-Meteo and
appends any missing rows to public/data/historical/durg_weather.csv.

Run monthly (or set up a cron job / GitHub Action):
    python scripts/update_historical.py

Requires: pip install requests pandas
"""

import csv
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    import requests
    import pandas as pd
except ImportError:
    print("ERROR: Install dependencies first:")
    print("  pip install requests pandas")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
DURG_LAT  = 21.192
DURG_LNG  = 81.318
DISTRICT  = "Durg"

# Path to the CSV relative to this script's location
CSV_PATH = Path(__file__).parent.parent / "public" / "data" / "historical" / "durg_weather.csv"

API_URL = "https://archive-api.open-meteo.com/v1/archive"

# Open-Meteo variable names to fetch
VARIABLES = [
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "relative_humidity_2m_mean",
    "precipitation_sum",
    "wind_speed_10m_mean",
    "shortwave_radiation_sum",
]

# Must match the column order already in the CSV
CSV_COLUMNS = [
    "District",
    "Date",
    "Avg_Temp_C",
    "Max_Temp_C",
    "Min_Temp_C",
    "Humidity_Pct",
    "Rainfall_mm",
    "Wind_Speed_kmh",
    "Solar_Radiation",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def read_last_date(csv_path: Path) -> datetime:
    """Return the most recent date already in the CSV."""
    if not csv_path.exists():
        print(f"CSV not found at {csv_path} — will create it from scratch.")
        return datetime(2015, 1, 1)

    last = None
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                d = datetime.strptime(row["Date"].strip(), "%Y-%m-%d")
                if last is None or d > last:
                    last = d
            except Exception:
                continue

    if last is None:
        return datetime(2015, 1, 1)

    print(f"Last date found in CSV: {last.strftime('%Y-%m-%d')}")
    return last


def fetch_weather(start_date: str, end_date: str) -> list[dict]:
    """Call Open-Meteo Archive API and return list of daily row dicts."""
    params = {
        "latitude":   DURG_LAT,
        "longitude":  DURG_LNG,
        "start_date": start_date,
        "end_date":   end_date,
        "daily":      ",".join(VARIABLES),
        "timezone":   "Asia/Kolkata",
    }
    print(f"Fetching {start_date} → {end_date} from Open-Meteo archive API...")
    try:
        resp = requests.get(API_URL, params=params, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"ERROR fetching data: {e}")
        return []

    data = resp.json()
    daily = data.get("daily", {})
    dates = daily.get("time", [])

    if not dates:
        print("No data returned from API.")
        return []

    def safe(key: str, idx: int) -> str:
        val = daily.get(key, [None])[idx]
        if val is None:
            return ""
        return str(round(float(val), 4))

    rows = []
    for i, date in enumerate(dates):
        rows.append({
            "District":       DISTRICT,
            "Date":           date,
            "Avg_Temp_C":     safe("temperature_2m_mean", i),
            "Max_Temp_C":     safe("temperature_2m_max", i),
            "Min_Temp_C":     safe("temperature_2m_min", i),
            "Humidity_Pct":   safe("relative_humidity_2m_mean", i),
            "Rainfall_mm":    safe("precipitation_sum", i),
            "Wind_Speed_kmh": safe("wind_speed_10m_mean", i),
            "Solar_Radiation": safe("shortwave_radiation_sum", i),
        })

    return rows


def append_rows(csv_path: Path, rows: list[dict]) -> int:
    """Append new rows to the CSV. Creates the file with header if it doesn't exist."""
    if not rows:
        return 0

    write_header = not csv_path.exists()
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        if write_header:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)

    return len(rows)


def verify_no_duplicates(csv_path: Path) -> None:
    """Read the CSV and warn if duplicate dates are found."""
    if not csv_path.exists():
        return
    df = pd.read_csv(csv_path)
    dupes = df[df.duplicated(subset=["Date"], keep=False)]
    if not dupes.empty:
        print(f"WARNING: {len(dupes)} duplicate date rows found in CSV:")
        print(dupes["Date"].unique())
    else:
        print("No duplicate dates — CSV is clean.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("CG State Risk Engine — Historical Data Updater")
    print("=" * 60)
    print(f"Target CSV: {CSV_PATH}")
    print()

    last_date = read_last_date(CSV_PATH)

    # Start the day after the last date in the CSV
    start = last_date + timedelta(days=1)

    # End = 2 days ago (yesterday's data is sometimes still processing)
    end = datetime.now() - timedelta(days=2)

    if start > end:
        print()
        print("✅ CSV is already up to date. Nothing to fetch.")
        return

    start_str = start.strftime("%Y-%m-%d")
    end_str   = end.strftime("%Y-%m-%d")

    rows = fetch_weather(start_str, end_str)

    if not rows:
        print("No new rows to append.")
        return

    added = append_rows(CSV_PATH, rows)
    print()
    print(f"✅ Appended {added} new rows.")
    print(f"   CSV now covers up to: {rows[-1]['Date']}")
    print()

    verify_no_duplicates(CSV_PATH)

    print()
    print("Done. Restart the forecast service to use fresh data:")
    print("  python forecast-service/main.py")
    print()
    print("Or clear the model cache without restarting:")
    print("  curl -X DELETE http://localhost:8001/cache")


if __name__ == "__main__":
    main()