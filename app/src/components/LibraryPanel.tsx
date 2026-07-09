import { useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ItemLibrary } from './ItemLibrary';
import { RefImageLibrary } from './RefImageLibrary';
import { UserStlLibrarySection } from './UserStlLibrarySection';
import { FavoriteCard } from './FavoriteCard';
import { useFavorites } from '../hooks/useFavorites';

interface LibraryPanelProps {
  width: number;
  isMobile?: boolean;
  isOpen?: boolean;
}

export function LibraryPanel({ width, isMobile, isOpen }: LibraryPanelProps) {
  const {
    libraryItems, isLibraryLoading, isLibrariesLoading,
    libraryError, librariesError, categories,
  } = useWorkspace();
  const { favorites, removeFavorite, renameFavorite } = useFavorites();

  const [libraryTab, setLibraryTab] = useState<'favorites' | 'items' | 'images'>('items');
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
          className={`library-cat-tab${libraryTab === 'favorites' ? ' active' : ''}`}
          onClick={() => setLibraryTab('favorites')}
          type="button"
        >♥</button>
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
        <button
          className={`library-cat-tab${libraryTab === 'images' ? ' active' : ''}`}
          onClick={() => setLibraryTab('images')}
          type="button"
        >Images</button>
      </div>
      <div className="library-panel-content">
        {libraryTab === 'favorites' ? (
          favorites.length === 0 ? (
            <div className="favorites-empty-state">
              <p>No favorites yet. Click the ♥ button on any item to save it here.</p>
            </div>
          ) : (
            <div className="favorites-grid">
              {favorites.map((fav) => (
                <FavoriteCard
                  key={fav.id}
                  favorite={fav}
                  onRemove={() => removeFavorite(fav.id)}
                  onRename={(name) => renameFavorite(fav.id, name)}
                />
              ))}
            </div>
          )
        ) : libraryTab === 'items' ? (
          <>
            <ItemLibrary
              items={libraryItems}
              isLoading={isLibraryLoading || isLibrariesLoading}
              error={libraryError || librariesError}
              activeCategory={libraryCategory}
            />
            <UserStlLibrarySection />
          </>
        ) : (
          <RefImageLibrary />
        )}
      </div>
    </section>
  );
}
