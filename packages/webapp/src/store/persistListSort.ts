// @ts-nocheck
import { createTransform } from 'redux-persist';
import autoMergeLevel2 from 'redux-persist/lib/stateReconciler/autoMergeLevel2';
import storage from 'redux-persist/lib/storage';

/**
 * Persists ONLY `tableState.sortBy` for a list reducer, so the user's last
 * chosen column sort survives a full page reload while page index, filters,
 * selection, etc. fall back to their defaults. On the way out it keeps just
 * `{ sortBy }`; `autoMergeLevel2` (below) merges that back into the default
 * `tableState` rather than replacing the whole object.
 */
const persistSortByOnlyTransform = createTransform(
  (inboundState) => ({ sortBy: inboundState?.sortBy }),
  (outboundState) => outboundState,
  { whitelist: ['tableState'] },
);

/**
 * Builds a redux-persist config that remembers only a list's sort order.
 * Pass the same config object to `persistReducer` and `purgeStoredState`.
 * @param {string} key - The redux-persist storage key (e.g. 'bigcapital:bills').
 */
export const createListSortPersistConfig = (key) => ({
  key,
  storage,
  whitelist: ['tableState'],
  transforms: [persistSortByOnlyTransform],
  stateReconciler: autoMergeLevel2,
});
