export const BoardReportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["boardId", "title", "abstract", "chapters", "conclusion", "sources"],
  properties: {
    boardId: {
      type: "string",
    },
    title: {
      type: "string",
    },
    abstract: {
      type: "string",
    },
    chapters: {
      type: "array",
      minItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body"],
        properties: {
          title: {
            type: "string",
          },
          body: {
            type: "string",
          },
        },
      },
    },
    conclusion: {
      type: "string",
    },
    sources: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
} satisfies Record<string, unknown>
