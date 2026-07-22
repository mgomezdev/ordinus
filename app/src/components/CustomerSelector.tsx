import { useState } from 'react';
import { useCustomers } from '../contexts/CustomerContext';

const NEW_CUSTOMER_VALUE = '__new__';

export function CustomerSelector() {
  const { customers, selectedCustomer, setSelectedCustomerId, createCustomer } = useCustomers();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === NEW_CUSTOMER_VALUE) {
      setIsCreating(true);
      setNewName('');
      setError(null);
      return;
    }
    setSelectedCustomerId(value ? Number(value) : null);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewName('');
    setError(null);
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsSaving(true);
    setError(null);
    try {
      const customer = await createCustomer(trimmed);
      setSelectedCustomerId(customer.id);
      setIsCreating(false);
      setNewName('');
    } catch {
      setError('Failed to create customer');
    } finally {
      setIsSaving(false);
    }
  };

  if (isCreating) {
    return (
      <div className="customer-selector">
        <label htmlFor="customer-new-name" className="customer-selector-label">
          Customer:
        </label>
        <input
          id="customer-new-name"
          className="customer-selector-select"
          type="text"
          autoFocus
          placeholder="New customer name"
          value={newName}
          disabled={isSaving}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
            if (e.key === 'Escape') handleCancelCreate();
          }}
        />
        <button
          type="button"
          className="customer-selector-btn"
          aria-label="Create customer"
          title="Create customer"
          disabled={!newName.trim() || isSaving}
          onClick={() => void handleCreate()}
        >
          &#10003;
        </button>
        <button
          type="button"
          className="customer-selector-btn"
          aria-label="Cancel"
          title="Cancel"
          disabled={isSaving}
          onClick={handleCancelCreate}
        >
          &times;
        </button>
        {error && <span className="customer-selector-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="customer-selector">
      <label htmlFor="customer-select" className="customer-selector-label">
        Customer:
      </label>
      <select
        id="customer-select"
        className="customer-selector-select"
        value={selectedCustomer?.id ?? ''}
        onChange={handleSelectChange}
      >
        <option value="">— None —</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
        <option value={NEW_CUSTOMER_VALUE}>+ New customer…</option>
      </select>
    </div>
  );
}
