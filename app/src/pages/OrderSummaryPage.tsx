import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { exportOrderSummaryPdf, calculateOrderTotal } from '../utils/exportOrderSummaryPdf';
import { formatCustomizationDescription } from '../utils/customizationDescription';
import type { BOMItem } from '@gridfinity/shared';
import { getBOMKey } from '../types/gridfinity';
import { BomGenerationPanel } from '../components/BomGenerationPanel';
import './OrderSummaryPage.css';

export function OrderSummaryPage() {
  const {
    bomItems,
    extras,
    addExtra,
    setExtraQty,
    removeExtra,
    gridResult,
    spacerConfig,
    unitSystem,
    layoutMeta,
    drawerWidth,
    drawerDepth,
    dialogDispatch,
    exportPdfError,
    setExportPdfError,
    isAuthenticated,
    getAccessToken,
  } = useWorkspace();

  const [isConfiguredOpen, setIsConfiguredOpen] = useState(true);
  const [isExtrasOpen, setIsExtrasOpen] = useState(true);
  const [addExtraKey, setAddExtraKey] = useState('');

  const dimLabel = unitSystem === 'imperial'
    ? `${(drawerWidth / 25.4).toFixed(2)}" × ${(drawerDepth / 25.4).toFixed(2)}"`
    : `${Math.round(drawerWidth)}mm × ${Math.round(drawerDepth)}mm`;

  const totalPlaced = bomItems.reduce((s, i) => s + i.quantity, 0);
  const capacity = gridResult.gridX * gridResult.gridY;
  const pct = capacity > 0 ? Math.min(100, Math.round((totalPlaced / capacity) * 100)) : 0;
  const hasNoId = !layoutMeta.id;

  // Extras: join extras map with bomItems for display
  const extraRows = Object.entries(extras)
    .map(([key, qty]) => ({ key, qty, bomItem: bomItems.find(b => getBOMKey(b.itemId, b.customization) === key) }))
    .filter((row): row is { key: string; qty: number; bomItem: BOMItem } => row.bomItem !== undefined);

  // Items available to add as extras (not already in extras)
  const addableItems = bomItems.filter(item => !(getBOMKey(item.itemId, item.customization) in extras));

  // Right panel calculations
  const { total: configuredTotal, hasTbd: configuredHasTbd } = calculateOrderTotal(bomItems, true);
  const { total: extrasTotal, hasTbd: extrasHasTbd } = calculateOrderTotal(
    extraRows.map(r => ({ ...r.bomItem, quantity: r.qty })),
    true,
  );
  const hasTbd = configuredHasTbd || extrasHasTbd;
  const grandTotal = configuredTotal + extrasTotal;
  const totalItems = totalPlaced + extraRows.reduce((s, r) => s + r.qty, 0);

  // Full order: configured qty + extras qty per item
  const fullOrderRows = bomItems.map(item => {
    const key = getBOMKey(item.itemId, item.customization);
    const extraQty = extras[key] ?? 0;
    return { item, totalQty: item.quantity + extraQty };
  });

  const handleAddExtra = () => {
    if (!addExtraKey) return;
    addExtra(addExtraKey);
    setAddExtraKey('');
  };

  const handleDownloadPdf = async () => {
    setExportPdfError(null);
    await exportOrderSummaryPdf(
      bomItems,
      extraRows.map(r => ({ ...r.bomItem, quantity: r.qty })),
      { gridResult, spacerConfig, unitSystem, layoutName: layoutMeta.name },
      () => setExportPdfError('PDF export failed. Please try again.'),
    );
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
          <span>BOM</span>
        </div>

        <h2 className="order-summary-title">Bill of Materials</h2>
        <p className="order-summary-subtitle">
          Review your layout and generate STL files for printing.
        </p>

        {hasNoId && (
          <div className="order-tbd-note">
            Save your layout first before generating STL files.{' '}
            <button
              className="order-panel-btn order-save-now-btn"
              onClick={handleSaveAndExit}
              type="button"
            >
              Save Now
            </button>
          </div>
        )}

        {/* ── As Configured section ── */}
        <div className="bom-section">
          <button
            type="button"
            className="bom-section-header"
            onClick={() => setIsConfiguredOpen(o => !o)}
            aria-expanded={isConfiguredOpen}
            aria-label="Toggle As Configured section"
          >
            <div className="bom-section-header-left">
              <span className="bom-section-title">As Configured</span>
              <span className="bom-section-badge">{totalPlaced} item{totalPlaced !== 1 ? 's' : ''}</span>
            </div>
            <span className={`bom-section-chevron${isConfiguredOpen ? '' : ' bom-section-chevron--closed'}`}>▲</span>
          </button>
          {isConfiguredOpen && (
            <div className="bom-section-body">
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
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bomItems.map(item => {
                      const customizationDesc = item.customization
                        ? formatCustomizationDescription(item.customization)
                        : '';
                      return (
                        <tr key={`${item.itemId}-${item.customization ? JSON.stringify(item.customization) : ''}`}>
                          <td>
                            <div className="order-bom-item-cell">
                              <div className="order-bom-color" style={{ backgroundColor: item.color }} />
                              <div>
                                <div className="order-bom-name">{item.name}</div>
                                {customizationDesc && <div className="order-bom-description">{customizationDesc}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="order-bom-size">{item.widthUnits}&times;{item.heightUnits}</td>
                          <td>{item.quantity}</td>
                          <td>
                            {item.price !== undefined
                              ? `$${item.price.toFixed(2)}`
                              : <span className="price-tbd-chip">Price TBD</span>}
                          </td>
                          <td>
                            {item.price !== undefined ? `$${(item.price * item.quantity).toFixed(2)}` : '—'}
                          </td>
                          <td />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── Extras section ── */}
        <div className="bom-section">
          <button
            type="button"
            className="bom-section-header"
            onClick={() => setIsExtrasOpen(o => !o)}
            aria-expanded={isExtrasOpen}
            aria-label="Toggle Extras section"
          >
            <div className="bom-section-header-left">
              <span className="bom-section-title">Extras</span>
              {extraRows.length > 0 && (
                <span className="bom-section-badge">+{extraRows.reduce((s, r) => s + r.qty, 0)}</span>
              )}
            </div>
            <span className={`bom-section-chevron${isExtrasOpen ? '' : ' bom-section-chevron--closed'}`}>▲</span>
          </button>
          {isExtrasOpen && (
            <div className="bom-section-body">
              {extraRows.length > 0 && (
                <table className="order-bom-table">
                  <thead>
                    <tr>
                      <th>Component Item</th>
                      <th>Size</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {extraRows.map(({ key, qty, bomItem }) => {
                      const customizationDesc = bomItem.customization
                        ? formatCustomizationDescription(bomItem.customization)
                        : '';
                      return (
                        <tr key={key}>
                          <td>
                            <div className="order-bom-item-cell">
                              <div className="order-bom-color" style={{ backgroundColor: bomItem.color }} />
                              <div>
                                <div className="order-bom-name">{bomItem.name}</div>
                                {customizationDesc && <div className="order-bom-description">{customizationDesc}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="order-bom-size">{bomItem.widthUnits}&times;{bomItem.heightUnits}</td>
                          <td>
                            <div className="bom-qty-control">
                              <button
                                type="button"
                                className="bom-qty-btn"
                                onClick={() => qty > 1 ? setExtraQty(key, qty - 1) : removeExtra(key)}
                                aria-label="Decrease quantity"
                              >−</button>
                              <input
                                className="bom-qty-input"
                                type="number"
                                min={1}
                                value={qty}
                                onChange={e => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!isNaN(v) && v >= 1) setExtraQty(key, v);
                                }}
                                aria-label="Extra quantity"
                              />
                              <button
                                type="button"
                                className="bom-qty-btn"
                                onClick={() => setExtraQty(key, qty + 1)}
                                aria-label="Increase quantity"
                              >+</button>
                            </div>
                          </td>
                          <td>
                            {bomItem.price !== undefined
                              ? `$${bomItem.price.toFixed(2)}`
                              : <span className="price-tbd-chip">Price TBD</span>}
                          </td>
                          <td>
                            {bomItem.price !== undefined ? `$${(bomItem.price * qty).toFixed(2)}` : '—'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="bom-remove-btn"
                              onClick={() => removeExtra(key)}
                              aria-label={`Remove ${bomItem.name} from extras`}
                            >✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="bom-add-row">
                <select
                  className="bom-add-select"
                  value={addExtraKey}
                  onChange={e => setAddExtraKey(e.target.value)}
                  aria-label="Select item to add as extra"
                >
                  <option value="">Add an extra item…</option>
                  {addableItems.map(item => {
                    const key = getBOMKey(item.itemId, item.customization);
                    const desc = item.customization ? formatCustomizationDescription(item.customization) : '';
                    const label = desc ? `${item.name} — ${desc}` : item.name;
                    return <option key={key} value={key}>{label}</option>;
                  })}
                </select>
                <button
                  type="button"
                  className="bom-add-btn"
                  onClick={handleAddExtra}
                  disabled={!addExtraKey}
                >
                  + Add
                </button>
              </div>
            </div>
          )}
        </div>

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

      {/* ── Right panel ── */}
      <aside className="order-summary-panel">

        {/* As Configured block */}
        <div className="order-panel-section">
          <p className="order-panel-section-title">As Configured</p>
          {bomItems.map(item => (
            <div key={getBOMKey(item.itemId, item.customization)} className="order-panel-item-row">
              <div className="order-panel-item-left">
                <div className="order-panel-item-dot" style={{ backgroundColor: item.color }} />
                <span className="order-panel-item-name">{item.name}</span>
              </div>
              <span className="order-panel-item-qty">×{item.quantity}</span>
            </div>
          ))}
          <div className="order-panel-subtotal">
            <span>Subtotal ({totalPlaced})</span>
            <span>{configuredHasTbd ? 'TBD' : `$${configuredTotal.toFixed(2)}`}</span>
          </div>
        </div>

        {extraRows.length > 0 && (
          <>
            <hr className="order-panel-divider" />

            {/* Extras block */}
            <div className="order-panel-section">
              <p className="order-panel-section-title">Extras</p>
              {extraRows.map(({ key, qty, bomItem }) => (
                <div key={key} className="order-panel-item-row">
                  <div className="order-panel-item-left">
                    <div className="order-panel-item-dot" style={{ backgroundColor: bomItem.color }} />
                    <span className="order-panel-item-name">{bomItem.name}</span>
                  </div>
                  <span className="order-panel-item-qty">×{qty}</span>
                </div>
              ))}
              <div className="order-panel-subtotal">
                <span>Subtotal ({extraRows.reduce((s, r) => s + r.qty, 0)})</span>
                <span>{extrasHasTbd ? 'TBD' : `$${extrasTotal.toFixed(2)}`}</span>
              </div>
            </div>

            <hr className="order-panel-divider" />

            {/* Full Order block */}
            <div className="order-panel-section">
              <p className="order-panel-section-title">Full Order</p>
              {fullOrderRows.map(({ item, totalQty }) => (
                <div key={getBOMKey(item.itemId, item.customization)} className="order-panel-item-row">
                  <div className="order-panel-item-left">
                    <div className="order-panel-item-dot" style={{ backgroundColor: item.color }} />
                    <span className="order-panel-item-name">{item.name}</span>
                  </div>
                  <span className="order-panel-item-qty">×{totalQty}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {hasTbd && (
          <div className="order-tbd-note">
            &dagger; One or more items are Price TBD. A confirmed quote will follow before any build or shipment.
          </div>
        )}
        <div className="order-total-row grand">
          <span>Total ({totalItems})</span>
          <span>{hasTbd ? 'Pending quote' : `$${grandTotal.toFixed(2)}`}</span>
        </div>

        {isAuthenticated && layoutMeta.id !== null && (
          <>
            <hr className="order-panel-divider" />
            <div className="order-panel-section">
              <p className="order-panel-section-title">Generate STL Files</p>
              <BomGenerationPanel
                layoutId={layoutMeta.id}
                bomItems={bomItems}
                accessToken={getAccessToken()}
              />
            </div>
          </>
        )}

        <div className="order-panel-actions">
          <button className="order-panel-btn" onClick={handleDownloadPdf} type="button">
            Download PDF
          </button>
          <button className="order-panel-btn" onClick={handleSaveAndExit} type="button">
            Save &amp; Exit
          </button>
        </div>
      </aside>
    </div>
  );
}
