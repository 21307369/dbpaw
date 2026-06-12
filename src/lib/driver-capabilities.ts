export interface DriverCapabilities {
  routines: boolean;
  events: boolean;
  sequences: boolean;
  types: boolean;
  synonyms: boolean;
  packages: boolean;
  foreignKeys: boolean;
  queryWithId: boolean;
}

export const CAPABILITY_FLAGS = {
  routines: 0b0000_0001,
  events: 0b0000_0010,
  sequences: 0b0000_0100,
  types: 0b0000_1000,
  synonyms: 0b0001_0000,
  packages: 0b0010_0000,
  foreignKeys: 0b0100_0000,
  queryWithId: 0b1000_0000,
} as const;

export const EMPTY_CAPABILITIES: DriverCapabilities = {
  routines: false,
  events: false,
  sequences: false,
  types: false,
  synonyms: false,
  packages: false,
  foreignKeys: false,
  queryWithId: false,
};

export function decodeCapabilities(bits: number): DriverCapabilities {
  return {
    routines: (bits & CAPABILITY_FLAGS.routines) !== 0,
    events: (bits & CAPABILITY_FLAGS.events) !== 0,
    sequences: (bits & CAPABILITY_FLAGS.sequences) !== 0,
    types: (bits & CAPABILITY_FLAGS.types) !== 0,
    synonyms: (bits & CAPABILITY_FLAGS.synonyms) !== 0,
    packages: (bits & CAPABILITY_FLAGS.packages) !== 0,
    foreignKeys: (bits & CAPABILITY_FLAGS.foreignKeys) !== 0,
    queryWithId: (bits & CAPABILITY_FLAGS.queryWithId) !== 0,
  };
}
