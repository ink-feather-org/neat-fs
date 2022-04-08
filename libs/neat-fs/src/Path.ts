import { NeatFS } from './NeatFS'

/**
 * https://nodejs.org/api/path.html
 * There is no type checking in place. Just be careful.
 */
export class Path {
  constructor(private readonly neatFS: NeatFS) {}

  static readonly sep = '/'

  private static _join(...parts: string[]): string {
    parts = parts.filter(el => el !== '')
    const pathDuplicateSlash = parts.join('/')
    let path = ''
    let lastSlash = false
    for (const char of pathDuplicateSlash) {
      if (char === '/') {
        if (lastSlash)
          continue
        lastSlash = true
      } else
        lastSlash = false
      path += char
    }
    if (path === '')
      return '.'
    return path
  }

  /**
   * NodeJS standard see its documentation.
   */
  static join(...parts: string[]): string {
    return Path.normalize(Path._join(...parts))
  }

  /**
   * NodeJS standard see its documentation.
   */
  join(...parts: string[]): string {
    return Path.join(...parts)
  }

  /**
   * NodeJS standard see its documentation.
   */
  static extname(path: string): string {
    // remove path and remove potential leading dot
    path = Path.basename(path).substr(1)
    // find last dot
    for (let it = path.length - 1; it >= 0; it--)
      if (path[it] === '.')
        return path.slice(it)
    return ''
  }

  /**
   * NodeJS standard see its documentation.
   */
  extname(path: string): string {
    return Path.extname(path)
  }

  /**
   * NodeJS standard see its documentation.
   */
  static isAbsolute(path: string): boolean {
    return path.startsWith('/')
  }

  /**
   * NodeJS standard see its documentation.
   */
  isAbsolute(path: string): boolean {
    return Path.isAbsolute(path)
  }

  private static _relative(from: string, to: string): string {
    if (from === to)
      return ''

    // 1) find the longest common path from root
    // 2) generate the realtive path based on the path difference
    // 3) append the rest of the to path to the common parts

    // Compare paths to find the longest common path from root
    const length = Math.min(from.length, to.length)
    let lastCommonSep = -1

    let it: number
    for (it = 0; it < length; it++) {
      if (from[it] !== to[it])
        break
      if (from[it] === '/')
        lastCommonSep = it
    }
    if (it === length)
      lastCommonSep = length

    let out = ''
    for (it = lastCommonSep + 1; it <= from.length; ++it)
      if (it === from.length || from[it] === '/')
        out += '../'

    out = `${out}${to.slice(lastCommonSep + 1)}`
    if (out.endsWith('/'))
      out = out.slice(0, -1)
    return out
  }

  /**
   * Due to the nature of NeatFS this function is not conform to the NodeJS standard.
   * The global Path object doesn't know the current working directory. It always assumes '/' to be the current working directory.
   * Use the Path property of NeatFS or instantiate a new Path object with a NeatFS to get the standard NodeJS behavior.
   */
  static relative(from: string, to: string): string {
    from = Path.resolve(from)
    to = Path.resolve(to)
    return Path._relative(from, to)
  }

  /**
   * NodeJS standard see its documentation.
   */
  relative(from: string, to: string): string {
    from = this.resolve(from)
    to = this.resolve(to)
    return Path._relative(from, to)
  }

  /**
   * NodeJS standard see its documentation.
   */
  static normalize(path: string): string {
    if (path.length === 0)
      return '.'
    const absolute = Path.isAbsolute(path)
    let parts = Path.split(path).splice(1)
    parts = parts.reduce((ancestors, current) => {
      if (current === '.')
        return ancestors

      if (current === '..') {
        const parent = ancestors[ancestors.length - 1]
        // if parent === '..' -> push '..'
        // else if parent === undefined and is not absolute ->  push '..'
        // else -> remove
        if (parent === '..' || (parent === undefined && !absolute))
          ancestors.push('..')
        else
          ancestors.pop()
        return ancestors
      }

      ancestors.push(current)
      return ancestors
    }, new Array<string>())
    if (absolute)
      parts.unshift('/')
    let newPath = Path._join(...parts)
    if (path.endsWith('/') && !newPath.endsWith('/'))
      newPath += '/'
    return newPath
  }

  /**
   * Nonstandard path extension.
   * Checks if the path contains `..` or `.`.
   * Does not check if the path is relative.
   */
  static isNormalized(path: string): boolean {
    if (path === '')
      return false
    const parts = Path.split(path).slice(1)
    for (const part of parts)
      if (part === '.' || part === '..')
        return false
    return true
  }

