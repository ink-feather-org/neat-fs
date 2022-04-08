import { FileEntry, FileMeta } from '../FileEntry'

export interface Backend {
  readFile(filePath: string): Promise<Uint8Array>

  /**
   * The returned meta object has to be safe to modify.
   */
  readDir(filePath: string): Promise<FileEntry[]>

  /**
   * The returned meta object has to be safe to modify.
   */
  linfo(filePath: string): Promise<FileEntry | undefined>

  /**
   * The bulk functions arguments have to fulfil the following requirements or the function may misbehave.
   * The meta objects are safe to store. They won't be modified any more.
   * @param filesToDelete If a file is deleted or its type changes or a symlinks target changes it has to be added to this list. Folders are deleted recursively their contents must not be in this list.
   * @param foldersToCreate Folders are not created recursively all parents must be in this list. The order is important too. The parents have to be listed before the children.
   * @param filesToWrite The folder for the files have to exist. Existing files are overwritten.
   * @param symlinksToCreate The symlinks to create. If the symlink exists an error is thrown.
   * @param metaUpdates The meta data to update.
   */
  bulk(filesToDelete: string[], foldersToCreate: BackendMeta[], filesToWrite: BackendFile[], symlinksToCreate: BackendLink[], metaUpdates: BackendMeta[]): Promise<void>
}

export interface BackendMeta {
  filePath: string
  meta: FileMeta
}

export interface BackendFile {
  filePath: string
  data: Uint8Array
  meta: FileMeta
}

export interface BackendLink {
  filePath: string
  destination: string
  meta: FileMeta
}
