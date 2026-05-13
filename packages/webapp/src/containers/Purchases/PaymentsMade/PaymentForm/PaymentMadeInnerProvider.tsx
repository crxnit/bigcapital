// @ts-nocheck
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useFormikContext } from 'formik';
import { usePaymentMadeNewPageEntries } from '@/hooks/query';
import { usePaymentMadeFormContext } from './PaymentMadeFormProvider';
import { transformToNewPageEntries } from './utils';

const PaymentMadeInnerContext = createContext();

/**
 * Payment made inner form provider.
 */
function PaymentMadeInnerProvider({ ...props }) {
  // Payment made form context.
  const { isNewMode } = usePaymentMadeFormContext();

  // Formik context.
  const {
    values: { vendor_id: vendorId },
    setFieldValue,
  } = useFormikContext();

  const {
    data: newPageEntries,
    isLoading: isNewEntriesLoading,
    isFetching: isNewEntriesFetching,
  } = usePaymentMadeNewPageEntries(vendorId, {
    enabled: !!vendorId && isNewMode,
    keepPreviousData: true,
    // Background refetch on focus/reconnect re-fired the useEffect below and
    // wiped any payment_amount the user had typed. Disable both so the bills
    // table is loaded once per vendor selection and stays put.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Only repopulate `entries` when the vendor changes. The previous effect
  // ran on every `isNewEntriesFetching` toggle, so any background refetch
  // (default react-query behavior on window focus) overwrote typed
  // payment_amount values back to '' — hence the "touchy" feel where an
  // accidental click anywhere lost the user's progress.
  const lastLoadedVendorId = useRef(null);
  useEffect(() => {
    if (
      !isNewEntriesFetching &&
      newPageEntries &&
      isNewMode &&
      vendorId !== lastLoadedVendorId.current
    ) {
      lastLoadedVendorId.current = vendorId;
      setFieldValue('entries', transformToNewPageEntries(newPageEntries));
    }
  }, [
    isNewEntriesFetching,
    newPageEntries,
    isNewMode,
    setFieldValue,
    vendorId,
  ]);

  // Provider payload.
  const provider = {
    newPageEntries,
    isNewEntriesLoading,
    isNewEntriesFetching,
  };

  return <PaymentMadeInnerContext.Provider value={provider} {...props} />;
}

const usePaymentMadeInnerContext = () => useContext(PaymentMadeInnerContext);

export { PaymentMadeInnerProvider, usePaymentMadeInnerContext };
