/* eslint-disable promise/no-callback-in-promise */
import { NodeLikePromiseFS } from './NodeLikePromiseFS'

export interface ReadFileOptions {
  encoding?: 'utf8'
}
export interface Stats {
  mode: number
  size: number
  ino: number
  birthtimeMs: number
  mtimeMs: number
  ctimeMs: number
  mtime: number
  ctime: number
  uid: number
  gid: number
  dev: number
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}
export interface MKDirOptions {
  recursive?: boolean
}

export class NodeLikeFS {
  constructor(readonly promises: NodeLikePromiseFS) {}

  mkdir(filePath: string, options: MKDirOptions | undefined, cb: (err?: any) => void) {
    this.promises.mkdir(filePath, options).then(() => cb()).catch((err) => { cb(err) })
  }

  rmdir(filePath: string, options: any, cb: (err?: any) => void) {
    this.promises.rmdir(filePath, options).then(() => cb()).catch((err) => { cb(err) })
  }

  readdir(filePath: string, options: any, cb: (err: any | undefined, files?: string[]) => void) {
    this.promises.readdir(filePath, options).then((files) => cb(undefined, files)).catch((err) => { cb(err) })
  }

  writeFile(filePath: string, data: Uint8Array | string, options: any | string, cb: (err?: any) => void) {
    this.promises.writeFile(filePath, data, options).then(() => cb()).catch((err) => { cb(err) })
  }

  readFile(filePath: string, options: any | string, cb: (err: any | undefined, data?: Uint8Array | string) => void) {
    this.promises.readFile(filePath, options).then((data) => cb(undefined, data)).catch((err) => { cb(err) })
  }

  unlink(filePath: string, options: any, cb: (err?: any) => void) {
    this.promises.unlink(filePath, options).then(() => cb()).catch((err) => { cb(err) })
  }

  rename(oldfilePath: string, newfilePath: string, cb: (err?: any) => void) {
    this.promises.rename(oldfilePath, newfilePath).then(() => cb()).catch((err) => { cb(err) })
  }

  stat(filePath: string, options: any, cb: (err: any | undefined, stats?: Stats) => void) {
    this.promises.stat(filePath, options).then((stats) => cb(undefined, stats)).catch((err) => { cb(err) })
  }

  lstat(filePath: string, options: any, cb: (err: any | undefined, stats?: Stats) => void) {
    this.promises.lstat(filePath, options).then((stats) => cb(undefined, stats)).catch((err) => { cb(err) })
  }

  symlink(target: string, filePath: string, cb: (err?: any) => void) {
    this.promises.symlink(target, filePath).then(() => cb()).catch((err) => { cb(err) })
  }

  readlink(filePath: string, options: any, cb: (err: any | undefined, linkString?: string) => void) {
    this.promises.readlink(filePath, options).then((linkString) => cb(undefined, linkString)).catch((err) => { cb(err) })
  }

  du(filePath: string, cb: (err: any | undefined, size?: number) => void) {
    this.promises.du(filePath).then((size) => cb(undefined, size)).catch((err) => { cb(err) })
  }
}
