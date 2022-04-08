import { Mutex, MutexFactory } from '@ink-feather-org/ts-mutex'

import { Backend } from './Backend'

export interface LockedBackend<T extends Mutex = Mutex> extends Backend, MutexFactory<T> {}
