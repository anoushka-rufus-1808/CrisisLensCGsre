import sqlite3, json, os

DB_PATH = os.path.join(os.path.dirname(__file__), "facilities.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS facilities (
                id            TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                district      TEXT NOT NULL,
                facility_type TEXT NOT NULL,
                data          TEXT NOT NULL,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

def get_all_facilities():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM facilities ORDER BY name").fetchall()
    return [json.loads(r["data"]) for r in rows]

def get_facility(facility_id: str):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM facilities WHERE id = ?", (facility_id,)).fetchone()
    return json.loads(row["data"]) if row else None

def upsert_facility(facility_id, name, district, facility_type, data: dict):
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO facilities (id, name, district, facility_type, data)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name          = excluded.name,
                district      = excluded.district,
                facility_type = excluded.facility_type,
                data          = excluded.data,
                updated_at    = CURRENT_TIMESTAMP
        """, (facility_id, name, district, facility_type, json.dumps(data)))
        conn.commit()

def bulk_upsert(facilities: list):
    with get_connection() as conn:
        conn.executemany("""
            INSERT INTO facilities (id, name, district, facility_type, data)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name          = excluded.name,
                district      = excluded.district,
                facility_type = excluded.facility_type,
                data          = excluded.data,
                updated_at    = CURRENT_TIMESTAMP
        """, [
            (f["id"], f["name"], f["district"], f["facilityType"], json.dumps(f["data"]))
            for f in facilities
        ])
        conn.commit()

def delete_facility(facility_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM facilities WHERE id = ?", (facility_id,))
        conn.commit()
    return cur.rowcount > 0

def facility_count() -> int:
    with get_connection() as conn:
        return conn.execute("SELECT COUNT(*) FROM facilities").fetchone()[0]