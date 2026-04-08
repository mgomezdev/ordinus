import { Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { exportOrderSummaryPdf, calculateOrderTotal } from '../utils/exportOrderSummaryPdf';
import { formatCustomizationDescription } from '../utils/customizationDescription';
import './OrderSummaryPage.css';

export function OrderSummaryPage() {
  const navigate = useNavigate();
  const {
    bomItems,
    gridResult,
    spacerConfig,
    unitSystem,
    layoutMeta,
    isReadOnly,
    drawerWidth,
    drawerDepth,
    submitLayoutMutation,
    handleSubmitLayout,
    dialogDispatch,
    exportPdfError,
    setExportPdfError,
  } = useWorkspace();

  const dimLabel = unitSystem === 'imperial'
    ? `${(drawerWidth / 25.4).toFixed(2)}" × ${(drawerDepth / 25.4).toFixed(2)}"`
    : `${Math.round(drawerWidth)}mm × ${Math.round(drawerDepth)}mm`;

  const totalPlaced = bomItems.reduce((s, i) => s + i.quantity, 0);
  const capacity = gridResult.gridX * gridResult.gridY;
  const pct = capacity > 0 ? Math.min(100, Math.round((totalPlaced / capacity) * 100)) : 0;
  const { total, hasTbd } = calculateOrderTotal(bomItems, true);
  const hasNoId = !layoutMeta.id;

  const handleDownloadPdf = async () => {
    setExportPdfError(null);
    await exportOrderSummaryPdf(
      bomItems,
      { gridResult, spacerConfig, unitSystem, layoutName: layoutMeta.name },
      () => setExportPdfError('PDF export failed. Please try again.'),
    );
  };

  const handleSubmit = async () => {
    try {
      await handleSubmitLayout();
      navigate('/configs');
    } catch {
      // error handled by mutation
    }
  };

  const handleSaveAndExit = () => {
    dialogDispatch({ type: 'OPEN', dialog: 'save' });
  };

  return (
    <div className="order-summary-page">
      <div className="order-summary-main">
        <div className="order-breadcrumb">
          <Link to="/">Workspace</Link>
          <span className="order-breadcrumb-sep">›</span>
          <span>Order Summary</span>
        </div>

        <h2 className="order-summary-title">Order Summary &amp; BOM</h2>
        <p className="order-summary-subtitle">
          Review your layout before submitting. Items marked &quot;Price TBD&quot; will receive a confirmed quote before
          any build or shipment.
        </p>

        {hasNoId && (
          <div className="order-tbd-note">
            Save your layout first before submitting.{' '}
            <button
              className="order-panel-btn order-save-now-btn"
              onClick={handleSaveAndExit}
              type="button"
            >
              Save Now
            </button>
          </div>
        )}

        {totalPlaced === 0 ? (
          <div className="order-empty">
            <p>No items placed yet.</p>
            <Link to="/">Return to workspace to add items.</Link>
          </div>
        ) : (
          <table className="order-bom-table">
            <thead>
              <tr>
                <th>Component Item</th>
                <th>Size</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {bomItems.map(item => {
                const customizationDesc = item.customization
                  ? formatCustomizationDescription(item.customization)
                  : '';
                return (
                <tr
                  key={`${item.itemId}-${item.customization ? JSON.stringify(item.customization) : ''}`}
                >
                  <td>
                    <div className="order-bom-item-cell">
                      <div className="order-bom-color" style={{ backgroundColor: item.color }} />
                      <div>
                        <div className="order-bom-name">{item.name}</div>
                        {customizationDesc && <div className="order-bom-description">{customizationDesc}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="order-bom-size">
                    {item.widthUnits}&times;{item.heightUnits}
                  </td>
                  <td>{item.quantity}</td>
                  <td>
                    {item.price !== undefined ? (
                      `$${item.price.toFixed(2)}`
                    ) : (
                      <span className="price-tbd-chip">Price TBD</span>
                    )}
                  </td>
                  <td>
                    {item.price !== undefined ? `$${(item.price * item.quantity).toFixed(2)}` : '—'}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="order-drawer-info">
          <h3>Drawer Dimensions</h3>
          <div className="order-drawer-dims">{dimLabel}</div>
          <div className="order-cap-label">
            {gridResult.gridX}&times;{gridResult.gridY} grid
          </div>
        </div>

        <div className="order-capacity">
          <h3>Capacity</h3>
          <div className="order-cap-bar">
            <div className="order-cap-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="order-cap-label">{pct}% used</div>
        </div>

        {exportPdfError && <div role="alert" className="order-export-error">{exportPdfError}</div>}
      </div>

      <aside className="order-summary-panel">
        <p className="order-panel-title">Order Total</p>
        <div className="order-total-row">
          <span>Subtotal</span>
          <span>${total.toFixed(2)}</span>
        </div>
        {hasTbd && (
          <div className="order-tbd-note">
            &dagger; One or more items are Price TBD. A confirmed quote will follow before any build or shipment.
          </div>
        )}
        <div className="order-total-row grand">
          <span>Total</span>
          <span>{hasTbd ? 'Pending quote' : `$${total.toFixed(2)}`}</span>
        </div>

        <div className="order-panel-actions">
          <button className="order-panel-btn" onClick={handleDownloadPdf} type="button">
            Download PDF
          </button>
          {!isReadOnly && (
            <button
              className="order-panel-btn primary"
              onClick={handleSubmit}
              type="button"
              disabled={submitLayoutMutation.isPending || totalPlaced === 0 || hasNoId}
            >
              {submitLayoutMutation.isPending ? 'Submitting\u2026' : 'Submit Layout'}
            </button>
          )}
          {isReadOnly && (
            <div style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              This layout has been fulfilled.
            </div>
          )}
          <button className="order-panel-btn" onClick={handleSaveAndExit} type="button">
            Save &amp; Exit
          </button>
        </div>
      </aside>
    </div>
  );
}
