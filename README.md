

安装py环境

# run:
- .venv\Scripts\activate
- uvicorn main:app --port 3457 --reload
- uvicorn main:app --host "0.0.0.0" --port 3456 --reload