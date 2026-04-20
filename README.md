# Gridfinity Customizer

A web-based visual design tool for creating custom Gridfinity modular storage layouts. Plan your 3D-printable storage solutions with drag-and-drop simplicity, reference images for precise fitting, and automatic bill of materials generation.

## What is Gridfinity?

Gridfinity is a modular storage system designed for 3D printing, using standardized base units to create customizable organizational solutions. This customizer helps you plan layouts before printing.

## ✨ Features

### Grid Design
- **Configurable grid dimensions** - Set width and height in Gridfinity units
- **Drag-and-drop placement** - Add items from library to grid
- **Move and rotate items** - Reposition and orient items with mouse or keyboard
- **Collision detection** - Visual feedback prevents overlapping items
- **Unit conversion** - Switch between millimeters and inches
- **Read-only canvas** - Saved/submitted layouts are locked against accidental edits

### Library & Categories
- **Pre-built library** - Common Gridfinity items (bins, dividers, organizers, utensil trays)
- **Category filtering** - Show/hide items by category
- **User STL uploads** - Upload your own STL files; they appear in the library after processing

### Save & Submit Workflow
- **Save layouts** - Save named layouts as drafts with Save Changes / Save as New
- **Build from This** - Clone a submitted layout to iterate on it
- **Submit for printing** - Submit a layout for fulfillment; withdraw if needed
- **Saved Configs page** - Browse, manage, and load your saved layouts

### Reference Images
- **Image upload** - Import reference photos/diagrams
- **Position & scale** - Align images with grid for precise layouts
- **Opacity control** - Adjust transparency for overlay planning
- **Lock images** - Prevent accidental movement
- **Multiple images** - Support for multiple reference layers

### Item Management
- **Inline controls** - Delete, rotate, and modify items directly on grid
- **Keyboard shortcuts** - Quick actions with keyboard (see table below)
- **Multi-select** - Select multiple items for bulk move, rotate, copy, paste, delete
- **Visual feedback** - Color-coded valid/invalid placement

### Export & Planning
- **Order Summary** - Bill of materials with quantities and cost estimate
- **PDF export** - Export order summary as a PDF

### Developer Features
- **E2E testing** - 135+ Playwright tests for critical workflows
- **Unit testing** - 1362 tests covering hooks, components, utilities, and server routes

## 🚀 Quick Start

### Local Development

```bash
npm install
npm run build --workspace=packages/shared  # required before first server start
```

Then start the backend and frontend in separate terminals:

**Terminal 1 — backend (port 3001):**
```bash
npm run server:dev
```

**Terminal 2 — frontend (port 5173):**
```bash
npm run dev
```

Visit `http://localhost:5173`

The backend auto-runs database migrations and seeds library data on startup. Default dev accounts are created: `admin@gridfinity.local` and `test@gridfinity.local`.

> **Note:** You only need to build the shared package once (or after changes to `packages/shared`).

See [CLAUDE.md](CLAUDE.md) for detailed development setup and commands.

## 📖 Usage Guide

### Basic Workflow

1. **Set Grid Dimensions**
   - Adjust width and height using dimension controls
   - Each unit = 42mm (standard Gridfinity base)

2. **Browse Library**
   - Filter by category (bins, utensil trays, labeled, width-based)
   - View item dimensions and preview images

3. **Add Items to Grid**
   - Drag items from library onto grid
   - Green outline = valid placement
   - Red outline = collision detected

4. **Position Items**
   - Click and drag to move
   - Use rotate button or keyboard to change orientation
   - Delete with inline button or `Delete` key

5. **Use Reference Images** (Optional)
   - Upload photo/diagram with "Upload Reference Image"
   - Position and scale image to match real-world measurements
   - Adjust opacity to see through to grid
   - Lock image when positioned correctly

6. **Save Your Layout**
   - Click **Save as New** to name and save a draft
   - Use **Save Changes** to update an existing layout
   - Use **Build from This** to clone a submitted layout and iterate

7. **View Order Summary**
   - Navigate to the Order Summary page for a full bill of materials
   - Shows quantities and cost estimate; exportable as PDF

8. **Clear & Start Over**
   - Use the "Clear All" button to remove all placed items (keeps grid settings)

### Tips

- **Reference Images**: Perfect for designing storage around existing tools/objects
- **Categories**: Use category filters to quickly find items of specific types or sizes
- **Keyboard Shortcuts**: Speed up workflow with the shortcuts below
- **STL Uploads**: Upload your own STL files to add custom items to your library

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Remove selected item(s) or reference image |
| `R` | Rotate selected item(s) CW (`Shift+R` = CCW) |
| `Ctrl+D` | Duplicate selected item |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste selected items |
| `Ctrl+A` | Select all items |
| `Escape` | Deselect all |
| `V` | Toggle reference image view mode (ortho / perspective) |
| `L` | Lock / unlock selected reference image |
| `+` / `-` | Zoom in / out |
| `Click + Drag` | Move item |

## 🔧 Development

This project uses React 19 + TypeScript + Vite.

For detailed development guidelines, coding standards, and architecture:
👉 See [CLAUDE.md](CLAUDE.md)

**Quick Commands:**
```bash
npm run build --workspace=packages/shared  # build shared package (required first)
npm run dev              # Start frontend dev server (port 5173)
npm run server:dev       # Start backend dev server (port 3001)
npm test                 # Run unit tests (watch mode)
npm run test:run         # Run all unit tests once
npm run test:e2e         # Run E2E tests (Playwright)
npm run build            # Production build (all packages)
npm run lint             # Lint codebase
```

## 🚀 Deployment

The application is deployed via Docker Compose with a separate frontend (Nginx) and backend (Node) container.

### Docker Compose

```bash
docker compose -f infra/docker-compose.yml up --build -d
```

The frontend is served on port **32888** (`http://localhost:32888`). The backend runs internally on port 3001 and is proxied through Nginx.

To rebuild from scratch (e.g. after dependency changes):

```bash
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml build --no-cache
docker compose -f infra/docker-compose.yml up -d
```

## 📝 License

This project is open source. License details to be added.

## 🤝 Contributing

Contributions welcome! Please see [CLAUDE.md](CLAUDE.md) for:
- Development setup and commands
- Coding standards (TypeScript, React, testing)
- Git workflow (Gitflow branching strategy)
- Pull request guidelines

For bug reports and feature requests, please open an issue.
