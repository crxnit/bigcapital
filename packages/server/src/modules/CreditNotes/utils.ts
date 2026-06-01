import { Contact } from '@/modules/Contacts/models/Contact';
import { CreditNotePdfTemplateAttributes } from './types/CreditNotes.types';
import { contactAddressTextFormat } from '@/utils/address-text-format';

interface ICreditNotePdfLine {
  item?: { name?: string };
  description?: string;
  rateFormatted?: string;
  quantityFormatted?: string;
  totalFormatted?: string;
}

interface ICreditNotePdfInput {
  formattedCreditNoteDate?: string;
  creditNoteNumber?: string;
  formattedAmount?: string;
  formattedSubtotal?: string;
  entries?: ICreditNotePdfLine[];
  note?: string;
  termsConditions?: string;
  customer?: Contact;
}

export const transformCreditNoteToPdfTemplate = (
  creditNote: ICreditNotePdfInput,
): Partial<CreditNotePdfTemplateAttributes> => {
  return {
    creditNoteDate: creditNote.formattedCreditNoteDate,
    creditNoteNumebr: creditNote.creditNoteNumber,

    total: creditNote.formattedAmount,
    subtotal: creditNote.formattedSubtotal,

    lines: creditNote.entries?.map((entry) => ({
      item: entry.item.name,
      description: entry.description,
      rate: entry.rateFormatted,
      quantity: entry.quantityFormatted,
      total: entry.totalFormatted,
    })),
    customerNote: creditNote.note,
    termsConditions: creditNote.termsConditions,
    customerAddress: contactAddressTextFormat(creditNote.customer),
  };
};
