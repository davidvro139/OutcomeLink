ALTER TABLE `employers`
  ADD COLUMN `latitude` DOUBLE NULL,
  ADD COLUMN `longitude` DOUBLE NULL,
  ADD CONSTRAINT `employer_coordinates_valid` CHECK (
    (`latitude` IS NULL AND `longitude` IS NULL) OR
    (`latitude` IS NOT NULL AND `longitude` IS NOT NULL AND
     `latitude` BETWEEN -90 AND 90 AND `longitude` BETWEEN -180 AND 180)
  );
