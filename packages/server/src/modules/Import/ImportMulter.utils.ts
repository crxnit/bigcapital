import * as Multer from 'multer';
import * as path from 'path';
import { ServiceError } from '../Items/ServiceError';

export const getImportsStoragePath = () => {
  return path.join(global.__static_dirname, `/imports`);
};

const ALLOWED_SHEET_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

export function allowSheetExtensions(req, file, cb) {
  // Gate on the file extension, not MIME — browsers send inconsistent MIME
  // types for .csv (text/plain, application/octet-stream, ...), so a MIME
  // allowlist both rejects legit CSVs and lets through anything mislabelled.
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_SHEET_EXTENSIONS.includes(ext)) {
    cb(new ServiceError('IMPORTED_FILE_EXTENSION_INVALID'));
    return;
  }
  cb(null, true);
}

const storage = Multer.diskStorage({
  destination: function (req, file, cb) {
    const path = getImportsStoragePath();
    cb(null, path);
  },
  filename: function (req, file, cb) {
    // Add the creation timestamp to clean up temp files later.
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix);
  },
});

export const uploadImportFileMulterOptions = {
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: allowSheetExtensions,
};
