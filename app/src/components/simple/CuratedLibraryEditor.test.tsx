import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GENERATOR_PARAM_SCHEMA, effectiveDefault } from '@gridfinity/shared';
import type { CuratedLibrary, ParametricCuratedEntry } from '@gridfinity/shared';
import { CuratedLibraryEditor } from './CuratedLibraryEditor';

const parametric = (): ParametricCuratedEntry => ({ id: 'cup', name: 'Cup', kind: 'parametric', generator: 'basic-cup', width: { min: 0.5, max: 20, step: 0.5 }, depth: { fixed: 2 }, defaults: { height: 4 }, groups: [] });
const library = (): CuratedLibrary => ({ id: 'kitchen', name: 'Kitchen', description: '', entries: [parametric(), { id: 'fixed', kind: 'fixed', name: 'Tray', sourceId: 'bins:tray', width: 3, depth: 2 }] });
const items = [{ id: 'bins:tray', libraryId: 'bins', name: 'Tray', widthUnits: 3, heightUnits: 2, color: '#007aff', categories: [] }];
function setup(initial = library()) {
  const props = { initial, items, pending: false, error: null, onSave: vi.fn(), onCancel: vi.fn(), onDelete: vi.fn() };
  render(<CuratedLibraryEditor {...props} />);
  return props;
}

describe('curated library authoring', () => {
  it('edits metadata, reorders, adds and removes source references, and saves', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Library name'), { target: { value: 'Cutlery' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Kitchen drawer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move Cup down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Cup up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tray', exact: true }));
    expect(screen.getByText(/Fixed footprint: 3 × 2/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Bin name'), { target: { value: 'Fixed tray' } });
    fireEvent.change(screen.getByLabelText('Find bins'), { target: { value: 'tray' } });
    fireEvent.change(screen.getByLabelText('Existing bin'), { target: { value: 'bins:tray' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add selected bin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tray', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Save library' }));
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cutlery', description: 'Kitchen drawer', entries: [expect.objectContaining({ id: 'cup' }), expect.objectContaining({ name: 'Fixed tray' })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(props.onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete library' }));
    expect(props.onDelete).toHaveBeenCalled();
  });
  it('edits fixed, range and allowed-list constraints on both independent axes', () => {
    const props = setup();
    const width = within(screen.getByRole('group', { name: 'Width (grid units)' }));
    for (const [label, value] of [['Minimum', '1'], ['Maximum', '10'], ['Step', '1']]) fireEvent.change(width.getByLabelText(label), { target: { value } });
    fireEvent.change(width.getByLabelText('Sizing'), { target: { value: 'values' } });
    fireEvent.blur(width.getByLabelText('Allowed sizes (comma separated)'), { target: { value: '1, 2, 3' } });
    fireEvent.change(width.getByLabelText('Sizing'), { target: { value: 'fixed' } });
    fireEvent.change(width.getByLabelText('Fixed width'), { target: { value: '3' } });
    const depth = within(screen.getByRole('group', { name: 'Depth (grid units)' }));
    fireEvent.change(depth.getByLabelText('Sizing'), { target: { value: 'range' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save library' }));
    expect(props.onSave.mock.calls[0][0].entries[0]).toMatchObject({ width: { fixed: 3 }, depth: { min: 0.5, max: 20, step: 0.5 } });
  });
  it('edits named choices and multi-input bundles, adds and removes choices and groups', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add named option' }));
    fireEvent.change(screen.getByLabelText('Option name'), { target: { value: 'Drawer height' } });
    const shortDetails = screen.getByText('Short', { selector: 'summary' }).parentElement!;
    const short = within(shortDetails);
    fireEvent.change(short.getByLabelText('Choice name'), { target: { value: 'Low' } });
    fireEvent.change(short.getByLabelText('Height (7 mm units)'), { target: { value: '3' } });
    fireEvent.change(short.getByLabelText('Input', { exact: true }), { target: { value: 'lip_style' } });
    fireEvent.click(short.getByRole('button', { name: 'Add input' }));
    fireEvent.change(short.getByLabelText('Lip style'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    const extra = within(screen.getByText('New choice', { selector: 'summary' }).parentElement!);
    fireEvent.click(extra.getByRole('button', { name: 'Remove choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save library' }));
    expect(props.onSave.mock.calls[0][0].entries[0].groups[0]).toMatchObject({ name: 'Drawer height', choices: [expect.objectContaining({ name: 'Low', values: { height: 3, lip_style: 'none' } }), expect.anything(), expect.anything()] });
    fireEvent.click(short.getByRole('button', { name: 'Remove Lip style' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove option' }));
    expect(screen.queryByLabelText('Option name')).not.toBeInTheDocument();
  });
  it('edits boolean, string, array and default numeric inputs using typed controls', () => {
    const array = GENERATOR_PARAM_SCHEMA.find(def => def.kind === 'array')!;
    const initial = library();
    (initial.entries[0] as ParametricCuratedEntry).defaults = { height: 4, vertical_irregular_subdivisions: false, vertical_separator_config: '10.5|21', [array.name]: effectiveDefault(array) };
    setup(initial);
    fireEvent.change(screen.getByLabelText('Height (7 mm units)'), { target: { value: '5' } });
    const flag = GENERATOR_PARAM_SCHEMA.find(def => def.name === 'vertical_irregular_subdivisions')!;
    fireEvent.change(screen.getByLabelText(flag.label), { target: { value: 'true' } });
    const text = GENERATOR_PARAM_SCHEMA.find(def => def.name === 'vertical_separator_config')!;
    fireEvent.change(screen.getByLabelText(text.label), { target: { value: '12|24' } });
    fireEvent.change(screen.getByLabelText(`${array.label} value 1`), { target: { value: '1' } });
    expect(screen.getByLabelText(`${array.label} value 1`)).toHaveValue(1);
    fireEvent.click(screen.getByRole('button', { name: `Remove ${array.label}` }));
    expect(screen.queryByLabelText(`${array.label} value 1`)).not.toBeInTheDocument();
  });
  it('surfaces invalid mappings and prevents saving', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Bin name'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save library' })).toBeDisabled();
    expect(screen.getByLabelText('Library validation')).toHaveTextContent('Entries require unique ids and names');
  });
});
