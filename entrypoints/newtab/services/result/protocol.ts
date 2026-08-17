import type React from 'react'

export type Result = {
  title: string
  description?: string
  iconUrl?: string
  IconType?: React.ElementType
}
export interface IResultProvider {
  priority?: number
  query: (search: string) => Promise<Result[]>
}
