import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateFilename, getOrientation, formatBomRows, exportToPdf } from './exportPdf';
import type { ExportPdfConfig } from './exportPdf';
import type { BOMItem, GridResult, GridSpacerConfig } from '../types/gridfinity';

// Mock html2canvas and jspdf at module level
vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,fake'),
  }),
}));

const mockSave = vi.fn();
const mockAddImage = vi.fn();
const mockText = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetFont = vi.fn();
const mockGetWidth = vi.fn().mockReturnValue(297);
const mockGetHeight = vi.fn().mockReturnValue(210);

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      internal: { pageSize: { getWidth: mockGetWidth, getHeight: mockGetHeight } },
      setFontSize: mockSetFontSize,
      setFont: mockSetFont,
      text: mockText,
      addImage: mockAddImage,
      save: mockSave,
    };
  }),
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

describe('generateFilename', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-26'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('slugifies a layout name', () => {
    expect(generateFilename('My Drawer Organizer')).toBe('my-drawer-organizer.pdf');
  });

  it('strips special characters', () => {
    expect(generateFilename('Test! Layout #1')).toBe('test-layout-1.pdf');
  });

  it('collapses multiple separators', () => {
    expect(generateFilename('A  --  B')).toBe('a-b.pdf');
  });

  it('falls back to date when name is undefined', () => {
    expect(generateFilename()).toBe('gridfinity-2026-02-26.pdf');
  });

  it('falls back to date when name is empty string', () => {
    expect(generateFilename('')).toBe('gridfinity-2026-02-26.pdf');
  });

  it('falls back to date when name is whitespace only', () => {
    expect(generateFilename('   ')).toBe('gridfinity-2026-02-26.pdf');
  });
});

describe('getOrientation', () => {
  it('returns landscape for wide grid', () => {
    expect(getOrientation(6, 4)).toBe('l');
  });

  it('returns portrait for tall grid', () => {
    expect(getOrientation(3, 5)).toBe('p');
  });

  it('returns portrait for square grid', () => {
    expect(getOrientation(4, 4)).toBe('p');
  });
});

describe('formatBomRows', () => {
  const baseItem: BOMItem = {
    itemId: 'bin-2x3',
    name: '2x3 Bin',
    widthUnits: 2,
    heightUnits: 3,
    color: '#3B82F6',
    categories: ['bin'],
    quantity: 4,
  };

  it('formats a row with no customization', () => {
    expect(formatBomRows([baseItem])).toEqual([['2x3 Bin', '2×3', '4', '']]);
  });

  it('formats wall pattern customization', () => {
    const item: BOMItem = {
      ...baseItem,
      customization: { wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none' },
    };
    expect(formatBomRows([item])).toEqual([['2x3 Bin', '2×3', '4', 'grid']]);
  });

  it('formats multiple customization fields', () => {
    const item: BOMItem = {
      ...baseItem,
      customization: { wallPattern: 'none', lipStyle: 'reduced', fingerSlide: 'chamfered', wallCutout: 'none' },
    };
    expect(formatBomRows([item])).toEqual([['2x3 Bin', '2×3', '4', 'lip: reduced, slide: chamfered']]);
  });

  it('returns multiple rows for multiple items', () => {
    const item2: BOMItem = { ...baseItem, name: 'Other', quantity: 2 };
    expect(formatBomRows([baseItem, item2])).toHaveLength(2);
  });
});

describe('exportToPdf', () => {
  const gridEl = document.createElement('div');
  const gridResult: GridResult = {
    gridX: 4,
    gridY: 4,
    actualWidth: 168,
    actualDepth: 168,
    gapWidth: 0,
    gapDepth: 0,
  };
  const spacerConfig: GridSpacerConfig = { horizontal: 'none', vertical: 'none' };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-26'));
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls pdf.save with layout name slug when name provided', async () => {
    const config: ExportPdfConfig = { gridResult, spacerConfig, unitSystem: 'metric', layoutName: 'My Layout' };
    await exportToPdf(gridEl, [], config);
    expect(mockSave).toHaveBeenCalledWith('my-layout.pdf');
  });

  it('calls pdf.save with date fallback when no name', async () => {
    await exportToPdf(gridEl, [], { gridResult, spacerConfig, unitSystem: 'metric' });
    expect(mockSave).toHaveBeenCalledWith('gridfinity-2026-02-26.pdf');
  });

  it('calls onError when html2canvas rejects', async () => {
    const { default: html2canvas } = await import('html2canvas');
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('canvas failed'));
    const onError = vi.fn();
    await exportToPdf(gridEl, [], { gridResult, spacerConfig, unitSystem: 'metric' }, onError);
    expect(onError).toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
