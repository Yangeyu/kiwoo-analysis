import type { ArtifactFile, AssistantBubble, ToolAttachment, ToolCallState } from "../types"

export function ThoughtStep({ 
  bubble, 
  isLast, 
  isStreaming,
  onShowDetail,
  onShowArtifact
}: { 
  bubble: AssistantBubble, 
  isLast: boolean, 
  isStreaming: boolean,
  onShowDetail: (content: string) => void,
  onShowArtifact: (file: ArtifactFile) => void
}) {
  const hasContent = bubble.reasoning || bubble.toolCalls.length > 0
  const artifactToolCalls = bubble.toolCalls.filter(isFileArtifact)
  const actionToolCalls = bubble.toolCalls.filter((toolCall) => !isFileArtifact(toolCall))

  if (!hasContent && !isLast) return null

  return (
    <div className="relative pl-8 pb-10 last:pb-0 animate-in fade-in slide-in-from-left-2 duration-500">
      {/* Vertical Connection Line */}
      {!isLast && <div className="absolute left-[3px] top-2 bottom-0 w-[1px] bg-zinc-100" />}
      
      {/* Node Indicator */}
      <div className={`absolute left-0 top-1.5 h-2 w-2 rounded-full border-2 ${isStreaming && isLast ? 'bg-[#D4AF37] border-[#D4AF37] animate-pulse' : 'bg-white border-zinc-200'}`} />

      <div className="space-y-6">
        {bubble.reasoning && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest block">Step Reasoning</span>
            <p 
              onClick={() => onShowDetail(bubble.reasoning)}
              className="text-[14px] leading-relaxed text-zinc-500 font-light whitespace-pre-wrap line-clamp-2 cursor-pointer hover:text-zinc-900 transition-colors"
            >
              {bubble.reasoning}
            </p>
          </div>
        )}

        {actionToolCalls.length > 0 && (
          <div className="space-y-4">
            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest block">Action Trace</span>
            <div className="space-y-4">
              {actionToolCalls.map((tc) => (
                <div key={tc.toolCallId} className="group/tc rounded-2xl border border-zinc-50 bg-zinc-50/30 p-4 transition-all hover:border-zinc-100 hover:bg-zinc-50/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white border border-zinc-100 shadow-sm">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400">
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                      </div>
                      <span className="text-[13px] font-semibold text-zinc-700">{tc.title || tc.toolName}</span>
                    </div>
                    {tc.output && <span className="text-[10px] font-bold text-green-500/80 bg-green-50 px-2 py-0.5 rounded-full uppercase tracking-tight">Success</span>}
                    {tc.error && <span className="text-[10px] font-bold text-red-500/80 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-tight">Error</span>}
                  </div>
                  {Boolean(tc.output || tc.error || tc.args) && (
                    <div className="mt-3 overflow-hidden border-t border-zinc-100/50 pt-3">
                      <pre className="text-[11px] leading-relaxed text-zinc-400 font-mono break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {tc.error?.message || tc.output || (typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args, null, 2))}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {artifactToolCalls.length > 0 && (
          <div className="space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] block">Artifacts</span>
            <div className="space-y-3">
              {artifactToolCalls.flatMap((tc) =>
                (tc.attachments ?? []).map((attachment, index) => {
                  const file = readArtifactFile(attachment, index)
                  return (
                    <button
                      key={`${tc.toolCallId}-${file.path}`}
                      type="button"
                      onClick={() => onShowArtifact(file)}
                      className="block w-full rounded-[28px] border border-[#D4AF37]/20 bg-[#FFFCF3] px-6 py-5 text-left shadow-sm transition-colors hover:border-[#D4AF37]/40 hover:bg-[#FFF8E1]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#D4AF37]">Artifact Bubble</div>
                          <div className="mt-3 text-[16px] font-semibold text-zinc-900 break-all">{file.filename}</div>
                          <div className="mt-2 text-[12px] leading-relaxed text-zinc-500 break-all">{file.path}</div>
                          <div className="mt-4 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            {file.mime} · {formatBytes(file.bytes)}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full border border-[#D4AF37]/20 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                          View Original
                        </div>
                      </div>
                    </button>
                  )
                }),
              )}
            </div>
          </div>
        )}

        {bubble.text && (
          <div className="pt-4 border-t border-zinc-50 mt-6">
             <div className="text-[16px] leading-[1.8] text-zinc-800 whitespace-pre-wrap font-normal">
               {bubble.text}
             </div>
          </div>
        )}

        {bubble.errored && (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50/30 px-5 py-3 text-[13px] text-red-600 font-medium">
            {bubble.errored}
          </div>
        )}
      </div>
    </div>
  )
}

function isFileArtifact(toolCall: ToolCallState) {
  return toolCall.metadata?.artifactType === "files" && Array.isArray(toolCall.attachments) && toolCall.attachments.length > 0
}

function readArtifactFile(attachment: ToolAttachment, index: number): ArtifactFile {
  return {
    path: attachment.path ?? attachment.filename ?? `file-${index + 1}`,
    filename: attachment.filename ?? `file-${index + 1}`,
    mime: attachment.mime,
    bytes: attachment.bytes ?? 0,
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
