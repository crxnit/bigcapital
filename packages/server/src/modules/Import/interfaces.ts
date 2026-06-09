import { IModelMetaField2 } from '@/interfaces/Model';
import { ImportModelShape } from './models/Import';

export interface ImportMappingAttr {
  from: string;
  to: string;
  group?: string;
  dateFormat?: string;
}

export interface ImportValidationError {
  index: number;
  property: string;
  constraints: Record<string, string>;
}

export type ResourceMetaFieldsMap = { [key: string]: IModelMetaField2 };

export interface ImportInsertError {
  rowNumber: number;
  errorCode: string;
  errorMessage: string;
}

export interface ImportFileUploadPOJO {
  import: {
    importId: string;
    resource: string;
  };
  sheetColumns: string[];
  resourceColumns: {
    key: string;
    name: string;
    required?: boolean;
    hint?: string;
  }[];
}

export interface ImportFileMapPOJO {
  import: {
    importId: string;
    resource: string;
  };
}

export interface ImportSkippedInfo {
  rowNumber: number;
  uniqueValue: unknown;
  reason: string;
}

export interface ImportFilePreviewPOJO {
  resource: string;
  createdCount: number;
  skippedCount: number;
  totalCount: number;
  errorsCount: number;
  errors: ImportInsertError[];
  skipped: ImportSkippedInfo[];
  unmappedColumns: string[];
  unmappedColumnsCount: number;
}

export interface ImportOperSuccess {
  data: unknown;
  index: number;
}

export interface ImportOperError {
  error: ImportInsertError[];
  index: number;
}

export interface ImportOperSkipped {
  index: number;
  data: unknown;
  rowNumber: number;
  uniqueValue: unknown;
  reason: string;
}

/**
 * Marker an `Importable.importable()` returns to signal a row was intentionally
 * skipped (e.g. a re-import dedupe) rather than created. The framework buckets
 * it as "skipped" instead of "created" so the import report is honest. Default
 * behaviour is unchanged for importables that never skip.
 */
export class ImportSkippedRow {
  constructor(
    public readonly data: unknown,
    public readonly reason: string = 'Skipped (duplicate of an already-imported row).',
  ) {}
}

export interface ImportableContext {
  import: ImportModelShape;
  rowIndex: number;
}

export const ImportDateFormats = [
  'yyyy-MM-dd',
  'dd.MM.yy',
  'MM/dd/yy',
  'dd/MMM/yyyy',
];

export interface IImportFileCommitedEventPayload {
  importId: string;
  meta: ImportFilePreviewPOJO;
}
