// @ts-nocheck
import { useRef, useState } from 'react';
import { isEmpty } from 'lodash';
import { Button, Intent, Text, Spinner } from '@blueprintjs/core';
import { AppToaster, Box, Group, Icon, Stack } from '@/components';
import {
  ImportDropzoneField,
  ImportDropzoneFieldProps,
} from '@/containers/Import/ImportDropzoneFile';
import { useUncontrolled } from '@/hooks/useUncontrolled';
import {
  useGetPresignedUrlAttachment,
  useUploadAttachments,
} from '@/hooks/query/attachments';
import styles from './UploadAttachmentPopoverContent.module.scss';
import { MIME_TYPES } from '@/components/Dropzone/mine-types';
import { formatBytes } from '@/utils/format-bytes';

const MAX_ATTACHMENT_FILES = 10;
const MAX_ATTACHMENT_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

interface AttachmentFileCommon {
  originName: string;
  key: string;
  size: number;
  mimeType: string;
}
interface AttachmentFileLoaded extends AttachmentFileCommon {}
interface AttachmentFileLoading extends AttachmentFileCommon {
  loading: boolean;
}
type AttachmentFile = AttachmentFileLoaded | AttachmentFileLoading;

interface UploadAttachmentsPopoverContentProps {
  initialValue?: AttachmentFile[];
  value?: AttachmentFile[];
  onChange?: (value: AttachmentFile[]) => void;
  onUploadedChange?: (value: AttachmentFile[]) => void;
  dropzoneFieldProps?: ImportDropzoneFieldProps;
}

/**
 * Uploads and list the attachments with ability to delete particular attachment.
 * @param {UploadAttachmentsPopoverContentProps}
 */
