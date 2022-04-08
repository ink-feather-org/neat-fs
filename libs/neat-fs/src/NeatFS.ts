import { FakeMutex } from '@feather-ink/mutex'
import { GeneralAsyncFunction } from '@feather-ink/ts-utils'

import NodeLikeFS from './NodeLikeFS'
import FSCallback from './FSCallback'
import FileCache from './FileCache'
import LockedBackend from './backends/LockedBackend'
import FileType from './FileType'
import { BasicFileEntry, FileEntry } from './FileEntry'
import RAMBackend from './backends/RAMBackend'
import NodeLikePromiseFS from './NodeLikePromiseFS'
import Path from './Path'
import { FSError, FSErrorCode } from './FSError'

export default class NeatFS {
  private _fs: NodeLikeFS | undefined

  get fs(): NodeLikeFS {
    if (!this._fs)
      this._fs = new NodeLikeFS(new NodeLikePromiseFS(this))
    return this._fs
  }

  protected functions = new Set<FSCallback>()

  addListener(fun: FSCallback) {
    this.functions.add(fun)
  }

  removeListener(fun: FSCallback) {
    this.functions.delete(fun)
  }

  private callback: FSCallback = new class {
    constructor(readonly functions: Set<FSCallback>) {}

    onFileContentsChanged(filePath: string, type: FileType): void {
      for (const fun of this.functions)
        if (fun.onFileContentsChanged)
          fun.onFileContentsChanged(filePath, type)
    }

    onFileCreated(filePath: string, type: FileType): void {
      for (const fun of this.functions)
        if (fun.onFileCreated)
          fun.onFileCreated(filePath, type)
    }

    onFileDeleted(filePath: string): void {
      for (const fun of this.functions)
        if (fun.onFileDeleted)
          fun.onFileDeleted(filePath)
    }

    onPossibleUnknownChanges(): void {
      for (const fun of this.functions)
        if (fun.onPossibleUnknownChanges)
          fun.onPossibleUnknownChanges()
    }
  }(this.functions)

  private _workingDirectory = '/'

  private path = new Path(this)

  get Path(): Path {
    return this.path
  }

  private fileCache: FileCache

  private operationStack = 0

  private commitTimeout?: NodeJS.Timeout

  private _lastCacheCommit = Date.now()

  /**
   * Set to Infinity to stop committing the cache after a set time.
   */
  alwaysCommitCacheAfter = 5000

  /**
   * Set to Infinity to commit the cache only when alwaysCommitCacheAfter is reached.
   */
  cacheCommitDelay = 500

  constructor(options?: {
    backend?: LockedBackend,
    alwaysCommitCacheAfter?: number,
    cacheCommitDelay?: number
  }) {
    if (!options)
      options = {}
    if (!options.backend)
      options.backend = new RAMBackend(FakeMutex.factory())
    if (typeof options.alwaysCommitCacheAfter === 'number')
      this.alwaysCommitCacheAfter = options.alwaysCommitCacheAfter
    if (typeof options.cacheCommitDelay === 'number')
      this.cacheCommitDelay = options.cacheCommitDelay
    this.fileCache = new FileCache(options.backend, this.callback)
  }

  get workingDirectory(): string {
    return this._workingDirectory
  }

  set workingDirectory(path: string) {
    // if path is not absolute change to it from the current wd
    this._workingDirectory = Path.resolve(this._workingDirectory, path)
  }

  get lastCacheCommit(): number {
    return this._lastCacheCommit
  }

  /**
   * Commit the cache files to the backend. This should be called at the end of your application. If this is running in a browser call this in the beforeunload.
   */
  commit(): Promise<void> {
    if (this.commitTimeout) {
      clearTimeout(this.commitTimeout)
      this.commitTimeout = undefined
    }
    this._lastCacheCommit = Date.now()
    return this.fileCache.commit()
  }

  private async wrap<T>(operation: GeneralAsyncFunction<never, T>): Promise<T> {
    this.operationStack++
    if (this.commitTimeout) {
      clearTimeout(this.commitTimeout)
      this.commitTimeout = undefined
    }
    try {
      return await operation.call(this)
    } finally {
      this.operationStack--
      if (this.operationStack === 0) {
        if (Date.now() - this._lastCacheCommit >= this.alwaysCommitCacheAfter)
          // don't await it
          this.commit()
        else if (this.cacheCommitDelay !== Infinity)
          this.commitTimeout = setTimeout(this.commit.bind(this), this.cacheCommitDelay)
      }
    }
  }

