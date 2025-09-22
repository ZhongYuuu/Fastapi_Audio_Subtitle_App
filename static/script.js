// 原有JavaScript逻辑保持不变
const fileListEl = document.getElementById('fileListItems');
const audioEl = document.getElementById('audio');
const textEl = document.getElementById('text');
const articleTitleEl = document.getElementById('articleTitle');
const languageTabs = document.querySelectorAll('.language-tab');
let currentSentences = [];
let currentSelectedFile = null;
let currentLanguage = 'english'; // 默认语言
const DOUBLE_CLICK_DELAY = 250;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const langFromUrl = urlParams.get('lang');
    if (langFromUrl && ['english', 'german', 'french', 'spanish'].includes(langFromUrl)) {
        currentLanguage = langFromUrl;
        updateActiveTab(currentLanguage);
    }
    
    loadLanguageFiles(currentLanguage);
    
    languageTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const lang = tab.dataset.lang;
            if (lang !== currentLanguage) {
                currentLanguage = lang;
                updateActiveTab(lang);
                loadLanguageFiles(lang);
            }
        });
    });
});

function updateActiveTab(lang) {
    languageTabs.forEach(tab => {
        if (tab.dataset.lang === lang) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

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
        if (audioEl.src) {
            if (audioEl.paused) {
                audioEl.play().catch(err => {
                    console.log('需要用户交互才能播放:', err);
                });
            } else {
                audioEl.pause();
            }
        }
    }
});