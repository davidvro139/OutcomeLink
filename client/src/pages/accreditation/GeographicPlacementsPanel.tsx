import { Alert, Anchor, Badge, Button, Group, Loader, Paper, Stack, Table, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { type PlacementLocation, useGeographicPlacementsReport } from "../../api/reports";

function PlacementMap({ locations }: { locations: PlacementLocation[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { scrollWheelZoom: false }).setView([39, -98], 4);
    // Leaflet API: https://leafletjs.com/reference.html
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on("tileerror", () => setTileError(true)).addTo(map);
    const points: L.LatLngTuple[] = [];
    for (const location of locations) {
      if (location.latitude === null || location.longitude === null) continue;
      const point: L.LatLngTuple = [location.latitude, location.longitude];
      points.push(point);
      // DOM text avoids interpreting employer names as HTML in Leaflet popups.
      const label = document.createElement("span");
      label.textContent = `${location.city}, ${location.state}: ${location.placementCount} placement(s) across ${location.employers.length} employer(s)`;
      L.circleMarker(point, {
        radius: Math.min(28, 6 + Math.sqrt(location.placementCount) * 3),
        color: "#1971c2", fillOpacity: 0.65,
      }).bindPopup(label).addTo(map);
    }
    if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 11 });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.remove(); };
  }, [locations]);
  return <Stack gap="xs">
    {tileError && <Alert color="yellow">The background map could not load. Placement counts remain available below.</Alert>}
    <div ref={container} aria-label="Placements by city map" role="region"
      style={{ height: 420, width: "100%", zIndex: 0, borderRadius: 8 }} />
    <Text size="xs" c="dimmed">Larger circles indicate more placement records. Locations are approximate city points from the <Anchor href="https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html" target="_blank" rel="noreferrer">US Census Gazetteer</Anchor>.</Text>
  </Stack>;
}

export function GeographicPlacementsPanel({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data, isLoading, error, refetch } = useGeographicPlacementsReport(reportingPeriodId);
  if (isLoading) return <Loader />;
  if (error) return <Alert color="red" title="Unable to load geographic placements">
    <Text>{error.message}</Text><Button variant="light" onClick={() => void refetch()}>Retry</Button>
  </Alert>;
  if (!data) return null;
  return <Stack gap="md">
    <Text size="sm" c="dimmed">
      Employment records starting within this reporting period, grouped by employers' current city and state.
      Map points represent cities, not exact work sites. Counts represent jobs, not unique graduates. Only records for students
      you can access are included; a job is not attributed to a particular program.
    </Text>
    <Group grow>
      {[["Placements", data.totalPlacements], ["Mapped", data.mappedPlacements], ["Unmapped", data.unmappedPlacements]].map(([label, value]) =>
        <Paper key={label} withBorder p="md"><Text size="sm">{label}</Text><Text fw={700} size="xl">{value}</Text></Paper>)}
    </Group>
    {data.totalPlacements === 0 ? <Text c="dimmed">No accessible employment records start within this period.</Text> : <>
      {data.mappedPlacements > 0 ? <PlacementMap locations={data.locations} /> :
        <Alert color="blue">No city/state locations could be matched for these placements. Staff who manage employers can update city and state from an employer's detail page.</Alert>}
      {data.unmappedPlacements > 0 && <Text size="sm" c="dimmed">Unmapped placements have a missing, unknown, or ambiguous city/state. They are included in the totals and table below.</Text>}
      <Table.ScrollContainer minWidth={500}>
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Employers</Table.Th><Table.Th>City / state</Table.Th><Table.Th>Placements</Table.Th><Table.Th>Map location</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{data.locations.map((row) => <Table.Tr key={row.key}>
            <Table.Td><Stack gap={2}>{row.employers.map((employer) => <Anchor key={employer.id} component={Link} to={`/employers/${employer.id}`}>{employer.name} ({employer.placementCount})</Anchor>)}</Stack></Table.Td>
            <Table.Td>{[row.city, row.state].filter(Boolean).join(", ") || "Not recorded"}</Table.Td>
            <Table.Td>{row.placementCount}</Table.Td>
            <Table.Td><Badge color={row.latitude !== null && row.longitude !== null ? "teal" : "gray"}>
              {row.latitude !== null && row.longitude !== null ? "City matched" : "Unmapped"}
            </Badge></Table.Td>
          </Table.Tr>)}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>}
  </Stack>;
}
