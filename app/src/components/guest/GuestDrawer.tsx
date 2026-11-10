import { useState } from "react";
import type { ReactNode } from 'react';
import type { GuestPreview, GuestBinModel } from "@gridfinity/shared";

interface GuestDrawerProps {
  layout: GuestPreview; models: GuestBinModel[]; selectedId?: number | null;
  onSelect?: (id: number) => void; sidebar?: ReactNode;
}
export function GuestDrawer({ layout, models, selectedId, onSelect, sidebar }: GuestDrawerProps) {
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const selected = selectedId === undefined ? localSelected : selectedId;
  const select = (id: number) => { setLocalSelected(id); onSelect?.(id); };
  const [showImages, setShowImages] = useState(true);
  const [view, setView] = useState<'top' | 'perspective'>('top');
  const [brokenImages, setBrokenImages] = useState<Set<number>>(() => new Set());
  const cols = layout.gridX * layout.gridResolution;
  const rows = layout.gridY * layout.gridResolution;
  const gapX = Math.max(0, layout.widthMm - layout.gridX * 42);
  const gapY = Math.max(0, layout.depthMm - layout.gridY * 42);
  const offset = (mode: string, gap: number) => mode === 'symmetrical' ? gap / 2 : mode === 'one-sided' ? gap : 0;
  return <div className="guest-layout">
    <section className="guest-canvas-section" aria-label="Drawer preview">
      <div className="guest-canvas-tools"><span>{layout.gridX} × {layout.gridY} grid units</span>
        <div className="guest-view-options" role="group" aria-label="Bin view">{(['top', 'perspective'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'top' ? 'Top' : '3D'}</button>)}</div>
        {layout.referenceImages.length > 0 && <label><input type="checkbox" checked={showImages} onChange={event => setShowImages(event.target.checked)} /> Show reference photos</label>}</div>
      <div className="guest-drawer" style={{ aspectRatio: `${layout.widthMm} / ${layout.depthMm}` }}>
        <div className="guest-grid" role="group" aria-label="Drawer layout" style={{
          left: `${offset(layout.spacerHorizontal, gapX) / layout.widthMm * 100}%`, top: `${offset(layout.spacerVertical, gapY) / layout.depthMm * 100}%`,
          width: `${layout.gridX * 42 / layout.widthMm * 100}%`, height: `${layout.gridY * 42 / layout.depthMm * 100}%`, backgroundSize: `${100 / layout.gridX}% ${100 / layout.gridY}%`,
        }}>
          {showImages && layout.referenceImages.filter(image => !brokenImages.has(image.id)).map(image => <div key={image.id} className="guest-reference-image" style={{ left: `${image.x}%`, top: `${image.y}%`, width: `${image.width}%`, height: `${image.height}%` }}>
            <img src={image.url} alt={image.name} style={{ opacity: image.opacity, transform: image.isAligned ? undefined : `scale(${image.scale}) rotate(${image.rotation}deg)` }} onError={() => setBrokenImages(previous => new Set(previous).add(image.id))} />
          </div>)}
          {layout.bins.map((bin, index) => <button type="button" key={bin.id} className={`guest-bin${selected === bin.id ? ' guest-bin-selected' : ''}`} aria-label={`Select bin ${index + 1}: ${bin.name}`} aria-pressed={selected === bin.id} title={`${bin.name}: ${bin.width / layout.gridResolution} × ${bin.depth / layout.gridResolution} units`} style={{ left: `${bin.x / cols * 100}%`, top: `${bin.y / rows * 100}%`, width: `${bin.width / cols * 100}%`, height: `${bin.depth / rows * 100}%` }} onClick={() => select(bin.id)}>
            <GuestBinImage bin={bin} model={models.find(model => model.id === bin.id)} view={view} />
            <span className="guest-model-number">{index + 1}</span>
          </button>)}
        </div>
      </div>
      {!!brokenImages.size && <p role="status">A reference image is unavailable.</p>}
      {models.some(model => model.status === 'pending') && <p role="status">Preparing bin previews. They will appear here when ready.</p>}
      {!layout.bins.length && <p className="guest-empty">This drawer has no bins yet.</p>}
    </section>
    <aside className="guest-bins" aria-label="Bins in this drawer"><h2>Bins <span>({layout.bins.length})</span></h2><p>Select a bin to identify its footprint.</p>
      <ol>{layout.bins.map((bin, index) => <li key={bin.id}><button type="button" aria-label={`Bin ${index + 1}: ${bin.name}`} aria-pressed={selected === bin.id} onClick={() => select(bin.id)}>
        <span className="guest-bin-number">{index + 1}</span><span><strong>{bin.name}</strong><span>{bin.width / layout.gridResolution} × {bin.depth / layout.gridResolution} grid units{bin.heightUnits !== null ? ` · ${bin.heightUnits * 7} mm tall` : ''}</span></span>
      </button></li>)}</ol>{sidebar}
    </aside>
  </div>;
}

export function GuestBinImage({ bin, model, view }: { bin: GuestPreview['bins'][number]; model: GuestBinModel | undefined; view: 'top' | 'perspective' }) {
  const url = view === 'top' ? model?.topUrl : model?.perspectiveUrl;
  return url ? <GuestModelImage key={url} url={url} bin={bin} rotation={view === 'top' ? model?.topRotation ?? 0 : 0} view={view} />
    : <span className="guest-model-fallback">{model?.status === 'pending' ? 'Preparing preview' : `${view === 'top' ? 'Top' : '3D'} preview unavailable`}</span>;
}
function GuestModelImage({ url, bin, rotation, view }: { url: string; bin: GuestPreview['bins'][number]; rotation: number; view: 'top' | 'perspective' }) {
  const [broken, setBroken] = useState(false);
  const sideways = rotation === 90 || rotation === 270;
  if (broken) return <span className="guest-model-fallback">{view === 'top' ? 'Top' : '3D'} preview unavailable</span>;
  return <img className="guest-bin-model" src={url} alt={`${bin.name}, ${view === 'top' ? 'top' : '3D'} view`} draggable={false} onError={() => setBroken(true)} style={rotation ? {
    position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    width: `${sideways ? bin.depth / bin.width * 100 : 100}%`, height: `${sideways ? bin.width / bin.depth * 100 : 100}%`,
  } : undefined} />;
}
