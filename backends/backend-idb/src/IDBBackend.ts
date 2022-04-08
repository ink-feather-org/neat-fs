import { IDBPDatabase, IDBPObjectStore } from 'idb/with-async-ittr'

type MObjectStore = IDBPObjectStore<unknown, string[], string, 'readwrite'>

import {
  Path, LockedBackend, FileType, FileEntry, BackendFile, BackendLink, BackendMeta, FileMeta
} from '@ink-feather-org/neat-fs'
import { MutexFactoryProxy, MutexFactory } from '@ink-feather-org/ts-mutex'

interface InodeData {
  type: FileType
  /**
   * List of filenames.
   */
  children?: string[]
  destination?: string
  meta: FileMeta
}

/**
 * Object stores:
 * one for the files
 * one for the file data
 */
export class IDBBackend extends MutexFactoryProxy implements LockedBackend {
  constructor(mutexFactory: MutexFactory, private readonly db: IDBPDatabase, private readonly nodeStoreName: string, private readonly dataStoreName: string) {
    super(mutexFactory)
  }

  private static async delete(filePath: string, nodeStore: MObjectStore, dataStore: MObjectStore) {
    const toBeDeleted = [filePath, ]
    const folderStack = [filePath, ]
    while (folderStack.length) {
      const folderPath = folderStack.shift()!
      const folder = await nodeStore.get(folderPath) as InodeData | undefined
      if (folder && folder.children)
        for (const currentFilename of folder.children) {
          const currentPath = Path.join(folderPath, currentFilename)
          folderStack.push(currentPath)
          toBeDeleted.push(currentPath)
        }
      await dataStore.delete(folderPath)
    }

    for (let it = toBeDeleted.length - 1; it >= 0; it--) {
      const delPath = toBeDeleted[it]
      await nodeStore.delete(delPath)
    }
    await this.modifyFile(filePath, true, nodeStore)
  }

  private static async modifyFile(filePath: string, deleted: boolean, nodeStore: MObjectStore) {
    const pathSplit = Path.split(Path.dirname(filePath))
    pathSplit.shift()

    // ensure that the root exists
    let root = await nodeStore.get('/') as InodeData | undefined
    if (!root) {
      root = new class implements InodeData {
        type = FileType.DIRECTORY

        meta = { mtime: 0, }
      }()
      await nodeStore.add(root, '/')
    }

    // ensure that the parent directories exist
    let currentPath = '/'
    let node: InodeData | undefined = root
    for (const filename of pathSplit) {
      currentPath = Path.join(currentPath, filename)
      node = await nodeStore.get(currentPath) as InodeData | undefined
      if (!node)
        throw Error('ENOENT')
      if (node.type !== FileType.DIRECTORY)
        throw Error('ENOTDIR')
    }

    // add the new filepath to the children of this node
    if (!node)
      throw Error('ENOENT')
    if (!node.children)
      node.children = []
    if (deleted)
      node.children = node.children.filter(el => el !== filePath)
    else if (!node.children.includes(filePath))
      node.children.push(filePath)
    await nodeStore.put(node, currentPath)
  }

  private static async mkDir(folder: BackendMeta, nodeStore: MObjectStore) {
    const { filePath, meta, } = folder
    if (await nodeStore.get(filePath))
      throw Error('EEXIST')
    await this.modifyFile(filePath, false, nodeStore)
    await nodeStore.add(new class implements InodeData {
      type = FileType.DIRECTORY

      meta = meta
    }(), filePath)
  }

  private static async mkLnk(link: BackendLink, nodeStore: MObjectStore) {
    const { destination, filePath, meta, } = link
    if (await nodeStore.get(filePath))
      throw Error('EEXIST')
    await this.modifyFile(filePath, false, nodeStore)
    await nodeStore.add(new class implements InodeData {
      type = FileType.SYMLINK

      destination = destination

      meta = meta
    }())
  }

  private static async writeFile(file: BackendFile, nodeStore: MObjectStore, dataStore: MObjectStore) {
    const { filePath, data, meta, } = file
    await this.modifyFile(filePath, false, nodeStore)

    const nodeData = await nodeStore.get(filePath) as InodeData | undefined
    if (nodeData && nodeData.type !== FileType.FILE)
      throw Error('ENOTFILE')

    await nodeStore.put(new class implements InodeData {
      type = FileType.FILE

      meta = meta
    }(), filePath)
    await dataStore.put(data, filePath)
  }

  private static async meta(metaUpdate: BackendMeta, nodeStore: MObjectStore) {
    const { filePath, meta, } = metaUpdate

    const nodeData = await nodeStore.get(filePath) as InodeData | undefined
    if (!nodeData)
      throw Error('ENOENT')

    nodeData.meta = meta
    await nodeStore.put(nodeData, filePath)
  }

  async bulk(filesToDelete: string[], foldersToCreate: BackendMeta[], filesToWrite: BackendFile[], symlinksToCreate: BackendLink[], metaUpdates: BackendMeta[]): Promise<void> {
    const tx = this.db.transaction([this.nodeStoreName, this.dataStoreName, ], 'readwrite')
    const nodeStore = tx.objectStore(this.nodeStoreName)
    const dataStore = tx.objectStore(this.dataStoreName)

    for (const filePath of filesToDelete)
      await IDBBackend.delete(filePath, nodeStore, dataStore)

    for (const folder of foldersToCreate)
      await IDBBackend.mkDir(folder, nodeStore)

    for (const file of filesToWrite)
      await IDBBackend.writeFile(file, nodeStore, dataStore)

    for (const link of symlinksToCreate)
      await IDBBackend.mkLnk(link, nodeStore)

    for (const metaUpdate of metaUpdates)
      await IDBBackend.meta(metaUpdate, nodeStore)
  }

  async readDir(filePath: string): Promise<FileEntry[]> {
    const tx = this.db.transaction(this.nodeStoreName, 'readonly')
    const nodeStore = tx.objectStore(this.nodeStoreName)
    const file = await nodeStore.get(filePath) as InodeData | undefined
    if (!file) {
      if (filePath === '/')
        return []
      throw Error('ENOENT')
    }
    if (file.type !== FileType.DIRECTORY)
      throw Error('ENOTDIR')
    if (!file.children)
      file.children = []
    const children = new Array<FileEntry>()
    for (const path of file.children) {
      const child = await nodeStore.get(path) as InodeData | undefined
      if (child)
        children.push({
          filename: Path.basename(path),
          filePath: path,
          fileType: child.type,
          meta: child.meta,
        })
    }
    return children
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    const tx = this.db.transaction([this.nodeStoreName, this.dataStoreName, ], 'readonly')
    const nodeStore = tx.objectStore(this.nodeStoreName)
    const dataStore = tx.objectStore(this.dataStoreName)
    const file = await nodeStore.get(filePath) as InodeData | undefined
    if (!file)
      throw Error('ENOENT')
    if (file.type !== FileType.FILE)
      throw Error('ENOTFILE')
    return await dataStore.get(filePath) as Uint8Array || new Uint8Array()
  }

  async linfo(filePath: string): Promise<FileEntry> {
    const tx = this.db.transaction(this.nodeStoreName, 'readonly')
    const nodeStore = tx.objectStore(this.nodeStoreName)
    const file = await nodeStore.get(filePath) as InodeData | undefined
    if (!file)
      throw Error('ENOENT')
    return {
      fileType: file.type,
      filePath,
      destination: file.destination,
      filename: Path.basename(filePath),
      meta: file.meta,
    }
  }
}
