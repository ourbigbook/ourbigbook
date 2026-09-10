import { UserType } from 'front/types/UserType'

/* Directory listing entry */
export interface UploadEntryType {
  path: string;
};

export interface UploadType extends UploadEntryType {
  bytes: string;
  contentType: string;
  createdAt: string;
  hash: string;
  size: number;
  updatedAt: string;
};

export interface UploadIndexType extends Pick<UploadType, 'path' | 'contentType' | 'size' | 'createdAt' | 'updatedAt'> {
  author: Pick<UserType, 'displayName' | 'effectiveImage' | 'score' | 'username'> | null;
  url: string | null;
  previewUrl: string | null;
}
