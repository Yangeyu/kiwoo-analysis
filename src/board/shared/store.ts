import type {
  BoardAnalysisAsset,
  BoardAnalysisBundleType,
  BoardAnalysisContext,
  BoardAnalysisDatasetSummary,
} from "@/board/types"
import type { ISessionStore } from "@/core/session/store/types"
import { createID } from "@/core/types"

type StoredBoardAnalysisDataset = {
  id: string
  context: BoardAnalysisContext
  assets: BoardAnalysisAsset[]
  sessionId: string
  createdAt: string
}

const datasetStore = new WeakMap<ISessionStore, Map<string, StoredBoardAnalysisDataset>>()

export function createBoardAnalysisDataset(input: {
  store: ISessionStore
  sessionId: string
  context: BoardAnalysisContext
}) {
  const dataset: StoredBoardAnalysisDataset = {
    id: createID(),
    context: input.context,
    assets: [],
    sessionId: input.sessionId,
    createdAt: new Date().toISOString(),
  }

  datasetsFor(input.store).set(dataset.id, dataset)
  return dataset
}

export function getBoardAnalysisDataset(input: {
  store: ISessionStore
  analysisId: string
}) {
  const dataset = datasetsFor(input.store).get(input.analysisId)
  if (!dataset) {
    throw new Error(`Board analysis dataset not found: ${input.analysisId}`)
  }
  return dataset
}

export function summarizeBoardAnalysisDataset(dataset: StoredBoardAnalysisDataset): BoardAnalysisDatasetSummary {
  return {
    analysisId: dataset.id,
    analysisScope: dataset.context.analysisScope,
    overview: dataset.context.overview,
    boardAggregates: dataset.context.boardAggregates,
    boardCleaningLogs: dataset.context.boardCleaningLogs,
    assets: {
      count: dataset.assets.length,
      items: dataset.assets.map((asset) => ({
        name: asset.name,
        focus: asset.focus,
        sourceBundleTypes: asset.sourceBundleTypes,
        updatedAt: asset.updatedAt,
      })),
    },
    bundles: [
      describeBundle(dataset.context, "section_bundle", "Section-grouped nodes and section structure evidence"),
      describeBundle(dataset.context, "text_bundle", "Notes and ai_note content for claim and contradiction analysis"),
      describeBundle(dataset.context, "report_bundle", "Report-like materials and prior synthesized content"),
      describeBundle(dataset.context, "web_bundle", "Linked source items and external evidence references"),
      describeBundle(dataset.context, "chart_bundle", "Chart items and quantitative signals"),
    ],
  }
}

export function readBoardAnalysisBundle(input: {
  store: ISessionStore
  analysisId: string
  bundleType: BoardAnalysisBundleType
}) {
  const dataset = getBoardAnalysisDataset({
    store: input.store,
    analysisId: input.analysisId,
  })

  return {
    analysisId: dataset.id,
    summary: summarizeBoardAnalysisDataset(dataset),
    bundleType: input.bundleType,
    analysisScope: dataset.context.analysisScope,
    overview: dataset.context.overview,
    bundle: dataset.context.researchBundles[input.bundleType],
  }
}

export function upsertBoardAnalysisAsset(input: {
  store: ISessionStore
  analysisId: string
  name: string
  content: string
  focus?: string
  sourceBundleTypes: BoardAnalysisBundleType[]
}) {
  const dataset = getBoardAnalysisDataset({
    store: input.store,
    analysisId: input.analysisId,
  })
  const now = new Date().toISOString()
  const existing = dataset.assets.find((asset) => asset.name === input.name)

  if (existing) {
    existing.content = input.content
    existing.focus = input.focus
    existing.sourceBundleTypes = input.sourceBundleTypes
    existing.updatedAt = now
    return existing
  }

  const asset: BoardAnalysisAsset = {
    name: input.name,
    content: input.content,
    focus: input.focus,
    sourceBundleTypes: input.sourceBundleTypes,
    createdAt: now,
    updatedAt: now,
  }

  dataset.assets.push(asset)
  return asset
}

export function readBoardAnalysisAssets(input: {
  store: ISessionStore
  analysisId: string
  names?: string[]
}) {
  const dataset = getBoardAnalysisDataset({
    store: input.store,
    analysisId: input.analysisId,
  })
  const wanted = input.names ? new Set(input.names) : undefined
  const assets = wanted
    ? dataset.assets.filter((asset) => wanted.has(asset.name))
    : dataset.assets

  return {
    analysisId: dataset.id,
    summary: summarizeBoardAnalysisDataset(dataset),
    assets,
  }
}

function datasetsFor(store: ISessionStore) {
  const existing = datasetStore.get(store)
  if (existing) return existing
  const created = new Map<string, StoredBoardAnalysisDataset>()
  datasetStore.set(store, created)
  return created
}

function describeBundle(
  context: BoardAnalysisContext,
  type: BoardAnalysisBundleType,
  description: string,
) {
  return {
    type,
    itemCount: context.researchBundles[type].length,
    description,
  }
}
