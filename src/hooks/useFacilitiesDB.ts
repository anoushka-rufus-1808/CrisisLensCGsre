import { useState, useEffect, useCallback } from "react";
import { mockFacilities } from "@/data/facilities";
import type { Facility } from "@/context/DataContext";

const DB_KEY   = "cg_facilities_db_v2";
const SEED_KEY = "cg_facilities_seeded_v2";

function readDB(): Facility[] {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? (JSON.parse(raw) as Facility[]) : [];
  } catch { return []; }
}

function writeDB(facilities: Facility[]): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(facilities));
  } catch { /* quota exceeded */ }
}

/** Seed the database from mockFacilities on first ever load */
function seedIfEmpty(): Facility[] {
  const seeded = localStorage.getItem(SEED_KEY);
  if (seeded) return readDB();
  writeDB(mockFacilities as unknown as Facility[]);
  localStorage.setItem(SEED_KEY, "1");
  return mockFacilities as unknown as Facility[];
}

export interface FacilitiesDB {
  facilities:        Facility[];
  loading:           boolean;
  addFacility:       (f: Facility) => void;
  updateFacility:    (id: string, patch: Partial<Facility>) => void;
  deleteFacility:    (id: string) => void;
  resetToDefaults:   () => void;
}

export function useFacilitiesDB(): FacilitiesDB {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const data = seedIfEmpty();
    setFacilities(data);
    setLoading(false);
  }, []);

  const addFacility = useCallback((f: Facility) => {
    setFacilities((prev) => {
      const next = [...prev, f];
      writeDB(next);
      return next;
    });
  }, []);

  const updateFacility = useCallback((id: string, patch: Partial<Facility>) => {
    setFacilities((prev) => {
      const next = prev.map((f) => f.id === id ? { ...f, ...patch } as Facility : f);
      writeDB(next);
      return next;
    });
  }, []);

  const deleteFacility = useCallback((id: string) => {
    setFacilities((prev) => {
      const next = prev.filter((f) => f.id !== id);
      writeDB(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    const defaults = mockFacilities as unknown as Facility[];
    writeDB(defaults);
    setFacilities(defaults);
  }, []);

  return { facilities, loading, addFacility, updateFacility, deleteFacility, resetToDefaults };
}