export function UploadAttachmentsPopoverContent({
  initialValue,
  value,
  onChange,
  onUploadedChange,
  dropzoneFieldProps,
}: UploadAttachmentsPopoverContentProps) {
  // Controlled/uncontrolled value state.
  const [localFiles, handleFilesChange] = useUncontrolled<AttachmentFile[]>({
    finalValue: [],
    initialValue,
    value,
    onChange: onChange,
  });
  // Ref mirrors `localFiles`. With multi-file uploads firing in parallel, each
  // mutation's onSuccess closure would otherwise capture stale state and clobber
  // peers' updates. Reading/writing the ref keeps all in-flight updates linear.
  const localFilesRef = useRef<AttachmentFile[]>(localFiles);
  localFilesRef.current = localFiles;

  // Stops loading of the given attachment key and updates it to new key,
  // that came from the server-side after uploading is done.
  const stopLoadingAttachment = (
    files: AttachmentFile[],
    internalKey: string,
    newKey: string,
  ) => {
    return files.map((localFile) => {
      if (localFile.key === internalKey) {
        return {
          ...localFile,
          key: newKey,
          loading: false,
        };
      }
      return localFile;
    });
  };
  // Uploads the attachments.
  const { mutateAsync: uploadAttachments } = useUploadAttachments({
    onSuccess: (data, formData) => {
      const updated = stopLoadingAttachment(
        localFilesRef.current,
        formData.get('internalKey'),
        data.key,
      );
      localFilesRef.current = updated;
      handleFilesChange(updated);
      onUploadedChange && onUploadedChange(updated);
    },
  });
  // Deletes the attachment of the given file key.
  const handleClick = (key: string) => () => {
    const updatedFiles = localFilesRef.current.filter(
      (file) => file.key !== key,
    );
    localFilesRef.current = updatedFiles;
    handleFilesChange(updatedFiles);
    onUploadedChange && onUploadedChange(updatedFiles);
  };

  // Handle dropped files. Multi-file: prepend N pending entries in a single
  // state update, then fire N uploads in parallel. onSuccess folds each result
  // into the shared ref so completions don't clobber each other.
  const handleDropFiles = (files: File[]) => {
    if (!files.length) return;

    const pending: AttachmentFileLoading[] = files.map((file) => ({
      originName: file.name,
      size: file.size,
      // Random suffix avoids key collisions on rapid drops.
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      loading: true,
    }));

    const next = [...pending, ...localFilesRef.current];
    localFilesRef.current = next;
    handleFilesChange(next);

    pending.forEach((entry, i) => {
      const formData = new FormData();
      formData.append('file', files[i]);
      formData.append('internalKey', entry.key);
      uploadAttachments(formData);
    });
  };

  // Surface dropzone rejections (oversize, wrong MIME, too many at once) as a
  // toast — silent rejects are the worst UX failure mode for file pickers.
  const handleRejectFiles = (rejections: any[]) => {
    if (!rejections?.length) return;
    const reasons = new Set<string>();
    rejections.forEach((r) =>
      (r.errors || []).forEach((e: any) => reasons.add(e.code || e.message)),
    );
    const hint = reasons.has('file-too-large')
      ? `Files must be ${MAX_ATTACHMENT_FILE_SIZE / (1024 * 1024)} MB or smaller.`
      : reasons.has('too-many-files')
        ? `Drop up to ${MAX_ATTACHMENT_FILES} files at a time.`
        : reasons.has('file-invalid-type')
          ? `Allowed types: PDF, DOC, DOCX, PNG, JPEG.`
          : `Some files were rejected.`;
    AppToaster.show({
      message: `${rejections.length} file(s) rejected. ${hint}`,
      intent: Intent.DANGER,
    });
  };

  return (
    <div className={styles.content}>
      <div>
        <Text className={styles.label}>Attach documents</Text>
        <Stack spacing={0}>
          <ImportDropzoneField
            uploadIcon={null}
            value={null}
            title={''}
            subtitle={'Drag and drop files here or choose files'}
            classNames={{ root: styles.dropzoneRoot }}
            dropzoneProps={{
              multiple: true,
              maxFiles: MAX_ATTACHMENT_FILES,
              maxSize: MAX_ATTACHMENT_FILE_SIZE,
              onDrop: handleDropFiles,
              onReject: handleRejectFiles,
              accept: [
                MIME_TYPES.doc,
                MIME_TYPES.docx,
                MIME_TYPES.pdf,
                MIME_TYPES.png,
                MIME_TYPES.jpeg,
              ],
            }}
            {...dropzoneFieldProps}
          />
          <Group className={styles.hintText}>
            <Box>Up to {MAX_ATTACHMENT_FILES} files, 25MB each</Box>
          </Group>
        </Stack>

        {!isEmpty(localFiles) && (
          <Stack spacing={0} className={styles.attachments}>
            {localFiles.map((localFile: AttachmentFile, index: number) => (
              <Group
                position={'space-between'}
                className={styles.attachmentItem}
                key={index}
              >
                <Group spacing={14} className={styles.attachmentContent}>
                  <div className={styles.attachmentIconWrap}>
                    {localFile.loading ? (
                      <Spinner size={20} />
                    ) : (
                      <Icon
                        icon={'media'}
                        iconSize={16}
                        className={styles.attachmentIcon}
                      />
                    )}
                  </div>
                  <Stack spacing={2}>
                    <Text className={styles.attachmentFilenameText}>
                      {localFile.originName}
                    </Text>
                    {localFile.loading ? (
                      <Text className={styles.attachmentLoadingText}>
                        Loading...
                      </Text>
                    ) : (
                      <Text className={styles.attachmentSizeText}>
                        {formatBytes(localFile.size)}
                      </Text>
                    )}
                  </Stack>
                </Group>

                {!localFile.loading && (
                  <Group spacing={2}>
                    <ViewButton fileKey={localFile.key} />
                    <Button
                      small
                      minimal
                      intent={Intent.DANGER}
                      onClick={handleClick(localFile.key)}
                    >
                      <Icon icon={'trash-16'} iconSize={16} />
                    </Button>
                  </Group>
                )}
              </Group>
            ))}
          </Stack>
        )}
      </div>
    </div>
  );
}

const ViewButton = ({ fileKey }: { fileKey: string }) => {
  const [isLoading, setLoading] = useState<boolean>(false);
  const { mutateAsync: getAttachmentPresignedUrl } =
    useGetPresignedUrlAttachment();

  const handleViewBtnClick = (key: string) => () => {
    setLoading(true);

    getAttachmentPresignedUrl(key).then((data) => {
      window.open(data.presigned_url);
      setLoading(false);
    });
  };

  return (
    <Button
      small
      minimal
      onClick={handleViewBtnClick(fileKey)}
      disabled={isLoading}
      intent={Intent.PRIMARY}
    >
      View
    </Button>
  );
};
