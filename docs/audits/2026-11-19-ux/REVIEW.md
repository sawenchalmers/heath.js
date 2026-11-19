# heath.js UX review, 19 November 2026 (0.2.6, dev server)

Done by Claude (AI) at the request of sawenchalmers. Method: Playwright (Chromium, real GPU via ANGLE/D3D11) driving the dev server at 1440×900, plus 1024×768, 768×700 and 400×800. Walked through as a first-time student: first view, selecting a building, editing, dragging, drawing, sun, running studies against a local engine, design history, the Weather tab. Screenshots are in this folder; numbers in the Evidence columns refer to their file names (e.g. 05 is `05-sun.jpg`). `01-software-rendering.jpg` is the same first view without a usable GPU. Screenshots are scaled to 1024 px wide.

Not covered: import/export, Rhino context, reshape/rotate, the results dialog, dark theme, screen readers, long sessions.

## New findings

| # | Finding | Evidence | Weight |
|---|---|---|---|
| N1 | **Orbiting is right-drag only.** Left-drag on empty ground or on a building does nothing; nothing on screen says how to rotate the view, and the README's mouse table lists pan and zoom but not orbit. (Right-drag orbit matches Rhino, but a first-time user will try left-drag.) | 06, 07; `CameraManager.ts:132` | High |
| N2 | **The default sun is "today, 14:00".** In November–February the sun is 5–7° high, so the scene opens dark with long shadows; the course runs in winter. | 01, 05 (elevation 6.6°) | Medium |
| N3 | **The sun is always computed for Stockholm**, while the Weather tab defaults to Gothenburg and offers cities up to Kiruna (68°N); choosing a city doesn't move the sun. | `sunPosition.ts:21`, `SunController.tsx:39` | Medium (bug) |
| N4 | **The sun dialog is modal and centred over the model**, blurring it, so shadows can't be watched while adjusting the time. | 05 | Medium |
| N5 | **The run's name didn't show up:** after "Save and run" with "Option A", the design history still shows one node, "Baseline", with the results. To verify whether the name is dropped for an unchanged design. | 11, 13 | Medium (verify) |
| N6 | **The Weather tab looks like another app:** dark, gradients and emoji headings, against the Model tab's restrained light UI. | 15 | Low–medium |
| N7 | **Energy is shown as "273 kWh"** in the history node: period and normalisation (per year? per m²?) unclear, which matters for comparing options. | 11 | Low–medium |
| N8 | **"Centroid X / Z"** in the building panel: Z is 3D-engine jargon; architects expect X/Y or east/north. | 02 | Low |
| N9 | **The starter building is called "Welcome Room (10m x 5m)", "a starter room with 6 storeys"**: a six-storey building called a room. | 02 | Low |
| N10 | **The design history card** (bottom left) shows no results after a run, and the full dialog opens with nothing selected. | 11, 13 | Low |
| N11 | **Phone width (400 px) works** without horizontal scrolling; only the header's version text wraps over three lines. | 18-400-select | Low |

## Existing issues confirmed

- **#61** The weather tour dialog reappears every time the tab opens (16).
- **#62** Floors sit in the collapsed Form & Massing section; once open, floors are a slider for a small integer (03).
- **#63** Dragging a selected building does nothing without the Move tool (04), and see N1: no drag does anything.
- **#41** Escape closes neither the Run studies dialog nor the design history, and Tab moves focus out of the Run studies dialog to the tabs behind it.
- **#5** The design history starts fresh each session (`DesignExplorationService`: "start fresh each session").

## What works well

- Selecting a building gives a clear blue outline and a tidy panel with the key figures (GFA, height, footprint, floors).
- Drawing switches to a 2D plan with snapping, dimensions and a "Click to place the first point" hint.
- A run shows a clear progress card; daylight results appear on the floors with a legend and a 2% target mark.
- No console errors or warnings in any session; no horizontal overflow at any tested width.

## Second round: more flows, and the earlier reviews revisited

Covered this time: deleting one of two buildings and undoing it, form labels and text sizes, a second real run (on the local engine) with the results dialog, editing after a run, export, import (including an invalid file), and where locations come from.

### More new findings

