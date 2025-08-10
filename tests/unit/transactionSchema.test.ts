import { describe, it, expect } from 'vitest';
import { transactionSchema } from '@/lib/schemas/transaction';

describe('transactionSchema', () => {
  it('accepts valid input', () => {
    const now = new Date();
    const data = { amount: '10.50', description: 'Birthday gift', transactionDate: now };
    const parsed = transactionSchema.parse(data);
    expect(parsed).toEqual(data);
  });

  it('rejects empty amount', () => {
    const res = transactionSchema.safeParse({ amount: '', description: 'x', transactionDate: new Date() });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.amount?.[0]).toMatch(/Amount is required/i);
    }
  });

  it('rejects non-positive amount', () => {
    const res = transactionSchema.safeParse({ amount: '0', description: 'x', transactionDate: new Date() });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.amount?.[0]).toMatch(/positive number/i);
    }
  });

  it('rejects empty description', () => {
    const res = transactionSchema.safeParse({ amount: '1', description: '', transactionDate: new Date() });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.description?.[0]).toMatch(/Description is required/i);
    }
  });

  it('rejects missing date', () => {
    const res = transactionSchema.safeParse({ amount: '1', description: 'x', transactionDate: undefined as unknown as Date });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.transactionDate?.[0]).toMatch(/Transaction date is required/i);
    }
  });
});


