# Manus Analysis Workflow

## Overview

This service accepts a Kiwoo-style whiteboard snapshot and generates a
structured Markdown analysis report with evidence traceability.

## Workflow Steps

1. Parse snapshot payload.
2. Run selected dimensions (topology/content-quality/theme-cluster).
3. Collect evidence references.
4. Resolve report language using priority: request > user context > content inference > default.
5. Render report and expose report/comparison APIs.

## API Endpoints

- `POST /analysis-jobs`
- `GET /analysis-jobs/{jobId}`
- `GET /analysis-jobs/{jobId}/report`
- `POST /analysis-compare`

## Testing Matrix

- Unit: models and analyzers
- Contract: endpoint shape and required fields
- Integration: report generation and report comparison
- Performance: standard board latency budget test

## Local Run

1. Install dependencies:

   ```bash
   python -m pip install -e .[dev]
   ```

2. Start API service with uvicorn:

   ```bash
   uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. Open API docs:

   - `http://127.0.0.1:8000/docs`
