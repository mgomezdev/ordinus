import { Outlet, NavLink } from 'react-router-dom';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { useCustomers } from './contexts/CustomerContext';
import { SaveLayoutDialog } from './components/layouts/SaveLayoutDialog';
import { RebindImageDialog } from './components/RebindImageDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { calculateOrderTotal } from './utils/exportOrderSummaryPdf';
import './App.css';
import './AppShell.css';

function CustomerSelector() {
  const { customers, selectedCustomer, setSelectedCustomerId } = useCustomers();

  return (
    <div className="customer-selector">
      <label htmlFor="customer-select" className="customer-selector-label">
        Customer:
      </label>
      <select
        id="customer-select"
        className="customer-selector-select"
        value={selectedCustomer?.id ?? ''}
        onChange={(e) => setSelectedCustomerId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— None —</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}

// Inner shell reads from context (must be inside WorkspaceProvider)
function AppShellInner() {
  const {
    layoutMeta,
    dialogs,
    dialogDispatch,
    closeRebind,
    handleRebindSelect,
    confirmDialogProps,
    bomItems,
    gridResult,
    placedItems,
    refImagePlacements,
    drawerWidth,
    drawerDepth,
    spacerConfig,
    handleSaveComplete,
    handleLoadLayout,
  } = useWorkspace();

  const totalPlaced = bomItems.reduce((s, i) => s + i.quantity, 0);
  const capacity = gridResult.gridX * gridResult.gridY;
  const pct = capacity > 0 ? Math.min(100, Math.round((totalPlaced / capacity) * 100)) : 0;

  const { total, hasTbd } = calculateOrderTotal(bomItems, true);
  const costLabel = hasTbd ? `$${total.toFixed(2)} + TBD` : `$${total.toFixed(2)}`;

  return (
    <div className="app">
      <h1 className="sr-only">Gridfinity Bin Customizer</h1>

      {/* Nav bar */}
      <nav className="app-nav">
        <div className="app-logo">
          <div className="app-logo-icon">G</div>
          <div>
            <div className="app-logo-name">GridfinityPlanner</div>
            <div className="app-logo-sub">Precision Architect</div>
          </div>
        </div>

        <div className="nav-tabs">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-tab${isActive ? ' nav-tab-active' : ''}`}
          >
            Workspace
          </NavLink>
          <NavLink
            to="/configs"
            className={({ isActive }) => `nav-tab${isActive ? ' nav-tab-active' : ''}`}
          >
            Saved Configs
          </NavLink>
          <NavLink
            to="/order"
            className={({ isActive }) => `nav-tab${isActive ? ' nav-tab-active' : ''}`}
          >
            BOM
          </NavLink>
        </div>

        <div className="nav-end">
          {layoutMeta.id && (
            <div className="nav-layout-info">
              {layoutMeta.owner && (
                <span className="nav-layout-owner">{layoutMeta.owner} &mdash; </span>
              )}
              <span className="nav-layout-name">{layoutMeta.name}</span>
            </div>
          )}
          <CustomerSelector />
          <button
            className="keyboard-help-button"
            onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'keyboard' })}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            type="button"
          >
            ?
          </button>
        </div>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>

      {/* Status bar */}
      <div className="app-status-bar">
        <div className="status-capacity">
          <span className="status-dot" />
          <span className="status-cap-label">
            Capacity: <strong>{pct}%</strong>
          </span>
          <div className="status-bar-track">
            <div className="status-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="status-spacer" />
        <div className="status-count">
          <strong>{totalPlaced} item{totalPlaced !== 1 ? 's' : ''}</strong>
          {' · '}{gridResult.gridX}&times;{gridResult.gridY} grid
        </div>
        <div className="status-spacer" />
        <div className="status-cost">
          <span className="status-cost-label">Est.</span>
          <strong>{costLabel}</strong>
        </div>
      </div>

      {/* Global dialogs */}
      <KeyboardShortcutsHelp
        isOpen={dialogs.keyboard}
        onClose={() => dialogDispatch({ type: 'CLOSE', dialog: 'keyboard' })}
      />

      <SaveLayoutDialog
        isOpen={dialogs.save}
        onClose={() => dialogDispatch({ type: 'CLOSE', dialog: 'save' })}
        gridX={gridResult.gridX}
        gridY={gridResult.gridY}
        widthMm={drawerWidth}
        depthMm={drawerDepth}
        spacerConfig={spacerConfig}
        placedItems={placedItems}
        refImagePlacements={refImagePlacements}
        currentLayoutId={layoutMeta.id}
        currentLayoutName={layoutMeta.name}
        currentLayoutDescription={layoutMeta.description}
        onSaveComplete={handleSaveComplete}
      />

      <RebindImageDialog
        isOpen={dialogs.rebind}
        onClose={closeRebind}
        onSelect={handleRebindSelect}
      />

      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
}

export function AppShell() {
  return (
    <WorkspaceProvider>
      <AppShellInner />
    </WorkspaceProvider>
  );
}
