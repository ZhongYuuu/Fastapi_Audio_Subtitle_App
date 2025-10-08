from fastapi import FastAPI, Request, Form, Depends, status, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import os
import re
import json
from typing import Dict, List

app = FastAPI()
# 获取项目根目录
BASE_DIR = Path(__file__).resolve().parent
# 挂载静态资源
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
# 配置模板引擎
templates = Jinja2Templates(directory=BASE_DIR / "templates")
# 服务端文件路径（支持多语言）
LANGUAGE_DIR = os.path.join(BASE_DIR, "assets", "english")
# 笔记本数据存储路径
NOTEBOOK_DIR = BASE_DIR / "notebook_data"
NOTEBOOK_DIR.mkdir(exist_ok=True)


# ------------ 新增主页路由 ------------
@app.get("/", response_class=HTMLResponse)
def home_page(request: Request):
    return index(request)

@app.get("/index", response_class=HTMLResponse)
def index_page(request: Request):
    return index(request)

def index(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request
    })
# ------------ 多语言支持路由 ------------
@app.get("/files")
def list_files(lang: str = "english"):
    """获取特定语言的文件列表"""
    files = os.listdir(LANGUAGE_DIR)
    mp3_files = [f for f in files if f.endswith(".mp3")]
    return {"files": [os.path.splitext(f)[0] for f in mp3_files]}

@app.get("/subtitle/{lang}/{name}")
def get_subtitle(lang: str, name: str):
    """获取特定语言的字幕数据"""
    lang_dir = LANGUAGE_DIR
    if not lang_dir:
        return {"error": "Language not supported"}
    
    srt_path = os.path.join(lang_dir, f"{name}_merged.srt")
    if not os.path.exists(srt_path):
        return {"error": "Subtitle not found"}
    
    with open(srt_path, "r", encoding="utf-8") as f:
        srt_content = f.read()
    
    return parse_srt_simple(srt_content)
    # return parse_srt_with_ai(srt_content)

@app.get("/audio/{lang}/{name}")
def get_audio(lang: str, name: str):
    """获取特定语言的音频文件"""
    lang_dir = LANGUAGE_DIR
    if not lang_dir:
        raise HTTPException(status_code=404, detail="Language not supported")
    
    mp3_path = os.path.join(lang_dir, f"{name}.mp3")
    if not os.path.exists(mp3_path):
        raise HTTPException(status_code=404, detail="Audio not found")
    
    return FileResponse(mp3_path, media_type="audio/mpeg")

# ------------ 工具函数 ------------
def time_to_seconds(time_str):
    try:
        h, m, s_ms = time_str.split(':')
        s, ms = s_ms.split(',')
        return float(h) * 3600 + float(m) * 60 + float(s) + float(ms) / 1000
    except Exception as e:
        print(f"时间格式错误: {time_str}, 错误: {e}")
        return 0.0

def parse_srt_simple(srt_content):
    """不使用spacy的简单SRT解析函数 - 直接返回SRT中的原始条目"""
    srt_pattern = re.compile(
        r'(\d+)\s+'
        r'(\d+:\d+:\d+,\d+)\s+-->+\s+(\d+:\d+:\d+,\d+)\s+'
        r'([\s\S]*?)(?=\n\d+\s+|$)',
        re.MULTILINE
    )

    entries = []
    for match in srt_pattern.findall(srt_content):
        index, start_str, end_str, text = match
        start_total = time_to_seconds(start_str)
        end_total = time_to_seconds(end_str)
        total_duration = end_total - start_total
        
        if total_duration <= 0:
            print(f"无效时间区间: {start_str} --> {end_str}")
            continue
        
        text = re.sub(r'\s+', ' ', text.strip())
        if not text:
            continue
        
        entries.append({
            "index": index,
            "start": round(start_total, 3),
            "end": round(end_total, 3),
            "text": text
        })
    
    return entries

# ------------ 笔记本功能路由 ------------
@app.get("/api/notes/{article_name}")
def get_notes(article_name: str):
    """获取指定文章的笔记"""
    note_file = NOTEBOOK_DIR / f"{article_name}.json"
    if note_file.exists():
        with open(note_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"words": []}

@app.post("/api/notes/{article_name}")
def save_notes(article_name: str, words: List[str] = Form(...)):
    """保存指定文章的笔记"""
    note_file = NOTEBOOK_DIR / f"{article_name}.json"
    data = {"words": words}
    with open(note_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "success"}

@app.get("/api/all-notes")
def get_all_notes():
    """获取所有文章的笔记列表"""
    notes = {}
    for note_file in NOTEBOOK_DIR.glob("*.json"):
        article_name = note_file.stem
        with open(note_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            notes[article_name] = data["words"]
    return notes
