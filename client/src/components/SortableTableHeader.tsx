import { Group, Text, UnstyledButton } from "@mantine/core";
import { getSortIcon, getNextSortDirection, type SortDirection } from "../lib/sorting";

interface SortableTableHeaderProps {
  field: string;
  label: string;
  sortField: string | null;
  sortDirection: SortDirection;
  onSort: (field: string, direction: SortDirection) => void;
  align?: "left" | "right";
}

export function SortableTableHeader({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
  align = "left",
}: SortableTableHeaderProps) {
  const handleClick = () => {
    const newDirection = getNextSortDirection(sortField, field, sortDirection);
    onSort(field, newDirection);
  };

  return (
    <UnstyledButton
      onClick={handleClick}
      style={{ cursor: "pointer", width: "100%" }}
      ta={align}
    >
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={sortField === field ? 600 : 400}>
          {label}
        </Text>
        {getSortIcon(field, sortField, sortDirection)}
      </Group>
    </UnstyledButton>
  );
}
