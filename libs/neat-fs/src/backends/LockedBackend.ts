import { Mutex, MutexFactory } from '@feather-ink/mutex'

import Backend from './Backend'

export default interface LockedBackend<T extends Mutex = Mutex> extends Backend, MutexFactory<T> {}
