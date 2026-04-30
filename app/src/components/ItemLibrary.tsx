import { useState } from 'react';
import type { LibraryItem } from '../types/gridfinity';
import { LibraryItemCard } from './LibraryItemCard';

interface ItemLibraryProps {
  items: LibraryItem[];
  isLoading: boolean;
  error: Error | null;
  activeCategory?: string | null;
}

export function ItemLibrary({
  items,
  isLoading,
  error,
  activeCategory,
}: ItemLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWidths, setSelectedWidths] = useState<Set<number>>(new Set());
  const [selectedHeights, setSelectedHeights] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesWidth = selectedWidths.size === 0 || selectedWidths.has(item.widthUnits);
    const matchesHeight = selectedHeights.size === 0 || selectedHeights.has(item.heightUnits);
    const matchesCategory = !activeCategory || item.categories.includes(activeCategory);
    return matchesSearch && matchesWidth && matchesHeight && matchesCategory;
  });

  const hasResults = filteredItems.length > 0;

  return (
    <div className="item-library">
      <h3 className="item-library-title">Item Library</h3>
      <p className="item-library-hint">Drag items onto the grid</p>

      {error && (
        <div className="library-error">
          <p>Failed to load library</p>
          <p className="error-message">{error.message}</p>
        </div>
      )}

      {!error && isLoading && (
        <div className="library-loading">
          <p>Loading library...</p>
        </div>
      )}

      {!error && !isLoading && (
        <>
          <div className="library-search">
            <input
              type="text"
              className="library-search-input"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="library-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <button
            className="toggle-filters-button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
          >
            {showFilters ? '▼' : '▶'} Filter by Size
            {(selectedWidths.size > 0 || selectedHeights.size > 0) && (
              <span className="filter-active-indicator">●</span>
            )}
          </button>

          {showFilters && (
            <div className="library-filters">
              <div className="filter-group">
                <label className="filter-label">Width:</label>
                <div className="filter-options">
                  {[1, 2, 3, 4, 5].map(width => (
                    <button
                      key={width}
                      className={`filter-chip ${selectedWidths.has(width) ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedWidths(prev => {
                          const next = new Set(prev);
                          if (next.has(width)) next.delete(width);
                          else next.add(width);
                          return next;
                        });
                      }}
                      aria-pressed={selectedWidths.has(width)}
                    >
                      {width}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <label className="filter-label">Height:</label>
                <div className="filter-options">
                  {[1, 2, 3, 4, 5].map(height => (
                    <button
                      key={height}
                      className={`filter-chip ${selectedHeights.has(height) ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedHeights(prev => {
                          const next = new Set(prev);
                          if (next.has(height)) next.delete(height);
                          else next.add(height);
                          return next;
                        });
                      }}
                      aria-pressed={selectedHeights.has(height)}
                    >
                      {height}x
                    </button>
                  ))}
                </div>
              </div>

              {(selectedWidths.size > 0 || selectedHeights.size > 0) && (
                <button
                  className="filter-clear-all"
                  onClick={() => {
                    setSelectedWidths(new Set());
                    setSelectedHeights(new Set());
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {!hasResults && (searchQuery || selectedWidths.size > 0 || selectedHeights.size > 0) && (
            <div className="library-no-results">
              <p>No items found{searchQuery && ` matching "${searchQuery}"`}</p>
            </div>
          )}

          <div className="library-items-grid">
            {filteredItems.map(item => (
              <LibraryItemCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
