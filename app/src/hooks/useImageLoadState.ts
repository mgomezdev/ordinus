import { useState } from 'react';

interface ImageLoadState {
  forUrl: string;
  loaded: boolean;
  error: boolean;
}

const INITIAL_STATE: ImageLoadState = {
  forUrl: '',
  loaded: false,
  error: false,
};

export function useImageLoadState(currentUrl: string | undefined) {
  const [loadState, setLoadState] = useState<ImageLoadState>(INITIAL_STATE);

  const isCurrentUrl = loadState.forUrl === currentUrl;
  const imageLoaded = isCurrentUrl && loadState.loaded;
  const imageError = isCurrentUrl && loadState.error;
  const shouldShowImage = currentUrl && imageLoaded && !imageError;

  const handleImageLoad = () => {
    setLoadState({ forUrl: currentUrl ?? '', loaded: true, error: false });
  };

  const handleImageError = () => {
    setLoadState({ forUrl: currentUrl ?? '', loaded: false, error: true });
  };

  return {
    imageLoaded,
    imageError,
    shouldShowImage,
    handleImageLoad,
    handleImageError,
  };
}
