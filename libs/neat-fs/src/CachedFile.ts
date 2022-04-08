import Path from './Path'
import Backend from './backends/Backend'
import { FileEntry, FileMeta } from './FileEntry'
import FileType from './FileType'
import { FSError, FSErrorCode } from './FSError'

/**
 * @internal
 */
export enum CachedFileType {
  DIRECTORY,
  DIRECTORY_NEW,
  FILE,
  FILE_DIRTY,
  SYMLINK,
  SYMLINK_DIRTY,
  NONEXISTENT
}

/**
 * @internal
 */
export default class CachedFile {
  private newFileType: CachedFileType

  private data?: Uint8Array

  private children?: CachedFile[]

  private readonly _meta: FileMeta

  private _metaDirty = false

  constructor(readonly backend: Backend, private parent: CachedFile | undefined, readonly filename: string, readonly filePath: string, readonly oldType: CachedFileType.DIRECTORY | CachedFileType.SYMLINK | CachedFileType.NONEXISTENT | CachedFileType.FILE, meta: FileMeta, private destination?: string) {
    this.newFileType = oldType
    this._meta = meta
    // copy the provided meta for safety
    this._meta = this.meta
  }

  /**
   * Returns a copy of the cached files meta data.
   */
  get meta(): FileMeta {
    // shallow copy
    return { ...this._meta }
  }

  set mtime(mtime: number) {
    this._meta.mtime = mtime
    this._metaDirty = true
  }

  get mtime(): number {
    return this._meta.mtime
  }

  get metaDirty(): boolean {
    return this._metaDirty
  }

  mkLnk(destination: string) {
    if (this.exists)
      throw new FSError(FSErrorCode.EEXIST, this.filePath)

    this.mtime = new Date().getUTCMilliseconds()
    if (this.parent)
      this.parent.mtime = this.mtime

    this.newFileType = CachedFileType.SYMLINK_DIRTY
    this.destination = destination
    // feed the gc
    this.data = undefined
    this.children = undefined
  }

  writeFile(data: Uint8Array) {
    if (this.exists && !this.isFile)
      throw new FSError(FSErrorCode.ENOTFILE, this.filePath)

    this.mtime = new Date().getUTCMilliseconds()
    if (!this.exists)
      this.parent!._meta.mtime = this.mtime

    this.newFileType = CachedFileType.FILE_DIRTY
    this.data = data
    // feed the gc
    this.children = undefined
    this.destination = undefined
  }

  mkDir() {
    if (this.exists)
      throw new FSError(FSErrorCode.EEXIST, this.filePath)

    this.mtime = new Date().getUTCMilliseconds()
    if (this.parent)
      this.parent._meta.mtime = this.mtime

    this.newFileType = CachedFileType.DIRECTORY_NEW
    this.children = []
    // feed the gc
    this.data = undefined
    this.destination = undefined
  }

  deleteFile() {
    if (!this.exists)
      throw new FSError(FSErrorCode.ENOENT, this.filePath)

    if (this.parent)
      this.parent._meta.mtime = new Date().getUTCMilliseconds()
    this.newFileType = CachedFileType.NONEXISTENT
    // feed the gc
    this.data = undefined
    this.children = undefined
    this.destination = undefined
  }

  async readFile(): Promise<Uint8Array> {
    if (!this.exists)
      throw new FSError(FSErrorCode.ENOENT, this.filePath)
    if (!this.isFile)
      throw new FSError(FSErrorCode.ENOTFILE, this.filePath)

    if (!this.data)
      this.data = await this.backend.readFile(this.filePath)
    return this.data
  }

  /**
   * Returns only the already cached files.
   */
  getChildren(): CachedFile[] {
    if (!this.exists)
      throw new FSError(FSErrorCode.ENOENT, this.filePath)
    if (!this.isDir)
      throw new FSError(FSErrorCode.ENOTDIR, this.filePath)

    return this.children || []
  }

