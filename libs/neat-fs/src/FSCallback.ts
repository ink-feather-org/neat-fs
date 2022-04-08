import { FileType } from './FileType'

export interface FSCallback {
  onPossibleUnknownChanges?: () => void
  onFileContentsChanged?: (filePath: string, type: FileType) => void
  onFileDeleted?: (filePath: string) => void
  onFileCreated?: (filePath: string, type: FileType) => void
}
