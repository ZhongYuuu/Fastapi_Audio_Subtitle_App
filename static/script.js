// 原有JavaScript逻辑保持不变
const fileListEl = document.getElementById('fileListItems');
const audioEl = document.getElementById('audio');
const textEl = document.getElementById('text');
const articleTitleEl = document.getElementById('articleTitle');
let currentSentences = [];
let currentSelectedFile = null;
let currentLanguage = 'english'; // 默认语言
const DOUBLE_CLICK_DELAY = 250;

document.addEventListener('DOMContentLoaded', () => {
    // 移动端菜单切换功能
    const menuToggle = document.getElementById('menuToggle');
    const fileList = document.getElementById('fileList');
    const backdrop = document.getElementById('backdrop');
    
    loadLanguageFiles(currentLanguage);

    if (menuToggle && fileList && backdrop) {
        function toggleMenu() {
            fileList.classList.toggle('hidden');
            backdrop.classList.toggle('show');
        }
        
        menuToggle.addEventListener('click', toggleMenu);
        
        // 点击遮罩层隐藏菜单
        backdrop.addEventListener('click', () => {
            fileList.classList.add('hidden');
            backdrop.classList.remove('show');
        });
        
        // 点击文件列表项后自动隐藏菜单（移动端）
        fileList.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI' && window.innerWidth <= 767) {
                setTimeout(() => {
                    fileList.classList.add('hidden');
                    backdrop.classList.remove('show');
                }, 300);
            }
        });
        
        // 点击主内容区域时隐藏菜单（移动端）
        document.getElementById('playerContainer').addEventListener('click', () => {
            if (window.innerWidth <= 767 && !fileList.classList.contains('hidden')) {
                fileList.classList.add('hidden');
                backdrop.classList.remove('show');
            }
        });
        
        // 窗口大小改变时的处理
        window.addEventListener('resize', () => {
            if (window.innerWidth > 767) {
                fileList.classList.remove('hidden');
                backdrop.classList.remove('show');
            } else {
                fileList.classList.add('hidden');
            }
        });
    }
});

function loadLanguageFiles(lang) {
    fileListEl.innerHTML = '<li class="loading">加载中...</li>';
    
    fetch(`/files?lang=${lang}`)
        .then(res => res.json())
        .then(data => {
            fileListEl.innerHTML = '';
            
            if (data.files.length === 0) {
                fileListEl.innerHTML = '<li class="loading">没有找到该语言的文件</li>';
                return;
            }
            
            data.files.forEach((name, index) => {
                const li = document.createElement('li');
                li.textContent = `${index + 1}. ${name}`;
                li.addEventListener('click', () => selectFile(name, li));
                fileListEl.appendChild(li);
            });
            
            if (data.files.length > 0) {
                const firstLi = fileListEl.querySelector('li');
                if (firstLi) {
                    selectFile(data.files[0], firstLi);
                }
            }
        })
        .catch(err => {
            console.error('获取文件列表失败:', err);
            fileListEl.innerHTML = '<li class="loading" style="color: #ef4444;">加载文件列表失败</li>';
        });
}

function selectFile(name, element) {
    if (currentSelectedFile) {
        currentSelectedFile.classList.remove('selected');
    }
    element.classList.add('selected');
    currentSelectedFile = element;
    
    const articleTitle = name.replace(/\.[^/.]+$/, "");
    articleTitleEl.textContent = articleTitle;
    
    loadFile(name);
}

function loadFile(name) {
    textEl.innerHTML = '<div class="loading">正在加载...</div>';
    audioEl.pause();
    
    const audioUrl = `/audio/${currentLanguage}/${name}`;
    audioEl.src = audioUrl;
    
    fetch(`/subtitle/${currentLanguage}/${name}`)
        .then(res => res.json())
        .then(sentences => {
            currentSentences = sentences;
            renderSubtitles(sentences);
            audioEl.load();
        })
        .catch(err => {
            console.error('加载字幕失败:', err);
            textEl.innerHTML = '<div class="loading" style="color: #ef4444;">加载内容失败</div>';
        });
}

