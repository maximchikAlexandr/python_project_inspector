/**
 * Webview bootstrap (FR-007/018). Reuses the same `App` as the browser build;
 * only the data source differs: `WebviewDataSource` talks to the extension via
 * `postMessage`, which forwards to `ppi rpc`.
 */

import { MantineProvider } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";

import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";

import { App } from "./App";
import { setDataSource, WebviewDataSource } from "./api/dataSource";

setDataSource(new WebviewDataSource());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="light">
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
