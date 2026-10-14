# heath.js

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![D3.js](https://img.shields.io/badge/D3.js-F9A03C?style=flat-square&logo=d3.js&logoColor=white)](https://d3js.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Rhino3dm](https://img.shields.io/badge/Rhino3dm-3D%20Geometry-801010?style=flat-square)](https://www.npmjs.com/package/rhino3dm)
[![GitHub stars](https://img.shields.io/github/stars/sawenchalmers/heath.js?style=flat-square)](https://github.com/sawenchalmers/heath.js/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/sawenchalmers/heath.js?style=flat-square)](https://github.com/sawenchalmers/heath.js/network/members)
[![GitHub issues](https://img.shields.io/github/issues/sawenchalmers/heath.js?style=flat-square)](https://github.com/sawenchalmers/heath.js/issues)
[![GitHub license](https://img.shields.io/github/license/sawenchalmers/heath.js?style=flat-square)](https://github.com/sawenchalmers/heath.js/blob/main/LICENSE)
[![GitHub last commit](https://img.shields.io/github/last-commit/sawenchalmers/heath.js?style=flat-square)](https://github.com/sawenchalmers/heath.js/commits/main)

This is a web-based 3D building design tool developed for teaching and exploring
computational sustainable design and building sustainability assessment in an urban context.


The tool allows users to create and modify simple building models, work with
surrounding context, explore different design options, and study things such as
solar position and shadows. The intention is to give students a hands-on way of
seeing how changes to a building affect the design and its surrounding environment.

The application is built with React, TypeScript and Three.js, with D3.js used for
design exploration and Rhino3dm used for working with `.3dm` geometry.


## Features

### 3D Building Design
<!-- ![alt text](image.png) -->
- Draw building footprints directly in the 3D view
- Extrude footprints into buildings
- Change the number and height of floors
- Generate and configure windows
- Change building materials and colours
- Edit buildings interactively in the scene

### 3D View
<!-- ![alt text](image-1.png) -->
- Real-time Three.js rendering
- Perspective and orthographic camera views
- Camera navigation and controls
- Optional grid
- Snap-to-grid
- Dynamic lighting and shadows
- Dark and light themes

### Context Models

Heath can be used together with surrounding building geometry to provide
context for the design.

- Import `.3dm` models
- Work with surrounding buildings
- Use grid and snapping when positioning geometry

### Sun and Shadow Analysis

The sun controller provides a simple way of exploring how the sun moves
around a building and how this affects shadows.

This is intended primarily as a visual and educational tool for investigating
orientation, massing and surrounding context.

### Design Exploration
<!-- ![alt text](image-2.png) -->
The design exploration tools allow different building configurations to be
created and compared.

Design alternatives are represented as a graph, making it possible to see how
one design develops into another and return to earlier configurations.

D3.js is used for the graph visualisation.

---

## Getting Started

### Requirements

- Node.js 16 or later
- npm or Yarn
- A modern browser with WebGL support

### Installation

```bash
git clone https://github.com/sawenchalmers/heath.js.git
cd heath.js
npm install
````

### Run the development version

```bash
npm run dev
```

The application will normally be available at:

```text
http://localhost:5173
```

### Build

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

## Controls

### Mouse

| Input             | Action                            |
| ----------------- | --------------------------------- |
| Left click        | Place a point / select an element |
| Right click       | Finish or cancel drawing          |
| Mouse wheel       | Zoom                              |
| Middle mouse drag | Pan                               |

### Drawing and building

| Shortcut   | Action                      |
| ---------- | --------------------------- |
| `D`        | Start/restart drawing mode  |
| `U`        | Undo the last point         |
| `Escape`   | Cancel the current action   |
| `Ctrl + C` | Open building configuration |

### View

| Shortcut | Action                |
| -------- | --------------------- |
| `G`      | Toggle grid           |
| `S`      | Toggle snap to grid   |
| `F`      | Toggle FPS counter    |
| `T`      | Toggle theme          |
| `R`      | Toggle sun controller |

### Files

| Shortcut   | Action               |
| ---------- | -------------------- |
| `Ctrl + S` | Save configuration   |
| `I`        | Import configuration |
| `Ctrl + E` | Export scene         |

### Other

| Shortcut               | Action              |
| ---------------------- | ------------------- |
| `Delete` / `Backspace` | Clear buildings     |
| `Ctrl + Shift + D`     | Open theme debugger |

## Creating a Building
<!-- ![alt text](image-3.png) -->
1. Select the drawing tool.
2. Click on the ground plane to place the building corners.
3. Right-click to finish the footprint.
4. Open the building configuration.
5. Adjust the number of floors, floor height, windows and materials.
6. Continue editing the building or create another design variation.

## Design Exploration

The design exploration tools are used to investigate different versions of a
building.

A design can be changed and saved as a new configuration, allowing different
options to be compared. The design graph shows the relationship between the
different configurations and can be used to return to an earlier version.

The exact performance metrics and analysis tools are still under development.

## Project Structure

The main parts of the application are organised roughly as follows:

### Core

* `ThreeJSCore` — central Three.js setup
* `CameraManager` — camera and navigation
* `SceneManager` — scene and object management
* `LightingManager` — lighting and shadows
* `EnvironmentManager` — ground, sky and environment

### Services

* `BuildingService` — building creation and modification
* `DrawingService` — drawing and geometry creation
* `WindowService` — window generation
* `DesignExplorationService` — design variations and exploration

### Components

* `SimpleBuildingCreator` — main application
* `LeftToolbar` — main design tools
* `BottomToolbar` — viewport controls
* `BuildingConfigPanel` — building settings
* `SunController` — sun and shadow controls

## Technologies

* React 18
* TypeScript
* Three.js
* D3.js
* Rhino3dm
* Tailwind CSS
* Vite
* Lucide React

## Project Team

**Alexander Hollberg**
Course Examiner / Product owner \(heath.js\)

**Toivo Säwén**
Course developer / Developer \(Heath UI, heath.js\)

**Isac Mjörnell**
Developer \(Heath UI\)

**Jieming Yan**
Testing \(Heath UI\)

**Sanjay Somanath**
Developer \(threejsEditor\)

## About Heath

Heath is being developed as part of teaching and research around sustainable
built environments and computational design.

The web tool is intended to make it easier for students to experiment with
building design and understand the connection between geometry, context and
environmental performance.

The project is under active development, so parts of the application and
documentation may change.

## Development History

heath.js builds on several earlier tools developed for teaching at Chalmers:

1. **BeDOT (2019).** The Building Early-stage Design Optimization Tool was
   developed by Chalmers and Bengt Dahlgren. It is a Python-based set of
   tools for Rhino/Grasshopper that estimates building energy performance in
   early design stages, based on ISO 13790. BeDOT was used in the course
   ARK415 at Chalmers. See
   [Energy Performance Modelling: Introducing the Building Early-stage Design Optimization Tool (BeDOT)](https://research.chalmers.se/publication/527706),
   Building Simulation 2019.
2. **ACE405_analysis_script (2023–2024).** Toivo Säwén developed this
   analysis script for use in the course ACE405 at Chalmers.
3. **Heath UI (Grasshopper plugin, 2024 onwards).** The first version of Heath
   was a Grasshopper plugin for Rhino. It provides a user interface for life
   cycle building performance assessment and is developed in
   [sawenchalmers/heath](https://github.com/sawenchalmers/heath).
4. **threejsEditor (2025–2026).** Development of a browser-based version inspired by Heath UI
   built with React, TypeScript and Three.js started in June 2025, in
   [SB-Chalmers/threejsEditor](https://github.com/SB-Chalmers/threejsEditor).
5. **heath.js (2026 onwards).** In October 2026 the web tool was forked to
   [sawenchalmers/heath.js](https://github.com/sawenchalmers/heath.js), where
   development continues. The full commit history of the web tool has been
   kept.

## License

TBA.