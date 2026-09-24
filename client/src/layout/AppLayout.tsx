import {
  AppShell,
  Avatar,
  Burger,
  Group,
  Menu,
  Switch,
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
  IconChevronDown,
  IconClipboardCheck,
  IconLayoutDashboard,
  IconLogout,
  IconReportAnalytics,
  IconSchool,
  IconTrendingUp,
  IconUpload,
  IconMail,
  IconUserCog,
  IconHistory,
  IconUsers,
} from "@tabler/icons-react";
import { ROLE_LABELS } from "@outcomelink/shared";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { GlobalSearch } from "../components/GlobalSearch";
import {
  useEmailNotificationPreference,
  useEmailStatus,
  useSetEmailNotificationPreference,
} from "../api/emailDeliveries";
import { type Permissions, usePermissions } from "../auth/usePermissions";
import { NotificationBell } from "../components/NotificationBell";

interface NavItem {
  to: string;
  label: string;
  icon: typeof IconLayoutDashboard;
  /** Permission the destination page needs; the link is hidden without it. */
  requires?: keyof Permissions;
}

// Grouped per the user's own note in docs/TODO.md ("category/section
// division in the left menu to help organize") — a flat list of 11 items
// had grown hard to scan. `label: null` renders with no section header
// (just Dashboard, since it isn't really a category of its own).
const NAV_SECTIONS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ to: "/", label: "Dashboard", icon: IconLayoutDashboard }],
  },
  {
    label: "Students & Outcomes",
    items: [
      { to: "/programs", label: "Programs", icon: IconSchool },
      { to: "/students", label: "Students", icon: IconUsers },
      { to: "/employers", label: "Employers", icon: IconBriefcase },
      { to: "/followups", label: "Follow-Up Queue", icon: IconClipboardCheck },
      { to: "/licensure", label: "Licensure Queue", icon: IconCertificate },
    ],
  },
  {
    label: "Accreditation",
    items: [
      { to: "/accreditation/reporting-periods", label: "Accreditation", icon: IconChartBar },
      { to: "/accreditation/trends", label: "Trends", icon: IconTrendingUp },
      { to: "/report-builder", label: "Report Builder", icon: IconReportAnalytics },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/imports", label: "Bulk Import", icon: IconUpload, requires: "canManageStudents" },
      { to: "/users", label: "Users", icon: IconUserCog, requires: "canAdminister" },
      { to: "/jobs", label: "Job History", icon: IconHistory, requires: "canAdminister" },
    ],
  },
];

/** The authenticated app shell: header with search + user menu, navbar, content area for routed pages. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const permissions = usePermissions();
  // Only offered when the server can actually send email.
  const { data: emailStatus } = useEmailStatus();
  const { data: emailPreference } = useEmailNotificationPreference();
  const setEmailPreference = useSetEmailNotificationPreference();
  const location = useLocation();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);

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
                {emailStatus?.configured && emailPreference && (
                  <Menu.Item
                    closeMenuOnClick={false}
                    leftSection={<IconMail size={14} />}
                    rightSection={
                      <Switch
                        size="xs"
                        checked={emailPreference.emailNotifications}
                        readOnly
                        tabIndex={-1}
                      />
                    }
                    onClick={() => setEmailPreference.mutate(!emailPreference.emailNotifications)}
                  >
                    Email notifications
                  </Menu.Item>
                )}
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={handleLogout}>
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="lg">
          {NAV_SECTIONS.map((section) => ({
            ...section,
            items: section.items.filter((item) => !item.requires || permissions[item.requires]),
          }))
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <Stack key={section.label ?? "top"} gap={4}>
                {section.label && (
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" px={8}>
                    {section.label}
                  </Text>
                )}
                {section.items.map((item) => (
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
            ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
