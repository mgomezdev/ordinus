import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useCustomers } from '../contexts/CustomerContext';
import {
  useLayoutsQuery,
  useDeleteLayoutMutation,
  useCloneLayoutMutation,
} from '../hooks/useLayouts';
import { SavedConfigCard } from '../components/layouts/SavedConfigCard';
import type { ApiLayout } from '@gridfinity/shared';
import './SavedConfigsPage.css';

interface CustomerSectionProps {
  customerId: number | null;
  customerName: string;
  onEdit: (id: number) => Promise<void>;
}

function CustomerSection({ customerId, customerName, onEdit }: CustomerSectionProps) {
  const layoutsQuery = useLayoutsQuery(customerId);
  const deleteMutation = useDeleteLayoutMutation();
  const cloneMutation = useCloneLayoutMutation();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const layouts = (layoutsQuery.data ?? []) as ApiLayout[];

  if (layoutsQuery.isLoading) {
    return <div className="saved-configs-loading">Loading {customerName} layouts...</div>;
  }

  if (layouts.length === 0) return null;

  return (
    <div className="saved-configs-customer-section">
      <h3 className="saved-configs-customer-name">{customerName}</h3>
      {sectionError && (
        <div className="saved-configs-error" role="alert">
          {sectionError}
          <button
            type="button"
            className="saved-configs-error-dismiss"
            onClick={() => setSectionError(null)}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}
      <div className="saved-configs-grid">
        {layouts.map((layout) => (
          <SavedConfigCard
            key={layout.id}
            layout={layout}
            onEdit={onEdit}
            onDelete={async (id) => {
              setDeletingId(id);
              try {
                await deleteMutation.mutateAsync(id);
              } finally {
                setDeletingId(null);
              }
            }}
            onDuplicate={(id) => cloneMutation.mutate(id, {
              onError: () => setSectionError('Failed to duplicate. Please try again.'),
              onSuccess: () => setSectionError(null),
            })}
            isDeleting={deletingId === layout.id}
          />
        ))}
      </div>
    </div>
  );
}

export function SavedConfigsPage() {
  const navigate = useNavigate();
  const { loadLayout } = useWorkspace();
  const { customers, selectedCustomer, setSelectedCustomerId, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const layoutsQuery = useLayoutsQuery(undefined);
  const deleteMutation = useDeleteLayoutMutation();
  const cloneMutation = useCloneLayoutMutation();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<{ id: number; name: string } | null>(null);
  const [customerTab, setCustomerTab] = useState<'all' | 'by-customer'>('all');

  const handleEdit = async (id: number) => {
    try {
      await loadLayout(id);
      navigate('/');
    } catch (err) {
      console.error('Failed to load layout:', err);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;
    try {
      const c = await createCustomer(newCustomerName.trim());
      setNewCustomerName('');
      setSelectedCustomerId(c.id);
    } catch {
      setPageError('Failed to create customer.');
    }
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer || !editingCustomer.name.trim()) return;
    try {
      await updateCustomer(editingCustomer.id, editingCustomer.name.trim());
      setEditingCustomer(null);
    } catch {
      setPageError('Failed to update customer.');
    }
  };

  const handleDeleteCustomer = async (id: number) => {
    try {
      await deleteCustomer(id);
    } catch {
      setPageError('Failed to delete customer.');
    }
  };

  const allLayouts = (layoutsQuery.data ?? []) as ApiLayout[];

  const newConfigCard = (
    <button
      className="saved-config-card new-config"
      onClick={() => navigate('/')}
      type="button"
    >
      <span className="saved-config-new-icon">+</span>
      <span className="saved-config-new-label">New Configuration</span>
      <span className="saved-config-new-hint">Start a fresh layout</span>
    </button>
  );

  return (
    <div className="saved-configs-page">
      {pageError && (
        <div className="saved-configs-error" role="alert">
          {pageError}
          <button
            type="button"
            className="saved-configs-error-dismiss"
            onClick={() => setPageError(null)}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      <div className="saved-configs-header">
        <h2 className="saved-configs-title">Saved Configs</h2>
        <p className="saved-configs-subtitle">Review and manage your gridfinity layouts.</p>
      </div>

      {/* Customer management section */}
      <div className="saved-configs-customers">
        <h3 className="saved-configs-section-title">Customers</h3>
        <div className="saved-configs-customer-list">
          {customers.map((c) => (
            <div key={c.id} className={`saved-configs-customer-item${selectedCustomer?.id === c.id ? ' selected' : ''}`}>
              {editingCustomer?.id === c.id ? (
                <>
                  <input
                    className="saved-configs-customer-edit-input"
                    value={editingCustomer.name}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && void handleUpdateCustomer()}
                    autoFocus
                  />
                  <button type="button" className="saved-config-btn" onClick={() => void handleUpdateCustomer()}>Save</button>
                  <button type="button" className="saved-config-btn" onClick={() => setEditingCustomer(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="saved-configs-customer-name-btn"
                    onClick={() => setSelectedCustomerId(selectedCustomer?.id === c.id ? null : c.id)}
                  >
                    {c.name}
                  </button>
                  <button type="button" className="saved-config-btn" onClick={() => setEditingCustomer({ id: c.id, name: c.name })}>Edit</button>
                  <button type="button" className="saved-config-btn saved-config-btn--danger" onClick={() => void handleDeleteCustomer(c.id)}>Delete</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="saved-configs-new-customer">
          <input
            className="saved-configs-customer-edit-input"
            placeholder="New customer name"
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreateCustomer()}
          />
          <button
            type="button"
            className="saved-config-btn saved-config-submit"
            onClick={() => void handleCreateCustomer()}
            disabled={!newCustomerName.trim()}
          >
            Add Customer
          </button>
        </div>
      </div>

      {/* Layout tabs */}
      <div className="saved-configs-tabs">
        <button
          type="button"
          className={`saved-configs-tab${customerTab === 'all' ? ' saved-configs-tab--active' : ''}`}
          onClick={() => setCustomerTab('all')}
        >
          All Layouts
        </button>
        <button
          type="button"
          className={`saved-configs-tab${customerTab === 'by-customer' ? ' saved-configs-tab--active' : ''}`}
          onClick={() => setCustomerTab('by-customer')}
        >
          By Customer
        </button>
      </div>

      {customerTab === 'all' && (
        <>
          {layoutsQuery.isLoading && (
            <div className="saved-configs-loading">Loading layouts...</div>
          )}

          {layoutsQuery.isError && (
            <div className="saved-configs-empty">
              {(layoutsQuery.error as Error)?.message ?? 'Failed to load layouts'}
            </div>
          )}

          {!layoutsQuery.isLoading && !layoutsQuery.isError && allLayouts.length > 0 && (
            <div className="saved-configs-grid">
              {allLayouts.map((layout) => (
                <SavedConfigCard
                  key={layout.id}
                  layout={layout}
                  onEdit={handleEdit}
                  onDelete={async (id) => {
                    setDeletingId(id);
                    try {
                      await deleteMutation.mutateAsync(id);
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  onDuplicate={(id) => cloneMutation.mutate(id, {
                    onError: () => setPageError('Failed to duplicate. Please try again.'),
                    onSuccess: () => setPageError(null),
                  })}
                  isDeleting={deletingId === layout.id}
                />
              ))}
              {newConfigCard}
            </div>
          )}

          {!layoutsQuery.isLoading && !layoutsQuery.isError && allLayouts.length === 0 && (
            <div className="saved-configs-empty">
              <p>No saved layouts yet.</p>
              <button
                className="saved-config-btn saved-config-submit"
                onClick={() => navigate('/')}
                type="button"
              >
                Start your first layout
              </button>
            </div>
          )}
        </>
      )}

      {customerTab === 'by-customer' && (
        <div className="saved-configs-by-customer">
          {/* Unassigned layouts */}
          <CustomerSection
            customerId={null}
            customerName="Unassigned"
            onEdit={handleEdit}
          />
          {/* Per-customer sections */}
          {customers.map((c) => (
            <CustomerSection
              key={c.id}
              customerId={c.id}
              customerName={c.name}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
