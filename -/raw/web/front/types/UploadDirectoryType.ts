export interface UploadDirectoryEntryType {
  path: string;
}

export interface UploadDirectoryType extends UploadDirectoryEntryType {
  createdAt: string;
  updatedAt: string;
};