  /**
   * Retrieves the children from the backend if they aren't already cached.
   */
  async retrieveChildren(): Promise<CachedFile[]> {
    if (!this.exists)
      throw new FSError(FSErrorCode.ENOENT, this.filePath)
    if (!this.isDir)
      throw new FSError(FSErrorCode.ENOTDIR, this.filePath)

    if (!this.children) {
      const ret = await this.backend.readDir(this.filePath)
      this.children = []
      for (const entry of ret)
        this.children.push(new CachedFile(this.backend, this, entry.filename, Path.join(this.filePath, entry.filename), CachedFile.fromBasicFileType(entry.fileType), entry.meta, entry.destination))
    }
    return this.children
  }

  /**
   * Retrieves the children from the backend if they aren't already cached.
   */
  async retrieveChild(filename: string): Promise<CachedFile> {
    const children = await this.retrieveChildren()
    let newNode = children.find(el => el.filename === filename)
    if (!newNode) {
      newNode = new CachedFile(this.backend, this, filename, Path.join(this.filePath, filename), CachedFileType.NONEXISTENT, { mtime: 0 })
      children.push(newNode)
    }
    return newNode
  }

  get symlink(): string | undefined {
    return this.destination
  }

  get basicType(): FileType | undefined {
    return CachedFile.toBasicFileType(this.newFileType)
  }

  get fileType(): CachedFileType {
    return this.newFileType
  }

  get exists(): boolean {
    return this.newFileType !== CachedFileType.NONEXISTENT
  }

  get isDir(): boolean {
    return this.newFileType === CachedFileType.DIRECTORY || this.newFileType === CachedFileType.DIRECTORY_NEW
  }

  get isFile(): boolean {
    return this.newFileType === CachedFileType.FILE || this.newFileType === CachedFileType.FILE_DIRTY
  }

  get isSymlink(): boolean {
    return this.newFileType === CachedFileType.SYMLINK || this.newFileType === CachedFileType.SYMLINK_DIRTY
  }

  get asFileEntry(): FileEntry | undefined {
    const fileType = this.basicType
    if (fileType === undefined)
      return undefined
    return {
      filePath: this.filePath,
      fileType,
      filename: this.filename,
      destination: this.destination,
      meta: this.meta
    }
  }

  static toBasicFileType(fileType: CachedFileType): FileType | undefined {
    switch (fileType) {
      case CachedFileType.FILE:
      case CachedFileType.FILE_DIRTY:
        return FileType.FILE
      case CachedFileType.DIRECTORY:
      case CachedFileType.DIRECTORY_NEW:
        return FileType.DIRECTORY
      case CachedFileType.SYMLINK:
      case CachedFileType.SYMLINK_DIRTY:
        return FileType.SYMLINK
      default:
        return undefined
    }
  }

  static fromBasicFileType(fileType: FileType): CachedFileType.FILE | CachedFileType.SYMLINK | CachedFileType.DIRECTORY {
    switch (fileType) {
      case FileType.FILE:
        return CachedFileType.FILE
      case FileType.SYMLINK:
        return CachedFileType.SYMLINK
      case FileType.DIRECTORY:
        return CachedFileType.DIRECTORY
      default:
        throw Error('Invalid file type!')
    }
  }

  static async retrieveRoot(backend: Backend): Promise<CachedFile> {
    const rInfo = (await backend.linfo('/'))!
    return new CachedFile(backend, undefined, '', '/', CachedFileType.DIRECTORY, rInfo.meta)
  }

  /**
   * Helps the gc cleanup the mess we created. Removes the link to the children and to the parent from every folder down the chain.
   * This operation invalidates the CachedFile tree.
   */
  feedTheGC() {
    if (!this.exists)
      throw new FSError(FSErrorCode.ENOENT, this.filePath)
    if (!this.isDir)
      throw new FSError(FSErrorCode.ENOTDIR, this.filePath)
    const folderStack = new Array<CachedFile>(this)
    while (folderStack.length) {
      const file = folderStack.pop()!
      for (const child of file.getChildren())
        if (child.isDir)
          folderStack.push(child)
      file.parent = undefined
      file.children = undefined
    }
  }
}
