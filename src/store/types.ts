import type { DataSlice } from './dataSlice'
import type { FilterSlice } from './filterSlice'
import type { ViewSlice } from './viewSlice'

export type TwinStore = ViewSlice & DataSlice & FilterSlice
