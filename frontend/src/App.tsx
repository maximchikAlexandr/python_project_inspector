import { AppShell, Container, Tabs, Title } from "@mantine/core";

import { AppTab, NavigationProvider, useAppNavigation } from "./navigation";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SnapshotPage } from "./pages/SnapshotPage";
import { StatusPage } from "./pages/StatusPage";
import { StructurePage } from "./pages/StructurePage";
import { t } from "./i18n";

function AppTabs() {
  const { activeTab, setActiveTab } = useAppNavigation();

  return (
    <Tabs value={activeTab} onChange={(value) => setActiveTab((value ?? "snapshot") as AppTab)}>
      <Tabs.List mb="md">
        <Tabs.Tab value="snapshot">{t("tabs.report", "Report")}</Tabs.Tab>
        <Tabs.Tab value="dashboard">{t("tabs.dashboard", "Dashboard")}</Tabs.Tab>
        <Tabs.Tab value="structure">{t("tabs.structure", "Structure")}</Tabs.Tab>
        <Tabs.Tab value="analytics">{t("tabs.analytics", "Analytics")}</Tabs.Tab>
        <Tabs.Tab value="status">{t("tabs.status", "Status")}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="snapshot" keepMounted={false}>
        <SnapshotPage />
      </Tabs.Panel>
      <Tabs.Panel value="dashboard" keepMounted={false}>
        <DashboardPage />
      </Tabs.Panel>
      <Tabs.Panel value="structure" keepMounted={false}>
        <StructurePage />
      </Tabs.Panel>
      <Tabs.Panel value="analytics" keepMounted={false}>
        <AnalyticsPage />
      </Tabs.Panel>
      <Tabs.Panel value="status" keepMounted={false}>
        <StatusPage />
      </Tabs.Panel>
    </Tabs>
  );
}

export function App() {
  return (
    <NavigationProvider>
      <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header px="md">
          <Title order={3} pt="sm">
            Python Project Inspector
          </Title>
        </AppShell.Header>
        <AppShell.Main>
          <Container size="xl">
            <AppTabs />
          </Container>
        </AppShell.Main>
      </AppShell>
    </NavigationProvider>
  );
}
