// @ts-nocheck
import { createReducer } from '@reduxjs/toolkit';
import { persistReducer, purgeStoredState } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { createTableStateReducers } from '@/store/tableState.reducer';
import t from '@/store/types';

export const defaultTableQuery = {
  pageSize: 20,
  pageIndex: 0,
  filterRoles: [],
  viewSlug: null,
  // Default the invoices list to newest-first by invoice date.
  // `transformTableStateToQuery` maps this to `column_sort_by`/`sort_order`,
  // the same server-side sort path a column-header click uses.
  sortBy: [{ id: 'invoice_date', desc: true }],
};

const initialState = {
  tableState: defaultTableQuery,
  selectedRows: [],
};

const STORAGE_KEY = 'bigcapital:invoices';

const CONFIG = {
  key: STORAGE_KEY,
  whitelist: [],
  storage,
};

const reducerInstance = createReducer(initialState, {
  ...createTableStateReducers('INVOICES', defaultTableQuery),

  [`INVOICES/SET_SELECTED_ROWS`]: (state, action) => {
    state.selectedRows = action.payload;
  },

  [`INVOICES/RESET_SELECTED_ROWS`]: (state) => {
    state.selectedRows = [];
  },

  [t.RESET]: () => {
    purgeStoredState(CONFIG);
  },
});

export default persistReducer(CONFIG, reducerInstance);
