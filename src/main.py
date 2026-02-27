from __future__ import annotations

from api.routes.analysis_jobs import build_app

app = build_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
