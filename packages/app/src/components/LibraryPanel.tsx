import { useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ItemLibrary } from './ItemLibrary';
import { RefImageLibrary } from './RefImageLibrary';
import { UserStlLibrarySection } from './UserStlLibrarySection';

interface LibraryPanelProps {
  width: number;
  isMobile?: boolean;
  isOpen?: boolean;
}

export function LibraryPanel({ width, isMobile, isOpen }: LibraryPanelProps) {
  const {
    isAuthenticated,
    libraryItems, isLibraryLoading, isLibrariesLoading,
    libraryError, librariesError, categories,
  } = useWorkspace();

  const [libraryTab, setLibraryTab] = useState<'items' | 'images'>('items');
  const [libraryCategory, setLibraryCategory] = useState<string | null>(null);

  return (
    <section
      className={`library-panel${isOpen ? ' library-panel--open' : ''}`}
      style={isMobile ? undefined : { width, minWidth: width }}
    >
      <div className="library-panel-header">
        <div className="library-panel-header-icon">⊞</div>
        <div className="library-panel-header-text">
          <span className="library-panel-title">Component Library</span>
          <span className="library-panel-subtitle">Drag to workspace</span>
        </div>
      </div>
      <div className="library-panel-tabs">
        <button
          className={`library-cat-tab${libraryTab === 'items' && !libraryCategory ? ' active' : ''}`}
          onClick={() => { setLibraryTab('items'); setLibraryCategory(null); }}
          type="button"
        >All</button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`library-cat-tab${libraryTab === 'items' && libraryCategory === cat.id ? ' active' : ''}`}
            onClick={() => { setLibraryTab('items'); setLibraryCategory(cat.id); }}
            type="button"
          >{cat.name}</button>
        ))}
        {isAuthenticated && (
          <button
            className={`library-cat-tab${libraryTab === 'images' ? ' active' : ''}`}
            onClick={() => setLibraryTab('images')}
            type="button"
          >Images</button>
        )}
      </div>
      <div className="library-panel-content">
        {libraryTab === 'items' ? (
          <>
            <ItemLibrary
              items={libraryItems}
              isLoading={isLibraryLoading || isLibrariesLoading}
              error={libraryError || librariesError}
              activeCategory={libraryCategory}
            />
            {isAuthenticated && <UserStlLibrarySection />}
          </>
        ) : isAuthenticated ? (
          <RefImageLibrary />
        ) : (
          <div className="ref-image-auth-prompt">
            <p>Sign in to upload and manage reference images.</p>
          </div>
        )}
      </div>
    </section>
  );
}
