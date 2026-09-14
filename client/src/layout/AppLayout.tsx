import {
  AppShell,
  Avatar,
  Group,
  Menu,
  NavLink,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconBriefcase,
  IconChartBar,
  IconChevronDown,
  IconClipboardCheck,
  IconLogout,
  IconSchool,
  IconUsers,
} from "@tabler/icons-react";
import { ROLE_LABELS } from "@outcomelink/shared";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { GlobalSearch } from "../components/GlobalSearch";

const NAV_ITEMS = [
  { to: "/programs", label: "Programs", icon: IconSchool },
  { to: "/students", label: "Students", icon: IconUsers },
  { to: "/employers", label: "Employers", icon: IconBriefcase },
  { to: "/followups", label: "Follow-Up Queue", icon: IconClipboardCheck },
  { to: "/accreditation/reporting-periods", label: "Accreditation", icon: IconChartBar },
];

/** The authenticated app shell: header with search + user menu, navbar, content area for routed pages. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 220, breakpoint: "sm" }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>OutcomeLink</Title>

          <GlobalSearch />

          {user && (
            <Menu position="bottom-end" shadow="md" width={220}>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap={8}>
                    <Avatar radius="xl" size="sm">
                      {user.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </Avatar>
                    <div>
                      <Text size="sm" fw={500} lh={1.1}>
                        {user.name}
                      </Text>
                      <Text size="xs" c="dimmed" lh={1.1}>
                        {ROLE_LABELS[user.role]}
                      </Text>
                    </div>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={handleLogout}>
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap={4}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={location.pathname.startsWith(item.to)}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
