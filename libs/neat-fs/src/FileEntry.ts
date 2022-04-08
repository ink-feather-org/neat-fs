import FileType from './FileType'

/**
 * This should be shallow copyable.
 */
export interface FileMeta {
  /**
   * Last modified in ms UTC
   */
  mtime: number
}

export interface FileEntry {
  filename: string
  filePath: string
  fileType: FileType
  destination?: string
  meta: FileMeta
}

export interface BasicFileEntry {
  filename: string
  filePath: string
  fileType: FileType.FILE | FileType.DIRECTORY
  meta: FileMeta
}
