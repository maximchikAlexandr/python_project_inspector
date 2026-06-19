import { AppShell, Container, Tabs, Title } from "@mantine/core";

import { DashboardPage } from "./pages/DashboardPage";
import { StatusPage } from "./pages/StatusPage";
import { StructurePage } from "./pages/StructurePage";

export function App() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header px="md">
        <Title order={3} pt="sm">
          Python Project Inspector
        </Title>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Tabs defaultValue="dashboard">
            <Tabs.List mb="md">
              <Tabs.Tab value="dashboard">Dashboard</Tabs.Tab>
              <Tabs.Tab value="structure">Structure</Tabs.Tab>
              <Tabs.Tab value="status">Status</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="dashboard">
              <DashboardPage />
            </Tabs.Panel>
            <Tabs.Panel value="structure">
              <StructurePage />
            </Tabs.Panel>
            <Tabs.Panel value="status">
              <StatusPage />
            </Tabs.Panel>
          </Tabs>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
