import { pickBy } from 'lodash';
import { Contact } from '@/modules/Contacts/models/Contact';
import { InvoicePdfTemplateAttributes } from './SaleInvoice.types';
import { contactAddressTextFormat } from '@/utils/address-text-format';

interface ISaleInvoicePdfLine {
  item?: { name?: string };
  description?: string;
  rateFormatted?: string;
  quantityFormatted?: string;
  totalFormatted?: string;
}

interface ISaleInvoicePdfTax {
  name?: string;
  taxRateAmountFormatted?: string;
}

interface ISaleInvoicePdfInput {
  dueDateFormatted?: string;
  invoiceDateFormatted?: string;
  invoiceNo?: string;
  totalFormatted?: string;
  subtotalFormatted?: string;
  paymentAmountFormatted?: string;
  dueAmountFormatted?: string;
  termsConditions?: string;
  invoiceMessage?: string;
  entries?: ISaleInvoicePdfLine[];
  taxes?: ISaleInvoicePdfTax[];
  discountAmountFormatted?: string;
  discountPercentageFormatted?: string;
  customer?: { displayName?: string } & Record<string, any>;
}

export const mergePdfTemplateWithDefaultAttributes = (
  brandingTemplate?: Record<string, any>,
  defaultAttributes: Record<string, any> = {},
) => {
  const brandingAttributes = pickBy(
    brandingTemplate,
    (val, key) => val !== null && Object.keys(defaultAttributes).includes(key),
  );
  return {
    ...defaultAttributes,
    ...brandingAttributes,
  };
};

export const transformInvoiceToPdfTemplate = (
  invoice: ISaleInvoicePdfInput,
): Partial<InvoicePdfTemplateAttributes> => {
  return {
    dueDate: invoice.dueDateFormatted,
    dateIssue: invoice.invoiceDateFormatted,
    invoiceNumber: invoice.invoiceNo,

    total: invoice.totalFormatted,
    subtotal: invoice.subtotalFormatted,
    paymentMade: invoice.paymentAmountFormatted,
    dueAmount: invoice.dueAmountFormatted,

    termsConditions: invoice.termsConditions,
    statement: invoice.invoiceMessage,

    lines: invoice.entries.map((entry) => ({
      item: entry.item.name,
      description: entry.description,
      rate: entry.rateFormatted,
      quantity: entry.quantityFormatted,
      total: entry.totalFormatted,
    })),
    taxes: invoice.taxes.map((tax) => ({
      label: tax.name,
      amount: tax.taxRateAmountFormatted,
    })),
    discount: invoice.discountAmountFormatted,
    discountLabel: invoice.discountPercentageFormatted
      ? `Discount [${invoice.discountPercentageFormatted}]`
      : 'Discount',
    customerAddress: contactAddressTextFormat(invoice.customer as Contact),
  };
};
