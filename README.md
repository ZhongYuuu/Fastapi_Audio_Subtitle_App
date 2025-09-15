run:
.venv\Scripts\activate
uvicorn main:app --port 3457 --reload
uvicorn main:app --host "0.0.0.0" --port 3456 --reload
一定是0.0.0.0不能是127.0.0.1否则开了防火墙也无法上公网