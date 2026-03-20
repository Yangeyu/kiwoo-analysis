export type BoardItem = {
  id: string
  type: string
  title?: string
  content?: string
  position?: {
    x?: number
    y?: number
  }
  size?: {
    x?: number
    y?: number
  }
  referencedIds?: string[]
  metadata?: Record<string, unknown>
}

export type BoardLink = {
  id: string
  source?: string
  target?: string
  type?: string
  label?: string
}

export type BoardSnapshot = {
  board: {
    id: string
    title: string
    ownerId: string
    createdAt?: string
    updatedAt?: string
    coverUrl?: string
    isPublic?: boolean
    version?: number
  }
  items: BoardItem[]
  links: BoardLink[]
  viewport?: Record<string, unknown>
  metadata: {
    sourceDataId: string
    itemCount: number
    linkCount: number
    itemTypeCounts: Record<string, number>
    extractedAt: string
  }
}
