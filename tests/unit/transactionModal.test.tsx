import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock useAuth to provide a parent context
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ parent: { id: 'p-1', family_id: 'fam-1' } }),
}));

// Mock supabase client to avoid real RPCs
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [{ id: 'tx' }], error: null }) },
}));

import { TransactionModal } from '@/components/banking/TransactionModal';

describe('TransactionModal form enabling', () => {
  it('enables submit when amount, description, and date are valid', async () => {
    const user = userEvent.setup();
    render(
      <TransactionModal
        isOpen
        onClose={() => {}}
        childId="child-1"
        childName="Avery"
        accountId="acct-1"
        type="deposit"
        onSuccess={() => {}}
      />
    );

    const submit = await screen.findByRole('button', { name: /Make Deposit/i });
    // Initially disabled due to missing fields
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Amount'), '12.34');
    await user.type(screen.getByLabelText('Description'), 'Gift');

    // Date defaults to today; with onChange mode, the form should now be valid
    expect(submit).toBeEnabled();
  });
});


