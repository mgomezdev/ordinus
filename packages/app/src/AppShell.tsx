import { Outlet, NavLink, useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { SaveLayoutDialog } from './components/layouts/SaveLayoutDialog';
import { RebindImageDialog } from './components/RebindImageDialog';
import { AdminSubmissionsDialog } from './components/admin/AdminSubmissionsDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { WalkthroughOverlay } from './components/WalkthroughOverlay';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { UserMenu } from './components/auth/UserMenu';
import { calculateOrderTotal } from './utils/exportOrderSummaryPdf';
import './App.css';
import './AppShell.css';

// Inner shell reads from context (must be inside WorkspaceProvider)
function AppShellInner() {
  const {
    isAuthenticated,
    isAdmin,
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
    isWalkthroughActive,
    walkthroughCurrentStep,
    walkthroughSteps,
    nextStep,
    dismissTour,
  } = useWorkspace();

  const [searchParams, setSearchParams] = useSearchParams();

  // authOpen is derived directly from the URL — no state sync needed
  const authOpen = searchParams.get('authRequired') === '1';
  const handleAuthClosed = useCallback(
    () => setSearchParams({}, { replace: true }),
    [setSearchParams],
  );

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
          {isAuthenticated && (
            <NavLink
              to="/configs"
              className={({ isActive }) => `nav-tab${isActive ? ' nav-tab-active' : ''}`}
            >
              Saved Configs
            </NavLink>
          )}
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
          <UserMenu openAuth={authOpen} onAuthClosed={handleAuthClosed} />
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
          {' \u00b7 '}{gridResult.gridX}&times;{gridResult.gridY} grid
        </div>
        <div className="status-spacer" />
        <div className="status-cost">
          <span className="status-cost-label">Est.</span>
          <strong>{costLabel}</strong>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="admin-badge"
            onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'admin' })}
          >
            Admin
          </button>
        )}
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

      {isAdmin && (
        <AdminSubmissionsDialog
          isOpen={dialogs.admin}
          onClose={() => dialogDispatch({ type: 'CLOSE', dialog: 'admin' })}
          onLoad={handleLoadLayout}
          hasItems={placedItems.length > 0}
        />
      )}

      <ConfirmDialog {...confirmDialogProps} />

      <WalkthroughOverlay
        isActive={isWalkthroughActive}
        currentStep={walkthroughCurrentStep}
        steps={walkthroughSteps}
        onNext={nextStep}
        onDismiss={dismissTour}
      />
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
