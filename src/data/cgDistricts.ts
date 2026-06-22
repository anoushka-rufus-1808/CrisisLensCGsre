export interface CGDistrict {
  name:        string;
  code:        string;        // Short code used in facility data
  lat:         number;        // HQ coordinates for Open-Meteo weather fetch
  lng:         number;
  division:    "North" | "Central" | "South";
}

export const CG_DISTRICTS: CGDistrict[] = [
  // ── Northern Division ──────────────────────────────────────────────────────
  { name: "Surguja",              code: "SRG", lat: 23.12, lng: 83.20, division: "North"   },
  { name: "Korea",                code: "KRA", lat: 23.25, lng: 82.56, division: "North"   },
  { name: "Balrampur",            code: "BRP", lat: 23.80, lng: 83.70, division: "North"   },
  { name: "Surajpur",             code: "SJP", lat: 23.21, lng: 82.86, division: "North"   },
  { name: "Jashpur",              code: "JSP", lat: 22.89, lng: 84.14, division: "North"   },
  { name: "Raigarh",              code: "RGH", lat: 21.90, lng: 83.40, division: "North"   },
  { name: "Korba",                code: "KRB", lat: 22.35, lng: 82.70, division: "North"   },
  { name: "Bilaspur",             code: "BLS", lat: 22.09, lng: 82.15, division: "North"   },
  { name: "Janjgir-Champa",       code: "JJG", lat: 21.98, lng: 82.57, division: "North"   },
  { name: "Mungeli",              code: "MGL", lat: 22.06, lng: 81.69, division: "North"   },
  { name: "Gaurela-Pendra-Marwahi", code: "GPM", lat: 22.75, lng: 81.90, division: "North" },

  // ── Central Division ───────────────────────────────────────────────────────
  { name: "Raipur",               code: "RPR", lat: 21.25, lng: 81.63, division: "Central" },
  { name: "Durg",                 code: "DRG", lat: 21.19, lng: 81.28, division: "Central" },
  { name: "Rajnandgaon",          code: "RJN", lat: 20.70, lng: 80.70, division: "Central" },
  { name: "Kabirdham",            code: "KBD", lat: 22.01, lng: 81.23, division: "Central" },
  { name: "Bemetara",             code: "BMT", lat: 21.71, lng: 81.53, division: "Central" },
  { name: "Balodabazar",          code: "BDB", lat: 21.66, lng: 82.16, division: "Central" },
  { name: "Mahasamund",           code: "MSM", lat: 21.11, lng: 82.10, division: "Central" },
  { name: "Gariaband",            code: "GRB", lat: 20.63, lng: 82.07, division: "Central" },
  { name: "Balod",                code: "BLD", lat: 20.73, lng: 81.20, division: "Central" },
  { name: "Dhamtari",             code: "DHM", lat: 20.71, lng: 81.55, division: "Central" },

  // ── Southern Division ──────────────────────────────────────────────────────
  { name: "Bastar",               code: "BST", lat: 19.07, lng: 82.03, division: "South"   },
  { name: "Kondagaon",            code: "KDG", lat: 19.60, lng: 81.66, division: "South"   },
  { name: "Kanker",               code: "KNK", lat: 20.27, lng: 81.49, division: "South"   },
  { name: "Narayanpur",           code: "NRP", lat: 19.73, lng: 81.24, division: "South"   },
  { name: "Bijapur",              code: "BJP", lat: 18.84, lng: 80.81, division: "South"   },
  { name: "Dantewada",            code: "DTW", lat: 18.90, lng: 81.35, division: "South"   },
  { name: "Sukma",                code: "SKM", lat: 18.39, lng: 81.66, division: "South"   },
];

/** Get district config by name (case-insensitive substring match) */
export function getDistrict(name: string): CGDistrict | undefined {
  const q = name.toLowerCase();
  return CG_DISTRICTS.find(
    (d) => d.name.toLowerCase() === q || d.code.toLowerCase() === q || q.includes(d.name.toLowerCase()),
  );
}