@echo off
echo Starting FastAPI server on port 80...
uvicorn main:app --host "0.0.0.0" --port 80 --reload
pause