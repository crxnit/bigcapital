export const UncategorizedBankTransactionMeta = {
  defaultFilterField: 'createdAt',
  defaultSort: {
    sortOrder: 'DESC',
    sortField: 'created_at',
  },
  importable: true,
  fields: {
    date: {
      name: 'Date',
      column: 'date',
      fieldType: 'date',
    },
    payee: {
      name: 'Payee',
      column: 'payee',
      fieldType: 'text',
    },
    description: {
      name: 'Description',
      column: 'description',
      fieldType: 'text',
    },
    referenceNo: {
      name: 'Reference No.',
      column: 'reference_no',
      fieldType: 'text',
    },
    amount: {
      name: 'Amount',
      column: 'Amount',
      fieldType: 'numeric',
      required: true,
    },
    account: {
      name: 'Account',
      column: 'account_id',
      fieldType: 'relation',
      to: { model: 'Account', to: 'id' },
    },
    createdAt: {
      name: 'Created At',
      column: 'createdAt',
      fieldType: 'date',
      importable: false,
    },
  },
  fields2: {
    date: {
      name: 'Date',
      fieldType: 'date',
      required: true,
    },
    payee: {
      name: 'Payee',
      fieldType: 'text',
    },
    description: {
      name: 'Description',
      fieldType: 'text',
    },
    referenceNo: {
      name: 'Reference No.',
      fieldType: 'text',
    },
    amount: {
      name: 'Amount',
      fieldType: 'number',
      required: true,
    },
    type: {
      name: 'Type',
      fieldType: 'enumeration',
      // Optional. When present, the importable forces the amount sign:
      // deposit/credit → positive, withdrawal/debit → negative. When absent,
      // the amount's existing sign is preserved (so signed-amount CSVs still
      // work). The enum parser is case-insensitive and matches key or label.
      options: [
        { key: 'deposit', label: 'Deposit' },
        { key: 'credit', label: 'Credit' },
        { key: 'withdrawal', label: 'Withdrawal' },
        { key: 'debit', label: 'Debit' },
      ],
    },
  },
};
