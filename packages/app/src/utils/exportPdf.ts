import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BOMItem, GridResult, GridSpacerConfig, UnitSystem } from '../types/gridfinity';

export function generateFilename(layoutName?: string): string {
  if (layoutName && layoutName.trim()) {
    const slug = layoutName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${slug}.pdf`;
  }
  const date = new Date().toISOString().slice(0, 10);
  return `gridfinity-${date}.pdf`;
}

export function getOrientation(gridX: number, gridY: number): 'l' | 'p' {
  return gridX > gridY ? 'l' : 'p';
}

function formatCustomizationText(item: BOMItem): string {
  if (!item.customization) return '';
  const parts: string[] = [];
  if (item.customization.wallPattern !== 'none') parts.push(item.customization.wallPattern);
  if (item.customization.lipStyle !== 'normal') parts.push(`lip: ${item.customization.lipStyle}`);
  if (item.customization.fingerSlide !== 'none') parts.push(`slide: ${item.customization.fingerSlide}`);
  if (item.customization.wallCutout !== 'none') parts.push(`cutout: ${item.customization.wallCutout}`);
  return parts.join(', ');
}

export function formatBomRows(items: BOMItem[]): string[][] {
  return items.map(item => [
    item.name,
    `${item.widthUnits}×${item.heightUnits}`,
    String(item.quantity),
    formatCustomizationText(item),
  ]);
}

export interface ExportPdfConfig {
  gridResult: GridResult;
  spacerConfig: GridSpacerConfig;
  unitSystem: UnitSystem;
  layoutName?: string;
}

export async function exportToPdf(
  gridElement: HTMLElement,
  bomItems: BOMItem[],
  config: ExportPdfConfig,
  onError?: (err: unknown) => void,
): Promise<void> {
  try {
    const { gridResult, spacerConfig, unitSystem, layoutName } = config;
    const orientation = getOrientation(gridResult.gridX, gridResult.gridY);
    const filename = generateFilename(layoutName);

    const canvas = await html2canvas(gridElement, { useCORS: true, scale: 2 });

    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let cursorY = margin;

    // Header
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Gridfinity Layout', margin, cursorY);
    if (layoutName) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(layoutName, margin, cursorY + 7);
    }
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(new Date().toLocaleDateString(), pageWidth - margin, cursorY, { align: 'right' });
    cursorY += layoutName ? 18 : 12;

    // Grid screenshot
    const imgAspect = canvas.width / canvas.height;
    const imgWidth = contentWidth;
    const imgHeight = imgWidth / imgAspect;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, cursorY, imgWidth, imgHeight);
    cursorY += imgHeight + 8;

    // Config block
    const unit = unitSystem === 'metric' ? 'mm' : 'in';
    const w = unitSystem === 'metric'
      ? Math.round(gridResult.actualWidth)
      : (gridResult.actualWidth / 25.4).toFixed(2);
    const d = unitSystem === 'metric'
      ? Math.round(gridResult.actualDepth)
      : (gridResult.actualDepth / 25.4).toFixed(2);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Configuration', margin, cursorY);
    cursorY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Grid: ${gridResult.gridX}×${gridResult.gridY} units  ·  ${w}${unit} × ${d}${unit}`, margin, cursorY);
    cursorY += 5;
    pdf.text(
      `Spacers: horizontal ${spacerConfig.horizontal}, vertical ${spacerConfig.vertical}`,
      margin,
      cursorY,
    );
    pdf.text(`Units: ${unitSystem}`, pageWidth - margin, cursorY - 5, { align: 'right' });
    cursorY += 8;

    // BOM table
    pdf.setFont('helvetica', 'bold');
    pdf.text('Bill of Materials', margin, cursorY);
    cursorY += 4;

    const totalQty = bomItems.reduce((sum, item) => sum + item.quantity, 0);

    autoTable(pdf, {
      startY: cursorY,
      head: [['Name', 'Size', 'Qty', 'Customization']],
      body: [
        ...formatBomRows(bomItems),
        [{ content: `Total: ${totalQty} item${totalQty !== 1 ? 's' : ''}`, colSpan: 4, styles: { fontStyle: 'bold' } }],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    pdf.save(filename);
  } catch (err) {
    console.error('PDF export failed:', err);
    onError?.(err);
  }
}
