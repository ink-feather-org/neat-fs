import NeatFS from './NeatFS'

import Backend, { BackendLink, BackendFile, BackendMeta } from './backends/Backend'
import LockedBackend from './backends/LockedBackend'
import RAMBackend from './backends/RAMBackend'

import NodeLikePromiseFS from './NodeLikePromiseFS'
import NodeLikeFS from './NodeLikeFS'

import FSCallback from './FSCallback'
import FileType from './FileType'
import { FileEntry, BasicFileEntry, FileMeta } from './FileEntry'
import Path from './Path'

import { FSError, FSErrorCode, isFSError } from './FSError'

export {
  NeatFS,
  Backend,
  BackendLink,
  BackendFile,
  BackendMeta,
  LockedBackend,
  RAMBackend,
  NodeLikePromiseFS,
  NodeLikeFS,
  FSCallback,
  FileType,
  FileEntry,
  BasicFileEntry,
  FileMeta,
  Path,
  FSError,
  FSErrorCode,
  isFSError
}

export default NeatFS
