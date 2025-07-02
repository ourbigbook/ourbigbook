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
