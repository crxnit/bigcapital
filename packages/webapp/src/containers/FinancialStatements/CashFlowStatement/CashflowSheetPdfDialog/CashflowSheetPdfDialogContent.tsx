// @ts-nocheck
import {
  DialogContent,
  PdfDocumentPreview,
  FormattedMessage as T,
} from '@/components';
import { AnchorButton } from '@blueprintjs/core';
import { useCashflowSheetPdf } from '@/hooks/query';
import { useCashFlowStatementContext } from '../CashFlowStatementProvider';
import { buildReportPdfFilename } from '../../common';

export default function CashflowSheetPdfDialogContent() {
  const { httpQuery } = useCashFlowStatementContext();
  const { isLoading, pdfUrl } = useCashflowSheetPdf(httpQuery);

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
          download={buildReportPdfFilename('cash-flow-statement', httpQuery)}
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
