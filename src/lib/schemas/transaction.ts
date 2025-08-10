import * as z from 'zod';

export const transactionSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    }, 'Amount must be a positive number'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(200, 'Description must be less than 200 characters'),
  transactionDate: z.date({
    required_error: 'Transaction date is required',
  }),
});

export type TransactionFormData = z.infer<typeof transactionSchema>;


