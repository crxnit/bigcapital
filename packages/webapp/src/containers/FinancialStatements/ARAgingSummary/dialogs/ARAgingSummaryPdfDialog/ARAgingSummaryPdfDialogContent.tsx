// @ts-nocheck
import {
  DialogContent,
  PdfDocumentPreview,
  FormattedMessage as T,
} from '@/components';
import { useARAgingSummaryPdf } from '@/hooks/query';
import { AnchorButton } from '@blueprintjs/core';
import { useARAgingSummaryContext } from '../../ARAgingSummaryProvider';
import { buildReportPdfFilename } from '../../../common';

export default function ARAgingSummaryPdfDialogContent() {
  const { httpQuery } = useARAgingSummaryContext();
  const { isLoading, pdfUrl } = useARAgingSummaryPdf(httpQuery);

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
          download={buildReportPdfFilename('ar-aging-summary', httpQuery)}
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
