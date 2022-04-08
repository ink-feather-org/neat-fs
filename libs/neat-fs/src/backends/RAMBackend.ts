import { MutexFactoryProxy } from '@ink-feather-org/ts-mutex'

import { LockedBackend } from './LockedBackend'
import { BackendFile, BackendLink, BackendMeta } from './Backend'
import { Path } from '../Path'
import { FileType } from '../FileType'
import { FileEntry, FileMeta } from '../FileEntry'
import { FSError, FSErrorCode } from '../FSError'

class Node {
  private data?: Uint8Array

  private children?: Node[]

  private _meta: FileMeta

  constructor(readonly filename: string, readonly filePath: string, readonly fileType: FileType, meta: FileMeta, readonly destination?: string) {
    // no need to copy here metas from bulk are safe to use
    this._meta = meta
  }

  /**
   * Returns a copy of the cached files meta data.
   */
  get meta(): FileMeta {
    // shallow copy
    return { ...this._meta, }
  }

  /**
   * Directly assigns the meta object.
   */
  set meta(meta: FileMeta) {
    // no need to copy here metas from bulk are safe to use
    this._meta = meta
  }

  mkLnk(filename: string, destination: string, meta: FileMeta) {
    if (!this.isDir)
      throw new FSError(FSErrorCode.ENOTDIR, this.filePath)

    if (!this.children)
      this.children = []

    if (this.children.find(el => el.filename === filename))
      throw new FSError(FSErrorCode.EEXIST, this.filePath)

    this.children.push(new Node(filename, Path.join(this.filePath, filename), FileType.SYMLINK, meta, destination))
  }

  writeFile(filename: string, data: Uint8Array, meta: FileMeta) {
    if (!this.isDir)
      throw new FSError(FSErrorCode.ENOTDIR, this.filePath)

    if (!this.children)
      this.children = []

    let node = this.children.find(el => el.filename === filename)
    if (!node) {
      node = new Node(filename, Path.join(this.filePath, filename), FileType.FILE, meta)
      this.children.push(node)
    } else if (!node.isFile)
      throw new FSError(FSErrorCode.ENOTFILE, this.filePath)

    node.data = data
  }

  mkDir(filename: string, meta: FileMeta) {
    if (!this.isDir)
      throw new FSError(FSErrorCode.ENOTDIR, this.filePath)

    if (!this.children)
      this.children = []

    if (this.children.find(el => el.filename === filename))
      throw new FSError(FSErrorCode.EEXIST, this.filePath)

    this.children.push(new Node(filename, Path.join(this.filePath, filename), FileType.DIRECTORY, meta))
  }

  deleteFile(filename: string) {
    if (!this.isDir)
      throw new FSError(FSErrorCode.ENOTDIR, this.filePath)

    if (!this.children)
      this.children = []

    this.children = this.children.filter(el => el.filename !== filename)
  }

  readFile(): Uint8Array {
    if (!this.isFile)
      throw new FSError(FSErrorCode.ENOTFILE, this.filePath)

    if (!this.data)
      this.data = new Uint8Array()
    return this.data
  }

  readDir(): FileEntry[] {
    const children = this.getChildren()
    return children.map(el => ({
      filename: el.filename,
      filePath: el.filePath,
      fileType: el.fileType,
      // copy meta
      meta: el.meta,
    }))
  }

  getChildren(): Node[] {
    if (!this.isDir)
      throw new FSError(FSErrorCode.ENOTDIR, this.filePath)

    if (!this.children)
      this.children = []
    return this.children
  }

  getChild(filename: string): Node | undefined {
    return this.getChildren().find(el => el.filename === filename)
  }

  get isDir(): boolean {
    return this.fileType === FileType.DIRECTORY
  }

  get isFile(): boolean {
    return this.fileType === FileType.FILE
  }

  get isSymlink(): boolean {
    return this.fileType === FileType.SYMLINK
  }
}

export class RAMBackend extends MutexFactoryProxy implements LockedBackend {
  private readonly root = new Node('', '/', FileType.DIRECTORY, { mtime: 0, })

  private getFile(filePath: string): Node {
    const splitPath = Path.split(filePath)
    splitPath.shift()
    let currentNode = this.root
    const lastFilename = splitPath.pop()
    for (const filename of splitPath) {
      const newNode = currentNode.getChild(filename)
      if (!newNode)
        throw new FSError(FSErrorCode.ENOENT, Path.join(currentNode.filePath, filename))
      if (!newNode.isDir)
        throw new FSError(FSErrorCode.ENOTDIR, Path.join(currentNode.filePath, filename))
      currentNode = newNode
    }

    if (lastFilename) {
      const newNode = currentNode.getChild(lastFilename)
      if (!newNode)
        throw new FSError(FSErrorCode.ENOENT, Path.join(currentNode.filePath, lastFilename))
      currentNode = newNode
    }

    return currentNode
  }

  async bulk(filesToDelete: string[], foldersToCreate: BackendMeta[], filesToWrite: BackendFile[], linksToCreate: BackendLink[], metaUpdates: BackendMeta[]) {
    for (const filePath of filesToDelete)
      this.getFile(Path.dirname(filePath)).deleteFile(Path.basename(filePath))

    for (const folder of foldersToCreate)
      this.getFile(Path.dirname(folder.filePath)).mkDir(Path.basename(folder.filePath), folder.meta)

    for (const file of filesToWrite)
      this.getFile(Path.dirname(file.filePath)).writeFile(Path.basename(file.filePath), file.data, file.meta)

    for (const link of linksToCreate)
      this.getFile(Path.dirname(link.filePath)).mkLnk(Path.basename(link.filePath), link.destination, link.meta)

    for (const metaUpdate of metaUpdates)
      this.getFile(metaUpdate.filePath).meta = metaUpdate.meta
  }

  async readDir(filePath: string): Promise<FileEntry[]> {
    return this.getFile(filePath).readDir()
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    return this.getFile(filePath).readFile()
  }

  async linfo(filePath: string): Promise<FileEntry> {
    const {
      fileType, filename, destination, meta,
    } = this.getFile(filePath)
    // console.log(meta)
    return {
      filename,
      filePath,
      destination,
      fileType,
      // meta copied
      meta,
    }
  }
}
