import type { GridSpacerConfig, SpacerMode } from '../types/gridfinity';

interface SpacerControlsProps {
  config: GridSpacerConfig;
  onConfigChange: (config: GridSpacerConfig) => void;
}

const SPACER_OPTIONS: { value: SpacerMode; label: string }[] = [
  { value: 'none',        label: 'None' },
  { value: 'one-sided',   label: 'One-sided' },
  { value: 'symmetrical', label: 'Symmetrical' },
];

export function SpacerControls({ config, onConfigChange }: SpacerControlsProps) {
  return (
    <div className="spacer-controls">
      <span className="spacer-group-label">Border Spacers</span>
      <div className="spacer-group">
        <label className="spacer-axis-label" htmlFor="spacer-horizontal">Horizontal</label>
        <select
          id="spacer-horizontal"
          className="spacer-select"
          value={config.horizontal}
          onChange={e => onConfigChange({ ...config, horizontal: e.target.value as SpacerMode })}
        >
          {SPACER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="spacer-group">
        <label className="spacer-axis-label" htmlFor="spacer-vertical">Vertical</label>
        <select
          id="spacer-vertical"
          className="spacer-select"
          value={config.vertical}
          onChange={e => onConfigChange({ ...config, vertical: e.target.value as SpacerMode })}
        >
          {SPACER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}
