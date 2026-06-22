/**
 * Official LGD (Local Government Directory) administrative codes
 * for Chhattisgarh — Durg district.
 * Source: Ministry of Panchayati Raj, locationData.json hierarchy.
 */

export const DURG_DISTRICT_LGD = 378;

export interface LGDBlock {
  name: string;
  code: number;
}

export const DURG_BLOCKS: LGDBlock[] = [
  { name: "Dhamdha", code: 3632 },
  { name: "Durg",    code: 3635 },
  { name: "Patan",   code: 3639 },
];

/** Lookup a block name by its LGD code. */
export function blockName(code: number | string | undefined): string {
  const found = DURG_BLOCKS.find((b) => b.code === Number(code));
  return found ? found.name : "Unknown";
}
