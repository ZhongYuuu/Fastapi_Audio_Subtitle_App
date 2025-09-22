from fastapi import FastAPI, Request, Form, Depends, status, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from pathlib import Path
import os
import re
import spacy

# 初始化FastAPI
app = FastAPI()

# 获取项目根目录
BASE_DIR = Path(__file__).resolve().parent

# 配置会话
app.add_middleware(SessionMiddleware, secret_key="your-secret-key-keep-it-safe")

# 挂载静态资源
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# 配置模板引擎
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# 服务端文件路径（支持多语言）
LANGUAGE_DIR = {
    "english": os.path.join(BASE_DIR, "assets", "english")
}

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------ 新增主页路由 ------------
@app.get("/", response_class=HTMLResponse)
def home_page(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request
    })

@app.get("/index", response_class=HTMLResponse)
def index_page(request: Request):
    user = request.session.get("user")
    return templates.TemplateResponse("index.html", {
        "request": request,
        "user": user
    })

# ------------ 多语言支持路由 ------------
@app.get("/files")
def list_files(lang: str = "english"):
    """获取特定语言的文件列表"""
    lang_dir = LANGUAGE_DIR.get(lang)
    files = os.listdir(lang_dir)
    mp3_files = [f for f in files if f.endswith(".mp3")]
    return {"files": [os.path.splitext(f)[0] for f in mp3_files]}

@app.get("/subtitle/{lang}/{name}")
def get_subtitle(lang: str, name: str):
    """获取特定语言的字幕数据"""
    lang_dir = LANGUAGE_DIR.get(lang)
    if not lang_dir:
        return {"error": "Language not supported"}
    
    srt_path = os.path.join(lang_dir, f"{name}_merged.srt")
    if not os.path.exists(srt_path):
        return {"error": "Subtitle not found"}
    
    with open(srt_path, "r", encoding="utf-8") as f:
        srt_content = f.read()
    
    # 根据语言选择合适的NLP模型
    nlp_model = {
        "english": "",  # en_core_web_sm
    }.get(lang, "en_core_web_sm")
    
    return parse_srt_with_ai(srt_content, nlp_model)

@app.get("/audio/{lang}/{name}")
def get_audio(lang: str, name: str):
    """获取特定语言的音频文件"""
    lang_dir = LANGUAGE_DIR.get(lang)
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

def parse_srt_with_ai(srt_content, nlp_model="en_core_web_sm"):
    """使用指定的NLP模型解析SRT内容"""
    try:
        # 尝试加载指定语言的NLP模型
        nlp = spacy.load(nlp_model)
    except Exception as e:
        print(f"无法加载NLP模型 {nlp_model}, 使用默认模型: {e}")
        nlp = spacy.load("en_core_web_sm")
    
    srt_pattern = re.compile(
        r'(\d+)\s+'
        r'(\d+:\d+:\d+,\d+)\s+-->+\s+(\d+:\d+:\d+,\d+)\s+'
        r'([\s\S]*?)(?=\n\d+\s+|$)',
        re.MULTILINE
    )
    
    entries = []
    global_index = 1
    
    for match in srt_pattern.findall(srt_content):
        _, start_str, end_str, text = match
        start_total = time_to_seconds(start_str)
        end_total = time_to_seconds(end_str)
        total_duration = end_total - start_total
        
        if total_duration <= 0:
            print(f"无效时间区间: {start_str} --> {end_str}")
            continue
        
        text = re.sub(r'\s+', ' ', text.strip())
        if not text:
            continue
        
        # 使用适当的NLP模型拆分句子
        doc = nlp(text)
        sentences = [sent.text.strip() for sent in doc.sents if sent.text.strip()]
        
        # 按句子长度分配时间
        total_chars = sum(len(sent) for sent in sentences)
        current_start = start_total
        
        for sent in sentences:
            if total_chars == 0:
                sent_duration = 0.0
            else:
                sent_duration = (len(sent) / total_chars) * total_duration
            current_end = current_start + sent_duration
            
            entries.append({
                "index": str(global_index),
                "start": round(current_start, 3),
                "end": round(current_end, 3),
                "text": sent
            })
            
            current_start = current_end
            global_index += 1
    
    return entries