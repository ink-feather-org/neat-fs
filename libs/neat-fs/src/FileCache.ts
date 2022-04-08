import { Mutex } from '@ink-feather-org/ts-mutex'
import { PromiseChain } from '@ink-feather-org/ts-utils'

import { BackendFile, BackendLink, BackendMeta } from './backends/Backend'
import { CachedFile, CachedFileType } from './CachedFile'
import { Path } from './Path'
import { LockedBackend } from './backends/LockedBackend'
import { FSCallback } from './FSCallback'
import { BasicFileEntry, FileEntry } from './FileEntry'
import { FileType } from './FileType'
import { FSError, FSErrorCode } from './FSError'

/**
 * @internal
 */
export class FileCache {
  private root?: CachedFile

  private promiseChain = new PromiseChain()

  private readonly mutex: Mutex

  constructor(public readonly backend: LockedBackend, public readonly callback: FSCallback) {
    this.mutex = this.backend.createMutex()
  }

  private async getFile(filePath: string): Promise<CachedFile> {
    const splitPath = Path.split(filePath)
    splitPath.splice(0, 1)
    if (!this.root)
      this.root = await CachedFile.retrieveRoot(this.backend)
    let currentNode = this.root
    const lastFilename = splitPath.pop()
    for (const filename of splitPath) {
      currentNode = await currentNode.retrieveChild(filename)
      if (!currentNode.exists)
        throw new FSError(FSErrorCode.ENOENT, Path.join(currentNode.filePath, filename))
      if (!currentNode.isDir)
        throw new FSError(FSErrorCode.ENOTDIR, Path.join(currentNode.filePath, filename))
    }
    if (lastFilename)
      currentNode = await currentNode.retrieveChild(lastFilename)
    return currentNode
  }

  private async lockBackend() {
    if (!await this.mutex.lock())
      if (this.callback.onPossibleUnknownChanges)
        this.callback.onPossibleUnknownChanges()
  }

  async mkDir(filePath: string) {
    return this.promiseChain.enqueue(async () => {
      await this.lockBackend()
      const cachedFile = await this.getFile(filePath)
      await cachedFile.mkDir()
      if (this.callback.onFileCreated)
        this.callback.onFileCreated(cachedFile.filePath, FileType.DIRECTORY)
    })
  }

  async mkLnk(filePath: string, destination: string): Promise<void> {
    return this.promiseChain.enqueue(async () => {
      await this.lockBackend()
      const cachedFile = await this.getFile(filePath)
      await cachedFile.mkLnk(destination)
      if (this.callback.onFileCreated)
        this.callback.onFileCreated(cachedFile.filePath, FileType.SYMLINK)
    })
  }

  async deleteFile(filePath: string) {
    return this.promiseChain.enqueue(async () => {
      await this.lockBackend()
      const cachedFile = await this.getFile(filePath)
      cachedFile.deleteFile()
      if (this.callback.onFileDeleted)
        this.callback.onFileDeleted(cachedFile.filePath)
    })
  }

  async readDir(filePath: string): Promise<FileEntry[]> {
    return this.promiseChain.enqueue(async () => {
      await this.lockBackend()
      const cachedFile = await this.resolveSymlink(filePath)
      let cachedFiles = await cachedFile.retrieveChildren()
      cachedFiles = cachedFiles.filter(el => el.exists)
      const fileEntries = cachedFiles.map(el => el.asFileEntry!)
      for (const entry of fileEntries)
        entry.filePath = Path.join(filePath, entry.filename)
      return fileEntries
    })
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    return this.promiseChain.enqueue(async () => {
      await this.lockBackend()
      const cachedFile = await this.resolveSymlink(filePath)
      return cachedFile.readFile()
    })
  }

