// @ts-nocheck
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useFormikContext } from 'formik';
import { useDueInvoices } from '@/hooks/query';
import { transformInvoicesNewPageEntries } from './utils';
import { usePaymentReceiveFormContext } from './PaymentReceiveFormProvider';

const PaymentReceiveInnerContext = createContext();

/**
 * Payment receive inner form provider.
 */
function PaymentReceiveInnerProvider({ ...props }) {
  const { isNewMode } = usePaymentReceiveFormContext();

  // Formik context.
  const {
    values: { customer_id: customerId },
    setFieldValue,
  } = useFormikContext();

  // Fetches customer receivable invoices.
  const {
    data: dueInvoices,
    isLoading: isDueInvoicesLoading,
    isFetching: isDueInvoicesFetching,
  } = useDueInvoices(customerId, {
    enabled: !!customerId && isNewMode,
    keepPreviousData: true,
    // Mirror the PaymentMade fix: background refetch on focus/reconnect
    // re-fires the effect and wipes typed payment_amount values.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Only repopulate `entries` when the customer changes. Avoids overwriting
  // user-typed payment_amount values whenever the query refetches.
  const lastLoadedCustomerId = useRef(null);
  useEffect(() => {
    if (
      !isDueInvoicesFetching &&
      dueInvoices &&
      isNewMode &&
      customerId !== lastLoadedCustomerId.current
    ) {
      lastLoadedCustomerId.current = customerId;
      setFieldValue('entries', transformInvoicesNewPageEntries(dueInvoices));
    }
  }, [
    isDueInvoicesFetching,
    dueInvoices,
    isNewMode,
    setFieldValue,
    customerId,
  ]);

  // Provider payload.
  const provider = {
    dueInvoices,
    isDueInvoicesLoading,
    isDueInvoicesFetching,
  };

  return <PaymentReceiveInnerContext.Provider value={provider} {...props} />;
}

const usePaymentReceiveInnerContext = () =>
  useContext(PaymentReceiveInnerContext);

export { PaymentReceiveInnerProvider, usePaymentReceiveInnerContext };
