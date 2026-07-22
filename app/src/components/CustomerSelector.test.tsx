import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CustomerSelector } from './CustomerSelector';

const mockSetSelectedCustomerId = vi.fn();
const mockCreateCustomer = vi.fn();

vi.mock('../contexts/CustomerContext', () => ({
  useCustomers: () => ({
    customers: [
      { id: 1, name: 'Acme Corp' },
      { id: 2, name: 'Globex' },
    ],
    isLoading: false,
    selectedCustomer: null,
    setSelectedCustomerId: mockSetSelectedCustomerId,
    createCustomer: mockCreateCustomer,
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
  }),
}));

describe('CustomerSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders None and existing customers as options', () => {
    render(<CustomerSelector />);
    const select = screen.getByLabelText(/customer/i);
    expect(within(select).getByText(/none/i)).toBeInTheDocument();
    expect(within(select).getByText('Acme Corp')).toBeInTheDocument();
    expect(within(select).getByText('Globex')).toBeInTheDocument();
  });

  it('selecting None clears the customer', () => {
    render(<CustomerSelector />);
    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: '' } });
    expect(mockSetSelectedCustomerId).toHaveBeenCalledWith(null);
  });

  it('selecting an existing customer sets its id', () => {
    render(<CustomerSelector />);
    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: '2' } });
    expect(mockSetSelectedCustomerId).toHaveBeenCalledWith(2);
  });

  it('selecting "+ New customer…" reveals a text input', () => {
    render(<CustomerSelector />);
    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: '__new__' } });
    expect(screen.getByPlaceholderText(/new customer name/i)).toBeInTheDocument();
  });

  it('creates a new customer and selects it', async () => {
    mockCreateCustomer.mockResolvedValueOnce({ id: 3, name: 'Initech' });
    render(<CustomerSelector />);
    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: '__new__' } });

    const input = screen.getByPlaceholderText(/new customer name/i);
    fireEvent.change(input, { target: { value: 'Initech' } });
    fireEvent.click(screen.getByRole('button', { name: /create customer/i }));

    await vi.waitFor(() => {
      expect(mockCreateCustomer).toHaveBeenCalledWith('Initech');
      expect(mockSetSelectedCustomerId).toHaveBeenCalledWith(3);
    });
  });

  it('cancel button returns to the select without creating', () => {
    render(<CustomerSelector />);
    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: '__new__' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/customer/i).tagName).toBe('SELECT');
  });
});