  async writeFile(filePath: string, data: Uint8Array) {
    return this.promiseChain.enqueue(async () => {
      await this.lockBackend()
      const cachedFile = await this.resolveSymlink(filePath)
      if (this.callback.onFileCreated && !cachedFile.exists)
        this.callback.onFileCreated(cachedFile.filePath, FileType.FILE)
      await cachedFile.writeFile(data)
      if (this.callback.onFileContentsChanged)
        this.callback.onFileContentsChanged(cachedFile.filePath, FileType.FILE)
    })
  }

  async linfo(filePath: string): Promise<FileEntry | undefined> {
    return this.promiseChain.enqueue(async () => {
      await this.lockBackend()
      const cachedFile = await this.getFile(filePath)
      return cachedFile.asFileEntry
    })
  }

  async info(filePath: string): Promise<BasicFileEntry> {
    return this.promiseChain.enqueue(async () => {
      await this.lockBackend()
      const cachedFile = await this.resolveSymlink(filePath)
      const fileEntry = cachedFile.asFileEntry as BasicFileEntry
      fileEntry.filePath = Path.join(filePath, fileEntry.filename)
      return fileEntry
    })
  }

  private async resolveSymlink(filePath: string): Promise<CachedFile> {
    const linkStack = [await this.getFile(filePath), ]
    while (linkStack.length < 64) {
      const file = linkStack.shift()!
      if (file.fileType !== CachedFileType.SYMLINK)
        return file
      linkStack.push(file)
    }
    throw Error('Max symlink chain!')
  }

  async commit() {
    return this.promiseChain.enqueue(async () => {
      if (!this.root)
        return
      await this.lockBackend()
      try {
        const filesToDelete = new Array<string>()
        const foldersToCreate = new Array<BackendMeta>()
        const filesToWrite = new Array<BackendFile>()
        const symlinksToCreate = new Array<BackendLink>()
        const metaUpdates = new Array<BackendMeta>()

        const folderStack = [this.root, ]

        while (folderStack.length) {
          const folder = folderStack.shift()!

          for (const file of folder.getChildren()) {
            switch (file.fileType) {
              case CachedFileType.NONEXISTENT:
                if (file.oldType !== CachedFileType.NONEXISTENT)
                  filesToDelete.push(file.filePath)
                break
              case CachedFileType.DIRECTORY_NEW:
                if (file.oldType !== CachedFileType.NONEXISTENT)
                  filesToDelete.push(file.filePath)
                foldersToCreate.push({
                  filePath: file.filePath,
                  meta: file.meta,
                })

                folderStack.push(file)
                break
              case CachedFileType.FILE_DIRTY:
                if (file.oldType !== CachedFileType.NONEXISTENT && file.oldType !== CachedFileType.FILE)
                  filesToDelete.push(file.filePath)

                filesToWrite.push({
                  filePath: file.filePath,
                  data: await file.readFile(),
                  meta: file.meta,
                })
                break
              case CachedFileType.SYMLINK_DIRTY:
                if (file.oldType !== CachedFileType.NONEXISTENT)
                  filesToDelete.push(file.filePath)

                symlinksToCreate.push({
                  filePath: file.filePath,
                  destination: file.symlink || '',
                  meta: file.meta,
                })
                break
              case CachedFileType.DIRECTORY:
              case CachedFileType.SYMLINK:
              case CachedFileType.FILE:
                if (file.fileType === CachedFileType.DIRECTORY)
                  folderStack.push(file)
                if (file.metaDirty)
                  metaUpdates.push({
                    filePath: file.filePath,
                    meta: file.meta,
                  })
                break
              default:
                throw Error('Unknown CachedFileType')
            }
          }
        }

        if (filesToDelete.length || foldersToCreate.length || filesToWrite.length) {
          console.log(filesToDelete, foldersToCreate, filesToWrite, symlinksToCreate)
          await this.backend.bulk(filesToDelete, foldersToCreate, filesToWrite, symlinksToCreate, metaUpdates)
        }
      } finally {
        await this.mutex.release()
        this.root.feedTheGC()
        this.root = undefined
      }
    })
  }
}
