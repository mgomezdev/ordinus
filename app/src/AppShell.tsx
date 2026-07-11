import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { useCustomers } from './contexts/CustomerContext';
import { useSettings } from './contexts/SettingsContext.js';
import { SaveLayoutDialog } from './components/layouts/SaveLayoutDialog';
import { RebindImageDialog } from './components/RebindImageDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { SettingsModal } from './components/SettingsModal';
import { calculateOrderTotal } from './utils/exportOrderSummaryPdf';
import type { ServiceStatus } from './api/settings.api.js';
import './App.css';
import './AppShell.css';

function ServiceBubble({ name, status }: { name: string; status: ServiceStatus }) {
  const dot = status === 'up' ? '#22c55e' : status === 'down' ? '#ef4444' : 'var(--text-tertiary, #6b7280)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary, #9ca3af)', userSelect: 'none' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {name}
    </span>
  );
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { health } = useSettings();
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
          <button
            className="keyboard-help-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Service settings"
            title="Service settings"
            type="button"
          >
            ⚙
          </button>
        </div>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>

      {/* Status bar */}
      <div className="app-status-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 8 }}>
          <ServiceBubble name="Themis" status={health.themis} />
          <ServiceBubble name="Laminus" status={health.laminus} />
        </div>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
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

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
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
