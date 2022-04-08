import { NeatFS } from './NeatFS'
import { MKDirOptions, ReadFileOptions, Stats } from './NodeLikeFS'
import { FileType } from './FileType'
import { FileEntry } from './FileEntry'
import { FSError, FSErrorCode } from './FSError'

export class NodeLikePromiseFS {
  constructor(private readonly neatFS: NeatFS) {}

  mkdir(filePath: string, options?: MKDirOptions): Promise<void> {
    return this.neatFS.mkDir(filePath, options)
  }

  async rmdir(filePath: string, options?: any): Promise<void> {
    const info = await this.neatFS.linfo(filePath)
    if (!info)
      throw new FSError(FSErrorCode.ENOENT, filePath)
    if (info.fileType !== FileType.DIRECTORY)
      throw new FSError(FSErrorCode.ENOTDIR, filePath)
    return this.neatFS.rm(filePath, { recursive: false, folder: true, })
  }

  readdir(filePath: string, options?: any): Promise<string[]> {
    return this.neatFS.readDir(filePath)
  }

  writeFile(filePath: string, data: Uint8Array | string, options?: any): Promise<void> {
    return this.neatFS.writeFile(filePath, data)
  }

  async readFile(filePath: string, options?: ReadFileOptions | string): Promise<Uint8Array | string> {
    const ret = await this.neatFS.readFile(filePath)
    let asString = false
    if (typeof options === 'object')
      options = options?.encoding
    if (typeof options === 'string') {
      if (options !== 'utf8')
        throw Error('Unsupported encoding!')
      asString = true
    }
    if (asString)
      return new TextDecoder().decode(ret)
    return ret
  }

  async unlink(filePath: string, options?: any): Promise<void> {
    const info = await this.neatFS.linfo(filePath)
    if (!info)
      throw new FSError(FSErrorCode.ENOENT, filePath)
    if (info.fileType !== FileType.FILE)
      throw new FSError(FSErrorCode.ENOTFILE, filePath)
    await this.neatFS.rm(filePath)
  }

  rename(oldFilePath: string, newFilePath: string): Promise<void> {
    return this.neatFS.move(oldFilePath, newFilePath)
  }

  private async _stat(filePath: string, options: any | undefined, followSymlinks: boolean): Promise<Stats> {
    let fileSize = 0
    let info: FileEntry | undefined
    if (followSymlinks)
      info = await this.neatFS.info(filePath)
    else
      info = await this.neatFS.linfo(filePath)
    if (!info)
      throw new FSError(FSErrorCode.ENOENT, filePath)
    const isFile = info.fileType === FileType.FILE
    if (isFile)
      fileSize = await this.neatFS.du(filePath)
    return new class StatsImpl implements Stats {
      birthtimeMs: number

      ctime: number

      ctimeMs: number

      mtime: number

      mtimeMs: number

      constructor(private fileEntry: FileEntry, public size: number) {
        this.ctime = Math.round(this.fileEntry.meta.mtime / 1000)
        this.ctimeMs = this.fileEntry.meta.mtime

        this.birthtimeMs = this.ctimeMs

        this.mtime = this.ctime
        this.mtimeMs = this.ctimeMs
      }

      dev = 1

      gid = 1

      ino = Math.round(Math.random() * 1000)

      mode = 0

      uid = 1

      isDirectory(): boolean {
        return this.fileEntry.fileType === FileType.DIRECTORY
      }

      isFile(): boolean {
        return this.fileEntry.fileType === FileType.FILE
      }

      isSymbolicLink(): boolean {
        return this.fileEntry.fileType === FileType.SYMLINK
      }
    }(info, fileSize)
  }

  stat(filePath: string, options?: any): Promise<Stats> {
    return this._stat(filePath, options, true)
  }

  lstat(filePath: string, options?: any): Promise<Stats> {
    return this._stat(filePath, options, false)
  }

  symlink(target: string, filePath: string): Promise<void> {
    return this.neatFS.mkLnk(filePath, target)
  }

  async readlink(filePath: string, options?: any): Promise<string> {
    const info = await this.neatFS.linfo(filePath)
    if (!info)
      throw new FSError(FSErrorCode.ENOENT, filePath)
    if (info.fileType !== FileType.SYMLINK)
      throw new FSError(FSErrorCode.ENOTLNK, filePath)
    return info.destination || ''
  }

  du(filePath: string): Promise<number> {
    return this.neatFS.du(filePath)
  }
}
