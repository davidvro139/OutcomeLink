-- City/state reporting uses a bundled gazetteer, not employer coordinates.
-- Preserve migration history for databases that applied the initial migration.
ALTER TABLE `employers`
  DROP CHECK `employer_coordinates_valid`,
  DROP COLUMN `latitude`,
  DROP COLUMN `longitude`;
