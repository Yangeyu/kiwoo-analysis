import { useState } from "react"
import { ThoughtStep } from "./ThoughtStep"
import type { ArtifactFile, AssistantBubble } from "../types"

export function ChainOfThought({ 
  agent, 
  steps, 
  isStreaming,
  onShowDetail,
  onShowArtifact
}: { 
  agent: string, 
  steps: AssistantBubble[], 
  isStreaming: boolean,
  onShowDetail: (content: string) => void,
  onShowArtifact: (file: ArtifactFile) => void
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between group/header">
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#171717] text-white shadow-lg">
            <span className="text-[10px] font-black italic">AI</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-[#D4AF37] leading-none">
              {agent}
            </span>
            <span className="text-[10px] text-zinc-400 font-medium mt-1">Chain of Thought • {steps.length} Steps</span>
          </div>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:text-zinc-900 transition-colors cursor-pointer"
        >
          {isExpanded ? "Collapse Chain" : "Expand Chain"}
        </button>
      </div>

      {isExpanded && (
        <div className="ml-4">
          {steps.map((step, idx) => (
            <ThoughtStep 
              key={step.id} 
              bubble={step} 
              isLast={idx === steps.length - 1} 
              isStreaming={isStreaming && idx === steps.length - 1}
              onShowDetail={onShowDetail}
              onShowArtifact={onShowArtifact}
            />
          ))}
        </div>
      )}
    </div>
  )
}
