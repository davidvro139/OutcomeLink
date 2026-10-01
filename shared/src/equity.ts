export const EQUITY_DIMENSIONS = [
  "entryYear", "gender", "raceEthnicity", "economicallyDisadvantaged",
  "firstGenerationStudent", "disabilityStatus",
] as const;
export type EquityDimension = (typeof EQUITY_DIMENSIONS)[number];
export const EQUITY_DIMENSION_LABELS: Record<EquityDimension, string> = {
  entryYear: "Entry Year", gender: "Gender", raceEthnicity: "Race/Ethnicity",
  economicallyDisadvantaged: "Economically Disadvantaged",
  firstGenerationStudent: "First-Generation Student", disabilityStatus: "Disability Status",
};

export const GENDERS = ["MALE", "FEMALE", "NONBINARY", "PREFER_NOT_TO_SAY"] as const;
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  MALE: "Male", FEMALE: "Female", NONBINARY: "Nonbinary", PREFER_NOT_TO_SAY: "Prefer Not to Say",
};
export const RACE_ETHNICITIES = [
  "WHITE", "BLACK_AFRICAN_AMERICAN", "HISPANIC_LATINO", "ASIAN",
  "NATIVE_HAWAIIAN_PACIFIC_ISLANDER", "AMERICAN_INDIAN_ALASKA_NATIVE",
  "TWO_OR_MORE_RACES", "NONRESIDENT_ALIEN", "UNKNOWN_OR_NOT_REPORTED",
] as const;
export const RACE_ETHNICITY_LABELS: Record<(typeof RACE_ETHNICITIES)[number], string> = {
  WHITE: "White", BLACK_AFRICAN_AMERICAN: "Black/African American",
  HISPANIC_LATINO: "Hispanic/Latino", ASIAN: "Asian",
  NATIVE_HAWAIIAN_PACIFIC_ISLANDER: "Native Hawaiian/Pacific Islander",
  AMERICAN_INDIAN_ALASKA_NATIVE: "American Indian/Alaska Native",
  TWO_OR_MORE_RACES: "Two or More Races", NONRESIDENT_ALIEN: "Nonresident Alien",
  UNKNOWN_OR_NOT_REPORTED: "Unknown or Not Reported",
};
