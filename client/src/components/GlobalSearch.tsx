import { Loader, Paper, Stack, Text, TextInput, Transition } from "@mantine/core";
import { useClickOutside, useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../lib/apiClient";

interface SearchResultItem {
  id: number;
  label: string;
  subLabel?: string;
}

interface SearchResults {
  students: SearchResultItem[];
  employers: SearchResultItem[];
  programs: SearchResultItem[];
  contacts: SearchResultItem[];
}

const GROUPS: { key: keyof SearchResults; title: string }[] = [
  { key: "students", title: "Students" },
  { key: "employers", title: "Employers" },
  { key: "programs", title: "Programs" },
  { key: "contacts", title: "Contacts" },
];

/**
 * Spec §54's global search. Results are display-only for now — clicking
 * through to a record's detail page arrives in stage 6 once those routes
 * exist (see docs/TODO.md).
 */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 250);
  const [focused, setFocused] = useState(false);
  const ref = useClickOutside(() => setFocused(false));

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => apiRequest<SearchResults>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length > 0,
  });

  const showDropdown = focused && debounced.trim().length > 0;
  const totalResults = data ? GROUPS.reduce((sum, g) => sum + data[g.key].length, 0) : 0;

  return (
    <div ref={ref} style={{ position: "relative", width: 320 }}>
      <TextInput
        placeholder="Search students, employers, programs..."
        leftSection={<IconSearch size={16} />}
        rightSection={isFetching ? <Loader size="xs" /> : null}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onFocus={() => setFocused(true)}
      />
      <Transition transition="pop-top-left" mounted={showDropdown}>
        {(styles) => (
          <Paper
            withBorder
            shadow="md"
            p="sm"
            style={{
              ...styles,
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 200,
              marginTop: 4,
            }}
          >
            {totalResults === 0 && !isFetching && (
              <Text size="sm" c="dimmed">
                No matches for "{debounced}"
              </Text>
            )}
            <Stack gap="sm">
              {GROUPS.filter((g) => (data?.[g.key].length ?? 0) > 0).map((group) => (
                <div key={group.key}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
                    {group.title}
                  </Text>
                  <Stack gap={2}>
                    {data![group.key].map((item) => (
                      <Text key={item.id} size="sm">
                        {item.label}
                        {item.subLabel && (
                          <Text span c="dimmed" ml={6}>
                            {item.subLabel}
                          </Text>
                        )}
                      </Text>
                    ))}
                  </Stack>
                </div>
              ))}
            </Stack>
          </Paper>
        )}
      </Transition>
    </div>
  );
}
