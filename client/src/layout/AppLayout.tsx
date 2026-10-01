import {
  AppShell,
  Avatar,
  Burger,
  Group,
  Menu,
  NavLink,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBriefcase,
  IconCertificate,
  IconChartBar,
  IconChartPie,
  IconChevronDown,
  IconClipboardCheck,
  IconHelp,
  IconHistory,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconLogout,
  IconReportAnalytics,
  IconSchool,
  IconSettings,
  IconTrendingUp,
  IconUpload,
  IconUserCog,
  IconUsers,
} from "@tabler/icons-react";
import { ROLE_LABELS } from "@outcomelink/shared";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { GlobalSearch } from "../components/GlobalSearch";
import { NotificationBell } from "../components/NotificationBell";

interface NavItem {
  to: string;
  label: string;
  icon: typeof IconLayoutDashboard;
  /** Omit the link when this role cannot use the page. */
  show: boolean;
}

/** The authenticated app shell: header with search + user menu, navbar, content area for routed pages. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const { canAdminister, canManageStudents } = usePermissions();
  const location = useLocation();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);

  // Section headers stay off a group that has no links for this role, so an
  // auditor does not see an empty Administration heading.
  const navSections: { label: string | null; items: NavItem[] }[] = [
    {
      label: null,
      items: [
        { to: "/", label: "Dashboard", icon: IconLayoutDashboard, show: true },
        { to: "/my-programs", label: "My Programs", icon: IconLayoutGrid, show: true },
      ],
    },
    {
      label: "Students & Outcomes",
      items: [
        { to: "/programs", label: "Programs", icon: IconSchool, show: true },
        { to: "/students", label: "Students", icon: IconUsers, show: true },
        { to: "/employers", label: "Employers", icon: IconBriefcase, show: true },
        { to: "/followups", label: "Follow-Up Queue", icon: IconClipboardCheck, show: true },
        { to: "/licensure", label: "Licensure Queue", icon: IconCertificate, show: true },
      ],
    },
    {
      label: "Accreditation",
      items: [
        {
          to: "/accreditation/reporting-periods",
          label: "Accreditation",
          icon: IconChartBar,
          show: true,
        },
        { to: "/accreditation/trends", label: "Trends", icon: IconTrendingUp, show: true },
        { to: "/equity", label: "Cohort & Equity", icon: IconChartPie, show: true },
        { to: "/report-builder", label: "Report Builder", icon: IconReportAnalytics, show: true },
      ],
    },
    {
      label: "Administration",
      items: [
        { to: "/imports", label: "Bulk Import", icon: IconUpload, show: canManageStudents },
        { to: "/users", label: "Users", icon: IconUserCog, show: canAdminister },
        { to: "/jobs", label: "Job History", icon: IconHistory, show: canAdminister },
        { to: "/settings", label: "Settings", icon: IconSettings, show: canAdminister },
      ],
    },
    {
      label: null,
      items: [{ to: "/help", label: "Help", icon: IconHelp, show: true }],
    },
  ];

  async function handleLogout() {
    // RequireAuth redirects to /login once status flips; a second imperative
    // navigate here would be a competing source of truth for the destination.
    await logout();
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !navOpened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" />
            {/* Nested Link rather than Title's polymorphic `component={Link}` —
                that form only typechecks under plain `tsc --noEmit`, not this
                project's actual `tsc -b` build/typecheck (project review,
                2026-09-18): Mantine's polymorphic prop inference doesn't
                carry LinkProps through project-reference build mode, so `to`
                fails as an unknown prop there even though it "works" under a
                looser one-off tsc invocation. */}
            <Title order={4} style={{ lineHeight: 1 }}>
              <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
                OutcomeLink
              </Link>
            </Title>
          </Group>

            <GlobalSearch />

          {user && <NotificationBell />}

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

      <AppShell.Navbar p="md" aria-label="Main">
        <Stack gap="lg">
          {navSections.map((section) => {
            const items = section.items.filter((item) => item.show);
            if (items.length === 0) return null;
            return (
              <Stack key={section.label ?? items[0]!.to} gap={4}>
                {section.label && (
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" px={8}>
                    {section.label}
                  </Text>
                )}
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    component={Link}
                    to={item.to}
                    label={item.label}
                    leftSection={<item.icon size={18} />}
                    active={
                      item.to === "/"
                        ? location.pathname === "/"
                        : location.pathname.startsWith(item.to)
                    }
                    onClick={closeNav}
                  />
                ))}
              </Stack>
            );
          })}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main id="main-content" tabIndex={-1} style={{ outline: "none" }}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
