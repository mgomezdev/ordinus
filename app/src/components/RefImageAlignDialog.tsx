import { useState } from 'react';
import type { Quad } from '@gridfinity/shared';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { warpRefImage } from '../api/refImages.api';
import { CornerEditorDialog } from './CornerEditorDialog';
import { gridAreaAspectRatio } from '../utils/gridAreaAspectRatio';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

/** Corner editor bound to the workspace's currently targeted reference image. */
export function RefImageAlignDialog() {
  const { dialogs, dialogDispatch, refImagePlacements, gridResult, spacers, applyRefImageAlignment } = useWorkspace();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placement = refImagePlacements.find(p => p.id === dialogs.alignTargetId);
  if (!dialogs.align || !placement || placement.refImageId === null || !placement.imageUrl) return null;

  const close = () => {
    setError(null);
    dialogDispatch({ type: 'CLOSE_ALIGN' });
  };

  const handleApply = async (corners: Quad) => {
    setIsApplying(true);
    setError(null);
    try {
      const warp = await warpRefImage(
        placement.refImageId!,
        corners,
        gridAreaAspectRatio(gridResult.gridX, gridResult.gridY, spacers),
      );
      applyRefImageAlignment(placement.id, { corners, ...warp });
      dialogDispatch({ type: 'CLOSE_ALIGN' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to align image');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <CornerEditorDialog
      key={placement.id}
      isOpen
      imageSrc={`${API_BASE_URL}/images/${placement.imageUrl}`}
      imageName={placement.name}
      initialCorners={placement.corners ?? null}
      onApply={corners => void handleApply(corners)}
      onCancel={close}
      isApplying={isApplying}
      error={error}
    />
  );
}
