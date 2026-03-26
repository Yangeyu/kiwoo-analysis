import { GrepTool, ReadTool } from "@/core/tool/basic"
import { BashTool } from "@/core/tool/bash"
import { BatchTool } from "@/core/tool/batch"
import { TaskResumeTool, TaskTool } from "@/core/tool/task"
import type { AnyToolDefinition } from "@/core/types"

export const coreTools: AnyToolDefinition[] = [TaskTool, TaskResumeTool, BatchTool, BashTool, ReadTool, GrepTool]