function renderSubtitles(sentences) {
    textEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    sentences.forEach(sentence => {
        const span = document.createElement('span');
        span.textContent = sentence.text + ' ';
        span.className = 'sentence';
        span.dataset.start = sentence.start;
        span.dataset.end = sentence.end;

        let lastClickTime = 0;
        let clickTimer = null;

        span.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const now = Date.now();
            const timeSinceLastClick = now - lastClickTime;
            lastClickTime = now;
            
            if (timeSinceLastClick < DOUBLE_CLICK_DELAY && timeSinceLastClick > 0) {
                clearTimeout(clickTimer);
                e.preventDefault();
                audioEl.pause();
                return;
            }
            
            clickTimer = setTimeout(() => {
                const startTime = parseFloat(span.dataset.start);
                if (!isNaN(startTime)) {
                    audioEl.currentTime = startTime;
                    audioEl.play().catch(err => {
                        console.log('需要用户交互才能播放:', err);
                    });
                    highlightCurrentSentence(startTime);
                }
            }, DOUBLE_CLICK_DELAY);
        });
        
        fragment.appendChild(span);
    });
    
    textEl.appendChild(fragment);
}

function highlightCurrentSentence(time) {
    document.querySelectorAll('.sentence').forEach(span => {
        span.classList.remove('highlight');
    });
    
    currentSentences.forEach((sentence, i) => {
        if (time >= sentence.start && time < sentence.end) {
            const spans = document.querySelectorAll('.sentence');
            if (spans[i]) {
                spans[i].classList.add('highlight');
                
                const rect = spans[i].getBoundingClientRect();
                if (rect.top < 100 || rect.bottom > window.innerHeight - 150) {
                    spans[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    });
}

audioEl.addEventListener('timeupdate', () => {
    highlightCurrentSentence(audioEl.currentTime);
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        if (audioEl.paused) {
            audioEl.play();
        } else {
            audioEl.pause();
        }
    }
});

// 记事本功能
let currentArticle = null;
const notebookSidebar = document.getElementById('notebookSidebar');
const notebookText = document.getElementById('notebookText');
const toggleNotebook = document.getElementById('toggleNotebook');
const openNotebook = document.getElementById('openNotebook');
const saveNotes = document.getElementById('saveNotes');

// 打开记事本
openNotebook.addEventListener('click', () => {
    notebookSidebar.classList.add('open');
    if (currentArticle) {
        loadNotes();
    }
});

// 关闭记事本
toggleNotebook.addEventListener('click', () => {
    notebookSidebar.classList.remove('open');
});

// 保存笔记
saveNotes.addEventListener('click', async () => {
    if (!currentArticle) {
        alert('请先选择一篇文章');
        return;
    }
    
    const words = notebookText.value.split('\n').filter(word => word.trim());
    
    try {
        const formData = new FormData();
        words.forEach(word => formData.append('words', word.trim()));
        
        const response = await fetch(`/api/notes/${currentArticle}`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            alert('保存成功！');
        } else {
            alert('保存失败，请重试');
        }
    } catch (error) {
        console.error('保存笔记失败:', error);
        alert('保存失败，请检查网络连接');
    }
});

// 加载笔记
async function loadNotes() {
    if (!currentArticle) return;
    
    try {
        const response = await fetch(`/api/notes/${currentArticle}`);
        if (response.ok) {
            const data = await response.json();
            notebookText.value = data.words.join('\n');
        }
    } catch (error) {
        console.error('加载笔记失败:', error);
        notebookText.value = '';
    }
}

// 修改selectFile函数以设置当前文章
const originalSelectFile = selectFile;
selectFile = function(name, element) {
    currentArticle = name;
    originalSelectFile(name, element);
    // 如果记事本打开，加载对应笔记
    if (notebookSidebar.classList.contains('open')) {
        loadNotes();
    }
};