  /**
   * Nonstandard path extension.
   * Checks if the path contains `..` or `.`.
   * Does not check if the path is relative.
   */
  isNormalized(path: string): boolean {
    return Path.isNormalized(path)
  }

  /**
   * NodeJS standard see its documentation.
   */
  normalize(path: string): string {
    return Path.normalize(path)
  }

  /**
   * Nonstandard path extension.
   * Splits the path into multiple strings.
   * If it is an absolute path the first element is always '/'.
   * If it is a relative path the first element is always '.'.
   * An empty string is treated as a relative path.
   */
  static split(path: string): string[] {
    let parts = path.split('/').filter(el => el !== '')
    if (Path.isAbsolute(path))
      parts.unshift('/')
    else if (parts[0] !== '.')
      parts.unshift('.')
    parts = parts.filter(el => el !== '')
    return parts
  }

  /**
   * NodeJS standard see its documentation.
   */
  split(path: string): string[] {
    return Path.split(path)
  }

  /**
   * NodeJS standard see its documentation.
   */
  static basename(path: string): string {
    // if no slash return string
    // if slash return after last slash
    // if trailing slash ignore
    if (path.endsWith('/'))
      path = path.slice(0, -1)
    const beginning = path.lastIndexOf('/')
    if (beginning === -1)
      return path
    return path.substr(beginning + 1)
  }

  /**
   * NodeJS standard see its documentation.
   */
  basename(path: string): string {
    return Path.basename(path)
  }

  /**
   * NodeJS standard see its documentation.
   */
  static dirname(path: string): string {
    /* if is empty or starts with any number of . and is followed by none or any number of / -> .
     * if consists of only /es -> /
     * 1) ignore trailing slash
     * 2) ignore after last slash including the last slash
     * 3) return before new last slash
     * 4) if result is empty -> if is absolute -> / else .
     */

    let filePath = path
    if (filePath[0] === '.') {
      let onlyDotsFollowedBySlashes = true
      for (let i = 0; i < filePath.length; i++) {
        let char = filePath[i]
        if (char !== '.') {
          if (char === '/')
            for (; i < filePath.length; i++) {
              char = filePath[i]
              if (char !== '/') {
                onlyDotsFollowedBySlashes = false
                break
              }
            }
          else
            onlyDotsFollowedBySlashes = false
          break
        }
      }
      if (onlyDotsFollowedBySlashes)
        return '.'
    }

    if (filePath[0] === '/') {
      let onlySlashes = true
      for (const char of filePath)
        if (char !== '/') {
          onlySlashes = false
          break
        }
      if (onlySlashes)
        return '/'
    }

    if (filePath.endsWith('/'))
      filePath = filePath.slice(0, -1)

    const lastSlash = filePath.lastIndexOf('/')
    if (lastSlash !== -1)
      // remove everything after the last slash
      filePath = filePath.slice(0, lastSlash)
    else
      filePath = ''

    if (filePath === '') {
      if (Path.isAbsolute(path))
        return '/'
      return '.'
    }

    return filePath
  }

  /**
   * NodeJS standard see its documentation.
   */
  dirname(path: string): string {
    return Path.dirname(path)
  }

  /**
   * Due to the nature of NeatFS this function is not conform to the NodeJS standard.
   * The global Path object doesn't know the current working directory. It always assumes '/' to be the current working directory.
   * Use the Path property of NeatFS or instantiate a new Path object with a NeatFS to get the standard NodeJS behavior.
   */
  static resolve(...parts: string[]): string {
    if (parts.length === 0)
      return '/'
    for (let index = parts.length - 1; index >= 0; index--)
      if (Path.isAbsolute(parts[index])) {
        parts = parts.slice(index)
        break
      }
    let path = Path.join(...parts)
    if (path !== '/' && path.endsWith('/'))
      path = path.slice(0, -1)
    return path
  }

  /**
   * NodeJS standard see its documentation.
   */
  resolve(...parts: string[]): string {
    return Path.resolve(this.neatFS.workingDirectory, ...parts)
  }

  /**
   * NodeJS standard see its documentation.
   */
  static toNamespacedPath(path: string): string {
    return path
  }

  /**
   * NodeJS standard see its documentation.
   */
  toNamespacedPath(path: string): string {
    return Path.toNamespacedPath(path)
  }
}