| # | Finding | Evidence | Weight |
|---|---|---|---|
| N12 | **Three different locations.** The Weather tab's city (default Gothenburg, selectable up to Kiruna) feeds neither the sun (always Stockholm, N3) nor the simulations, which use the engine's default location (`gothenburg`, or `VITE_DAYLIGHT_API_LOCATION`). Picking Kiruna on the Weather tab changes nothing in the model or the results, without saying so. | `SimpleBuildingCreator.tsx:287–288`; engine `/v1/locations` | High |
| N13 | **Energy units differ between views:** the results dialog says 272.6 kWh/m²/yr, the design history node "273 kWh" (N7). | 24, 11 | Medium |
| N14 | **Results disappear silently after an edit.** Correctly hidden once the model changes, but the only trace is "No current results. Run studies to view analysis."; nothing says they were made out of date by the edit, and "View results" still looks enabled. | 25 | Low–medium |
| N15 | **The description doesn't follow the model:** after changing 6 to 8 floors it still says "starter room with 6 storeys" (see N9). | 25 | Low |
| N16 | **Import takes JSON only** (an exported configuration or building objects); there is no Rhino/.3dm import of buildings (#67). The error for a wrong file is technical: "Expected an array of buildings or an object with a buildings property." | 27, 28 | Medium (with #67) |
| N17 | **Export saves buildings only** (`version`, `createdAt`, `buildings`): design options, names and results aren't included, so a session's comparisons can't be kept (#5). | export file | Medium |
| N18 | **Text is mostly 10–11 px** (on the model screen: 25 elements at 11 px, 5 at 10 px, against 9 at 12 px and 7 at 13–14 px), as the September review also noted. | computed styles | Low–medium |

### The earlier reviews, item by item

From the September "premium" review (`docs/audits/2026-09-06-premium/REVIEW.md`), its follow-up (`2026-09-06-seamless-editor`), and the backlog `docs/UX_IMPROVEMENTS.md`:

| Earlier finding | Now |
|---|---|
| Edit backdrop blocks the viewport and cancels edits | **Fixed** (docked panel, no backdrop) |
| Delete clears the whole workspace; no undo | **Fixed**: Delete removes the selected building; Ctrl+Z brings it back |
| Results not marked stale after edits | **Fixed**, though silently (N14) |
| Rapid polygon clicks end drawing; no Rectangle / Finish | **Fixed** (Polygon, Rectangle, Finish; 2D plan while drawing) |
| Black ambient-occlusion patches | **Still on the software renderer** (01-software-rendering); fine on the real GPU. Matters for machines without a usable GPU |
| Run dialog: focus escapes, Escape doesn't close | **Still open** (#41) |
| Saving is tied to running studies | **Still open** ("Save and run" only; #28) |
| Design history: nothing selected on open, not persisted | **Still open** (N10, #5) |
| Numeric inputs beside sliders (floors, height, WWR, shading) | **Still open**: sliders only (#62) |
| Overhang depth active while the overhang is off | **Still open**: the depth slider stays enabled |
| Form & Massing should open first | **Still open** (#62, #36) |
| Text 10–11 px too small | **Still open** (N18) |
| Emoji tab navigation | **Still open** (N6) |
| Mini history card always visible | **Still open** (N10) |
| 64 TypeScript errors | Tracked in #26 |
| Backlog items 1–8 (context bar, action grouping, run stepper, result source badge, reinstate summary, history details, run status, quality modes) | Not checked one by one; the context bar (1) and result source badge (4) would address N5 and N14 |

## Outcome

Gone through finding by finding with sawenchalmers on 2026-11-19:

| Finding | Became |
|---|---|
| N1 | #74 Rhino-like navigation, made discoverable; #75 switchable navigation mode; #76 gumball; fully customisable navigation in #90 |
| N2, N3, N4 | #77 Sun: the chosen location, the current time, the model kept visible |
| N5 | #43 widened: run names, and what the baseline and design alternatives are |
| N6 | #79 Revise the Weather tab to match the main viewport |
| N7, N13 | #80 Review all units shown |
| N8 | #81 Plan coordinates X and Y; the convention as a setting in #90 |
| N9, N15 | #82 Improve the welcome building |
| N10 | To investigate; no issue yet |
| N11 | Idea in #92: a mobile-compatible workflow |
| N12 | #78 Simulations use the chosen location |
| N14 | #83 Results don't disappear silently after edits |
| N16 | #84 Clear feedback for incompatible import files |
| N17 | #85 A data format for saving a session |
| N18 | Text size in #90 (current size stays the default) and #91 (first-time setup); asked of the testing group (#57) |
| Earlier findings | #86 Tab behaviour in all dialogs; #87 Form & Massing section; #88 Façade section; #89 rendering check |

Found during the walkthrough by sawenchalmers: #73 (closing the progress card leaves Run studies unresponsive).
