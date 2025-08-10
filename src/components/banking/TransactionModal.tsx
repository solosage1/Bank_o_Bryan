'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarDays, DollarSign, Minus, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { transactionSchema, type TransactionFormData } from '@/lib/schemas/transaction';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { isE2EEnabled, supabaseWithTimeout, processTransactionLocally } from '@/lib/e2e';

// schema now lives in @/lib/schemas/transaction

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  childId: string;
  childName: string;
  accountId: string;
  type: 'deposit' | 'withdrawal';
  onSuccess: () => void;
  availableBalanceCents?: number;
}

export function TransactionModal({
  isOpen,
  onClose,
  childId,
  childName,
  accountId,
  type,
  onSuccess,
  availableBalanceCents
}: TransactionModalProps) {
  const { parent } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    mode: 'onChange',
    defaultValues: {
      amount: '',
      description: '',
      transactionDate: new Date(),
    },
  });

  // Ensure initial default values are validated so isValid reflects them
  useEffect(() => {
    // Trigger once after mount to calculate initial isValid with defaults
    form.trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountStr = form.watch('amount');
  const amountCents = (() => {
    const num = parseFloat(amountStr || '0');
    return Number.isFinite(num) ? Math.round(num * 100) : 0;
  })();
  const insufficientFunds = type === 'withdrawal' && availableBalanceCents != null && amountCents > availableBalanceCents;

  const onSubmit = async (data: TransactionFormData) => {
    if (!parent) return;

    try {
      // Guard against missing account id which would omit p_account_id in the RPC payload
      if (!accountId) {
        const message = 'Missing account ID for this transaction.';
        form.setError('root', { message });
        toast({ title: 'Transaction failed', description: message, variant: 'destructive' });
        return;
      }

      if (type === 'withdrawal' && availableBalanceCents != null) {
        const cents = Math.round(parseFloat(data.amount) * 100);
        if (cents > availableBalanceCents) {
          form.setError('amount', { message: 'Insufficient funds' });
          return;
        }
      }
      setIsSubmitting(true);

      const cents = Math.round(parseFloat(data.amount) * 100);
      try {
        await supabaseWithTimeout(async () => {
          // Prefer PRD signature (cents-based) and fall back to legacy (decimal-based)
          const prdPayload: any = {
            p_account_id: accountId,
            p_type: type,
            p_amount_cents: cents,
            p_description: data.description,
            p_parent_id: parent.id,
            p_transaction_date: format(data.transactionDate, 'yyyy-MM-dd'),
            p_require_confirm: false,
          };
          let { error } = await supabase.rpc('process_transaction', prdPayload as any);
          if (error) {
            const looksLikeMissingOrMismatch =
              (error as any)?.code === 'PGRST202' ||
              /No function/i.test((error as any)?.message || '') ||
              /not found|404/i.test((error as any)?.details || '');
            if (looksLikeMissingOrMismatch) {
              const legacyPayload: any = {
                p_account_id: accountId,
                p_type: type,
                p_amount: parseFloat(data.amount),
                p_description: data.description,
                p_parent_id: parent.id,
                p_transaction_date: format(data.transactionDate, 'yyyy-MM-dd'),
              };
              ({ error } = await supabase.rpc('process_transaction', legacyPayload as any));
            }
          }
          if (error) throw error;
          return null as unknown as any;
        }, 6000);
      } catch (err) {
        if (isE2EEnabled()) {
          // Local fallback
          await processTransactionLocally({
            accountId,
            type,
            amount_cents: cents,
            description: data.description,
            date: format(data.transactionDate, 'yyyy-MM-dd'),
          });
        } else {
          throw err;
        }
      }

      // Log audit event (best-effort, timeboxed)
      if (parent.family_id) {
        try {
          await supabaseWithTimeout(async () => supabase.rpc('log_audit_event', {
            p_family_id: parent.family_id as string,
            p_user_type: 'parent',
            p_user_id: parent.id,
            p_action: `${type === 'deposit' ? 'Deposited' : 'Withdrew'} $${data.amount} ${type === 'deposit' ? 'to' : 'from'} ${childName}'s account`,
            p_entity_type: 'transaction',
            p_entity_id: accountId,
            p_metadata: {
              amount: parseFloat(data.amount),
              description: data.description,
              child_id: childId,
              transaction_date: format(data.transactionDate, 'yyyy-MM-dd')
            }
          }), 6000);
        } catch (_) { /* noop */ }
      }

      form.reset();
      onSuccess();
      onClose();
      toast({
        title: 'Success',
        description: `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} of $${parseFloat(data.amount).toFixed(2)} processed for ${childName}.`
      });
    } catch (error) {
      console.error('Transaction error:', error);
      const err: any = error;
      let message = 'Failed to process transaction';
      const isMissingRpc = err?.code === 'PGRST202' || /Could not find the function\s+public\.process_transaction/i.test(String(err?.message || ''));
      if (isMissingRpc) {
        message = 'Transaction service is unavailable. Ensure database migrations are applied (process_transaction RPC) and try again.';
      } else {
        const parts: string[] = [];
        if (err?.message) parts.push(String(err.message));
        if (err?.code) parts.push(`code: ${err.code}`);
        if (err?.details) parts.push(String(err.details));
        if (err?.hint) parts.push(String(err.hint));
        if (parts.length) message = parts.join(' — ');
      }
      form.setError('root', { message });
      toast({ title: 'Transaction failed', description: message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle = type === 'deposit' ? 'Make Deposit' : 'Make Withdrawal';
  const modalDescription = `${type === 'deposit' ? 'Add money to' : 'Remove money from'} ${childName}'s account`;
  const ButtonIcon = type === 'deposit' ? Plus : Minus;
  const buttonColor = type === 'deposit'
    ? 'bg-green-600 hover:bg-green-700 text-white'
    : 'bg-red-600 hover:bg-red-700 text-white';

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" onEscapeKeyDown={onClose}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center',
                    type === 'deposit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  )}>
                    <ButtonIcon aria-hidden="true" className="w-4 h-4" />
                  </div>
                  <span>{modalTitle}</span>
                </DialogTitle>
                <DialogDescription>
                  {modalDescription}
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <div className="relative">
                            <DollarSign aria-hidden="true" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <FormControl>
                            <Input
                              placeholder="0.00"
                              type="number"
                              step="0.01"
                              min="0.01"
                              max="10000"
                              className="pl-10"
                              {...field}
                            />
                          </FormControl>
                        </div>
                        <FormDescription>
                          Enter the amount to {type}
                        </FormDescription>
                        {insufficientFunds && (
                          <div className="text-sm text-red-600">Cannot withdraw more than available balance.</div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={`Reason for ${type}...`}
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          You can provide details about this transaction.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="transactionDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Transaction Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? (
                                  format(field.value, 'PPP')
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarDays aria-hidden="true" className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                if (date) {
                                  form.setValue('transactionDate', date, { shouldValidate: true, shouldDirty: true });
                                }
                              }}
                              disabled={(date) =>
                                date > new Date() || date < new Date('1900-01-01')
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          When did this transaction occur?
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.formState.errors.root && (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                      {form.formState.errors.root.message}
                    </div>
                  )}

                  <div className="flex space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting || !form.formState.isValid || insufficientFunds}
                      className={cn('flex-1', buttonColor)}
                    >
                      {isSubmitting ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Processing...</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <ButtonIcon className="w-4 h-4" />
                          <span>{modalTitle}</span>
                        </div>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}