  mkDir(filePath: string, options?: { recursive?: boolean }): Promise<void> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(async () => {
      if (!options?.recursive) {
        await this.fileCache.mkDir(filePath)
        return
      }

      const pathSplit = Path.split(filePath)
      let currentPath = pathSplit.shift()
      if (!currentPath)
        throw Error('Invalid path')
      for (const path of pathSplit) {
        currentPath = Path.join(currentPath, path)
        if (!await this.linfo(currentPath))
          await this.fileCache.mkDir(currentPath)
      }
    })
  }

  /**
   * Read directory
   * @param filePath
   * @param options
   * @returns Unsorted filename list. If paths is true full file paths are returned instead of just the filenames.
   */
  readDir(filePath: string, options?: { paths?: boolean }): Promise<string[]> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(async (): Promise<string[]> => {
      const ret = await this.fileCache.readDir(filePath)
      if (options?.paths)
        return ret.map(el => Path.join(filePath, el.filename))
      return ret.map(el => el.filename)
    })
  }

  writeFile(filePath: string, data: Uint8Array | string): Promise<void> {
    filePath = this.Path.resolve(filePath)
    if (typeof data === 'string')
      data = new TextEncoder().encode(data)
    return this.wrap(() => this.fileCache.writeFile(filePath, data as Uint8Array))
  }

  readFile(filePath: string): Promise<Uint8Array> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(() => this.fileCache.readFile(filePath))
  }

  readLink(filePath: string): Promise<string> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(async () => {
      const info = await this.fileCache.linfo(filePath)
      if (!info)
        throw new FSError(FSErrorCode.ENOENT, filePath)
      if (!info.destination)
        throw new FSError(FSErrorCode.ENOTLNK, filePath)
      return info.destination
    })
  }

  rm(filePath: string, options?: { recursive?: boolean, folder?: boolean }): Promise<void> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(async () => {
      const info = await this.fileCache.linfo(filePath)
      if (!info)
        throw new FSError(FSErrorCode.ENOENT, filePath)
      if (options?.folder) {
        if (!options?.recursive && info.fileType === FileType.DIRECTORY && (await this.fileCache.readDir(filePath)).length)
          throw new FSError(FSErrorCode.ENOTEMPTY, filePath)
        await this.fileCache.deleteFile(filePath)
        return
      }
      if (info.fileType === FileType.FILE || info.fileType === FileType.SYMLINK)
        await this.fileCache.deleteFile(filePath)
      else
        throw new FSError(FSErrorCode.ENOTFILE, filePath)
    })
  }

  async wipe() {
    const paths = await this.readDir('/', { paths: true })
    for (const path of paths)
      await this.rm(path, { folder: true, recursive: true })
  }

  linfo(filePath: string): Promise<FileEntry | undefined> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(() => this.fileCache.linfo(filePath))
  }

  info(filePath: string): Promise<BasicFileEntry | undefined> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(() => this.fileCache.info(filePath))
  }

  mkLnk(filePath: string, destination: string): Promise<void> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(() => this.fileCache.mkLnk(filePath, destination))
  }

  /**
   * Doesn't follow symlinks.
   * @param filePath
   * @returns The estimate of the size of a file or directory in bytes.
   */
  du(filePath: string): Promise<number> {
    filePath = this.Path.resolve(filePath)
    return this.wrap(async () => {
      let diskUsage = 0
      await this.forEach(filePath, async (currentPath, currentType) => {
        if (currentType === FileType.FILE)
          diskUsage += (await this.readFile(currentPath)).byteLength
        return true
      })
      return diskUsage
    })
  }

  move(source: string, target: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<void> {
    source = Path.normalize(source)
    target = Path.normalize(target)

    return this.wrap(async () => {
      await this.copy(source, target, options)
      await this.rm(source, { recursive: true, folder: true })
    })
  }

  copy(source: string, target: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<void> {
    source = Path.normalize(source)
    target = Path.normalize(target)

    return this.wrap(async () => {
      throw Error('not implemented')
      // check if the newFilepath is inside the oldFilePath
      const srcFilePathSplit = Path.split(source)
      const newFilePathSplit = Path.split(target)
      let nested = true
      for (const [it, path] of srcFilePathSplit.entries())
        if (path !== newFilePathSplit[it]) {
          nested = false
          break
        }
      if (nested)
        throw Error('Nested or same!')

      await this.forEach(source, async (filePath, fileType) => {
        const destination = Path.join(target, filePath.substring(source.length))
        if (fileType === FileType.FILE)
          await this.fileCache.writeFile(destination, await this.fileCache.readFile(filePath))
        else
          await this.fileCache.mkDir(destination)
        return true
      })
    })
  }

  /**
   * Non recursively traverses the file tree. If the callback returns false the iteration is aborted.
   */
  async forEach(filePath: string, callback: (filePath: string, fileType: FileType) => Promise<boolean>) {
    // Don't use wrap here! If the users callback blocks the fileCache would never be committed
    filePath = this.Path.resolve(filePath)

    const fileStack = [await this.fileCache.linfo(filePath)]
    while (fileStack.length) {
      const entry = fileStack.shift()!

      if (!await callback(entry.filePath, entry.fileType))
        return
      if (entry.fileType === FileType.DIRECTORY) {
        const files = await this.fileCache.readDir(entry.filePath)
        for (const file of files) {
          file.filename = file.filePath
          fileStack.push(file)
        }
      }
    }
  }
}
