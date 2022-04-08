export enum FSErrorCode {
  ENOENT = 'ENOENT',
  EEXIST = 'EEXIST',
  EISDIR = 'EISDIR',
  EISFILE = 'EISFILE',
  ENOTDIR = 'ENOTDIR',
  ENOTFILE = 'ENOTFILE',
  ENOTLNK = 'ENOTLNK',
  ENOTEMPTY = 'ENOTEMPTY'
}

export class FSError {
  name!: string

  message!: string

  code!: FSErrorCode

  filePath!: string

  constructor(code: FSErrorCode, filePath: string) {
    const escapedFilePath = filePath.replaceAll('\'', '\\\'')
    let message: string
    switch (code) {
      case FSErrorCode.ENOENT:
        message = `'${escapedFilePath}' doesn't exist`
        break
      case FSErrorCode.EEXIST:
        message = `'${escapedFilePath}' exists`
        break
      case FSErrorCode.EISDIR:
        message = `'${escapedFilePath}' is a dir`
        break
      case FSErrorCode.EISFILE:
        message = `'${escapedFilePath}' is a file`
        break
      case FSErrorCode.ENOTDIR:
        message = `'${escapedFilePath}' isn't a directory`
        break
      case FSErrorCode.ENOTFILE:
        message = `'${escapedFilePath}' isn't a file`
        break
      case FSErrorCode.ENOTLNK:
        message = `'${escapedFilePath}' isn't a link`
        break
      case FSErrorCode.ENOTEMPTY:
        message = `'${escapedFilePath}' isn't empty`
        break
      default:
        message = `Error while working with: '${escapedFilePath}'`
    }
    const error = Error(message)

    // set immutable object properties
    Object.defineProperty(error, 'message', {
      get() {
        return message
      }
    })
    Object.defineProperty(error, 'name', {
      get() {
        return 'FSError'
      }
    })
    Object.defineProperty(error, 'code', {
      get(): FSErrorCode {
        return code
      }
    })
    Object.defineProperty(error, 'filePath', {
      get(): string {
        return filePath
      }
    })
    // capture where error occurred
    Error.captureStackTrace(error, FSError)
    return error as FSError
  }
}

export function isFSError(error: any): FSError | undefined {
  if (error.name === 'FSError')
    return error as FSError
  return undefined
}
