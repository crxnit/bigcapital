// @ts-nocheck
import {
  DialogContent,
  PdfDocumentPreview,
  FormattedMessage as T,
} from '@/components';
import { AnchorButton } from '@blueprintjs/core';
import { useTrialBalanceSheetPdf } from '@/hooks/query';
import { useTrialBalanceSheetContext } from '../../TrialBalanceProvider';
import { buildReportPdfFilename } from '../../../common';

export default function TrialBalanceSheetPdfDialogContent() {
  const { httpQuery } = useTrialBalanceSheetContext();
  const { isLoading, pdfUrl } = useTrialBalanceSheetPdf(httpQuery);

  return (
    <DialogContent>
      <div className="dialog__header-actions">
        <AnchorButton
          href={pdfUrl}
          target={'__blank'}
          minimal={true}
          outlined={true}
        >
          <T id={'pdf_preview.preview.button'} />
        </AnchorButton>

        <AnchorButton
          href={pdfUrl}
          download={buildReportPdfFilename('trial-balance-sheet', httpQuery)}
          minimal={true}
          outlined={true}
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
