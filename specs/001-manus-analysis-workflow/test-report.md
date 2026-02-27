# Test Report: Manus-Style Canvas Analysis Workflow

Date: 2026-02-28

## Commands

- `ruff check .`
- `python -m pytest`
- `mypy src`

## Results

- Ruff: PASS
- Pytest: PASS (`13 passed`)
- Mypy: PASS (`Success: no issues found in 52 source files`)

## Coverage by Story

- US1: model validation, topology analysis, API contract, report integration
- US2: dimension registry, dimensions contract, multi-dimension integration
- US3: comparison analyzer, compare contract, compare integration

## Notes

- Runtime warnings are from external pytest plugins and FastAPI deprecation messages.
- No blocking test failures were detected.
