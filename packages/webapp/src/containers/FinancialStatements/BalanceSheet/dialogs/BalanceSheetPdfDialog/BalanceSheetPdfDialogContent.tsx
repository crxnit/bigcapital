// @ts-nocheck
import {
  DialogContent,
  PdfDocumentPreview,
  FormattedMessage as T,
} from '@/components';
import { useBalanceSheetPdf } from '@/hooks/query';
import { AnchorButton } from '@blueprintjs/core';
import { useBalanceSheetContext } from '../../BalanceSheetProvider';
import { buildReportPdfFilename } from '../../../common';

export default function BalanceSheetPdfDialogContent() {
  const { httpQuery } = useBalanceSheetContext();
  const { isLoading, isLoaded, pdfUrl } = useBalanceSheetPdf({ ...httpQuery });

  return (
    <DialogContent>
      <div className="dialog__header-actions">
        <AnchorButton
          href={pdfUrl}
          target={'__blank'}
          disabled={!isLoaded}
          small
          minimal
          outlined
        >
          <T id={'pdf_preview.preview.button'} />
        </AnchorButton>

        <AnchorButton
          href={pdfUrl}
          download={buildReportPdfFilename('balance-sheet', httpQuery)}
          disabled={!isLoaded}
          small
          minimal
          outlined
        >
          <T id={'pdf_preview.download.button'} />
        </AnchorButton>
      </div>

      <PdfDocumentPreview
        height={760}
        width={1000}
        isLoading={isLoading}
        url={pdfUrl}
      />
    </DialogContent>
  );
}
