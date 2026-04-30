import { useRef, useState } from 'react';

interface ReferenceImageUploaderProps {
  onUpload: (file: File) => Promise<void>;
}

export function ReferenceImageUploader({ onUpload }: ReferenceImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear any previous errors
    setError(null);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    try {
      setIsUploading(true);
      await onUpload(file);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload image';
      setError(errorMessage);
    } finally {
      setIsUploading(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="reference-image-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label="Upload reference image"
      />
      <button
        className="reference-image-uploader__button"
        onClick={handleButtonClick}
        disabled={isUploading}
        aria-busy={isUploading}
      >
        {isUploading ? 'Uploading...' : 'Upload Reference Image'}
      </button>
      {error && (
        <div className="reference-image-uploader__error" role="alert">
          <span>{error}</span>
          <button
            className="reference-image-uploader__error-dismiss"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
