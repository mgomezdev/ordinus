import type { InteractionMode } from '../types/gridfinity';

interface InteractionModeToggleProps {
  mode: InteractionMode;
  onChange: (mode: InteractionMode) => void;
  hasImages: boolean;
}

export function InteractionModeToggle({
  mode,
  onChange,
  hasImages,
}: InteractionModeToggleProps) {
  const handleItemsClick = () => {
    onChange('items');
  };

  const handleImagesClick = () => {
    if (hasImages) {
      onChange('images');
    }
  };

  return (
    <div
      className="interaction-mode-toggle"
      role="group"
      aria-label="Interaction mode"
    >
      <button
        className={`interaction-mode-toggle__button ${
          mode === 'items' ? 'interaction-mode-toggle__button--active' : ''
        }`}
        onClick={handleItemsClick}
        aria-pressed={mode === 'items'}
        title="Items mode - drag and place bins"
      >
        Items
      </button>
      <button
        className={`interaction-mode-toggle__button ${
          mode === 'images' ? 'interaction-mode-toggle__button--active' : ''
        }`}
        onClick={handleImagesClick}
        disabled={!hasImages}
        aria-pressed={mode === 'images'}
        title={hasImages ? 'Images mode - adjust reference images' : 'No images to interact with'}
      >
        Images
      </button>
    </div>
  );
}
