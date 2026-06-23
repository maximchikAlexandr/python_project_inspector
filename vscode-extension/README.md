# Python Project Inspector for VS Code

Thin bridge that runs the `ppi` CLI from inside VS Code and renders the existing
dashboard in a Webview panel.

## Build

```sh
npm install
npm run build      # bundles the extension host to dist/extension.js
```

Build the dashboard webview bundle from the repo root:

```sh
cd ../frontend && npm install && npm run build:webview
```

## Package & install locally

```sh
npm run package    # produces ppi-vscode-0.1.0.vsix
code --install-extension ./ppi-vscode-0.1.0.vsix
```

## Commands

- `PPI: Analyze Project` — runs `ppi analyze --json` and shows live progress.
- `PPI: Open Dashboard` — opens the dashboard in a Webview panel.
- `PPI: Cancel Analysis` — terminates the running analysis.

## Settings

- `ppi.profile` — `odoo` (default; `python` is reserved until CLI support lands).
- `ppi.analysisDir` — custom analysis/results directory.
- `ppi.pythonExecutable` — interpreter to run `ppi` as `<exe> -m ppi`.
- `ppi.cliPath` — explicit path to the `ppi` console script.
