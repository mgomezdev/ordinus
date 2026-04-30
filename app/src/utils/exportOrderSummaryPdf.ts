import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BOMItem } from '@gridfinity/shared';
import type { GridResult, GridSpacerConfig, UnitSystem } from '../types/gridfinity';
import { generateFilename, getOrientation } from './exportPdf';

export function formatOrderSummaryRows(items: BOMItem[]): string[][] {
  return items.map(item => {
    const unitPrice = item.price !== undefined ? `$${item.price.toFixed(2)}` : 'Price TBD';
    const total = item.price !== undefined ? `$${(item.price * item.quantity).toFixed(2)}` : '—';
    return [item.name, `${item.widthUnits}\u00d7${item.heightUnits}`, String(item.quantity), unitPrice, total];
  });
}

export function calculateOrderTotal(items: BOMItem[]): number;
export function calculateOrderTotal(items: BOMItem[], includeHasTbd: true): { total: number; hasTbd: boolean };
export function calculateOrderTotal(
  items: BOMItem[],
  includeHasTbd?: true,
): number | { total: number; hasTbd: boolean } {
  const total = items.reduce(
    (sum, item) => sum + (item.price !== undefined ? item.price * item.quantity : 0),
    0,
  );
  const hasTbd = items.some(item => item.price === undefined);
  if (includeHasTbd) return { total, hasTbd };
  return total;
}

export interface ExportOrderSummaryConfig {
  gridResult: GridResult;
  spacerConfig: GridSpacerConfig;
  unitSystem: UnitSystem;
  layoutName?: string;
}

export async function exportOrderSummaryPdf(
  bomItems: BOMItem[],
  extraItems: BOMItem[],
  config: ExportOrderSummaryConfig,
  onError?: (err: unknown) => void,
): Promise<void> {
  try {
    const { gridResult, spacerConfig, unitSystem, layoutName } = config;
    const orientation = getOrientation(gridResult.gridX, gridResult.gridY);
    const filename = generateFilename(layoutName);

    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pdfTyped = pdf as jsPDF & { lastAutoTable?: { finalY: number } };
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let cursorY = margin;

    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Order Summary & BOM', margin, cursorY);
    if (layoutName) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(layoutName, margin, cursorY + 7);
    }
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(new Date().toLocaleDateString(), pageWidth - margin, cursorY, { align: 'right' });
    cursorY += layoutName ? 18 : 12;

    const unit = unitSystem === 'metric' ? 'mm' : 'in';
    const w =
      unitSystem === 'metric'
        ? Math.round(gridResult.actualWidth)
        : (gridResult.actualWidth / 25.4).toFixed(2);
    const d =
      unitSystem === 'metric'
        ? Math.round(gridResult.actualDepth)
        : (gridResult.actualDepth / 25.4).toFixed(2);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Drawer Dimensions', margin, cursorY);
    cursorY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `${w}${unit} \u00d7 ${d}${unit}  \u00b7  ${gridResult.gridX}\u00d7${gridResult.gridY} grid`,
      margin,
      cursorY,
    );
    pdf.text(`Spacers: H ${spacerConfig.horizontal}, V ${spacerConfig.vertical}`, margin, cursorY + 5);
    cursorY += 13;

    const { total: configuredTotal, hasTbd: configuredHasTbd } = calculateOrderTotal(bomItems, true);
    const configuredQty = bomItems.reduce((sum, i) => sum + i.quantity, 0);

    const { total: extrasTotal, hasTbd: extrasHasTbd } = extraItems.length > 0
      ? calculateOrderTotal(extraItems, true)
      : { total: 0, hasTbd: false };
    const extrasQty = extraItems.reduce((sum, i) => sum + i.quantity, 0);
    const grandTotal = configuredTotal + extrasTotal;
    const grandQty = configuredQty + extrasQty;
    const grandHasTbd = configuredHasTbd || extrasHasTbd;

    // As Configured table
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('As Configured', margin, cursorY);
    cursorY += 5;

    autoTable(pdf, {
      startY: cursorY,
      head: [['Component', 'Size', 'Qty', 'Unit Price', 'Total']],
      body: [
        ...formatOrderSummaryRows(bomItems),
        [
          { content: `${configuredQty} item${configuredQty !== 1 ? 's' : ''}`, colSpan: 2, styles: { fontStyle: 'bold' } },
          '',
          '',
          { content: configuredHasTbd ? 'Pending quote' : `$${configuredTotal.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        ],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 122, 255] },
    });

    cursorY = pdfTyped.lastAutoTable?.finalY ?? cursorY;

    if (extraItems.length > 0) {
      cursorY = cursorY + 8;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Extras', margin, cursorY);
      cursorY += 5;

      autoTable(pdf, {
        startY: cursorY,
        head: [['Component', 'Size', 'Qty', 'Unit Price', 'Total']],
        body: [
          ...formatOrderSummaryRows(extraItems),
          [
            { content: `${extrasQty} item${extrasQty !== 1 ? 's' : ''}`, colSpan: 2, styles: { fontStyle: 'bold' } },
            '',
            '',
            { content: extrasHasTbd ? 'Pending quote' : `$${extrasTotal.toFixed(2)}`, styles: { fontStyle: 'bold' } },
          ],
        ],
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [80, 80, 80] },
      });

      cursorY = (pdfTyped.lastAutoTable?.finalY ?? cursorY) + 4;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(
        `Full Order Total: ${grandQty} items — ${grandHasTbd ? 'Pending quote' : `$${grandTotal.toFixed(2)}`}`,
        margin,
        cursorY,
      );
    }

    if (grandHasTbd) {
      pdf.setFontSize(8);
      pdf.setTextColor(180, 83, 9);
      pdf.text(
        '\u2020 Items marked "Price TBD" will receive a confirmed quote before any build or shipment.',
        margin,
        cursorY + 6,
      );
      pdf.setTextColor(0, 0, 0);
    }

    pdf.save(filename);
  } catch (err) {
    console.error('Order summary PDF export failed:', err);
    onError?.(err);
  }
}
