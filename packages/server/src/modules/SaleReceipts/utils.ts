import { Contact } from '@/modules/Contacts/models/Contact';
import { ISaleReceiptBrandingTemplateAttributes } from './types/SaleReceipts.types';
import { contactAddressTextFormat } from '@/utils/address-text-format';

interface ISaleReceiptBrandingLine {
  item?: { name?: string };
  description?: string;
  rateFormatted?: string;
  quantityFormatted?: string;
  totalFormatted?: string;
}

interface ISaleReceiptBrandingInput {
  totalFormatted?: string;
  subtotalFormatted?: string;
  entries?: ISaleReceiptBrandingLine[];
  receiptNumber?: string;
  formattedReceiptDate?: string;
  adjustmentFormatted?: string;
  discountAmountFormatted?: string;
  discountPercentageFormatted?: string;
  customer?: Contact;
}

export const transformReceiptToBrandingTemplateAttributes = (
  saleReceipt: ISaleReceiptBrandingInput,
): Partial<ISaleReceiptBrandingTemplateAttributes> => {
  return {
    total: saleReceipt.totalFormatted,
    subtotal: saleReceipt.subtotalFormatted,
    lines: saleReceipt.entries?.map((entry) => ({
      item: entry.item.name,
      description: entry.description,
      rate: entry.rateFormatted,
      quantity: entry.quantityFormatted,
      total: entry.totalFormatted,
    })),
    receiptNumber: saleReceipt.receiptNumber,
    receiptDate: saleReceipt.formattedReceiptDate,
    adjustment: saleReceipt.adjustmentFormatted,
    discount: saleReceipt.discountAmountFormatted,
    discountLabel: saleReceipt.discountPercentageFormatted
      ? `Discount [${saleReceipt.discountPercentageFormatted}]`
      : 'Discount',
    customerAddress: contactAddressTextFormat(saleReceipt.customer),
  };
};

export const transformReceiptToMailDataArgs = (saleReceipt: any) => {
  return {
    'Customer Name': saleReceipt.customer.displayName,
    'Receipt Number': saleReceipt.receiptNumber,
    'Receipt Date': saleReceipt.formattedReceiptDate,
    'Receipt Amount': saleReceipt.formattedAmount,
  };
};
