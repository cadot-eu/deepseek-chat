// Ajoute dans public/index.html avant <script src="app.js"> :
// <script src="showdown.min.js"></script>

function safeMarkdownParse(text) {
    // Use marked.js from CDN
    return window.marked.parse(text);
}

async function fetchHistory() {
    const res = await fetch('/api/history');
    return res.json();
}
async function fetchPrompts() {
    const res = await fetch('/api/prompts');
    return res.json();
}

let SYSTEM_PROMPT = "Réponds-moi en français, sois concis et limite chaque explication à une seule phrase simple. Donne-moi uniquement l'essentiel, sans détails inutiles.";
let recentMessages = [];
const MAX_TOKENS = 3000; // For future use if needed
const MAX_RECENT = 15;
const SUMMARY_CHUNK = 10;

function buildContext() {
    const messages = [];
    if (conversationSummary) {
        messages.push({
            role: "system",
            content: `Contexte précédent : ${conversationSummary}`
        });
    }
    // Only send the most recent messages (up to MAX_RECENT)
    if (recentMessages.length > MAX_RECENT) {
        messages.push(...recentMessages.slice(-MAX_RECENT));
    } else {
        messages.push(...recentMessages);
    }
    return messages;
}

function manageContext() {
    if (recentMessages.length > MAX_RECENT) {
        // Summarize the oldest messages
        const toSummarize = recentMessages.slice(0, SUMMARY_CHUNK);
        conversationSummary = createSummary(toSummarize);
        recentMessages = recentMessages.slice(SUMMARY_CHUNK);
    }
}

function createSummary(messages) {
    // Résumé automatique (à améliorer avec une vraie API si besoin)
    // Ici, on concatène les contenus pour simplifier
    return messages.map(m => `${m.role}: ${m.content}`).join(' | ');
}

async function sendMessage(message) {
    // Always start with the system prompt for context caching
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...recentMessages,
        { role: 'user', content: message }
    ];
    // Log what is sent to DeepSeek
    console.log('Envoi à DeepSeek:', {
        question: message,
        messages: messages
    });
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: messages,
            stream: true
        })
    });
    // After sending, update local recentMessages
    recentMessages.push({ role: 'user', content: message });
    if (res.ok) {
        const data = await res.json();
        if (data.reply) {
            recentMessages.push({ role: 'assistant', content: data.reply });
            manageContext();
        }
        return data;
    } else {
        return { error: 'Erreur API.' };
    }
}
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });
    return res.json();
}

// UI
const historyEl = document.getElementById('history');
const chatPanel = document.getElementById('chat-panel');
const historyList = document.getElementById('history-list');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message');
const attachBtn = document.getElementById('attach-btn');
const fileUpload = document.getElementById('file-upload');
const promptsList = document.getElementById('prompts-list');
const newPromptInput = document.getElementById('new-prompt');
const addPromptBtn = document.getElementById('add-prompt');
const statusIndicator = document.getElementById('status-indicator');

let selectedFile = null;
let selectedHistoryIdx = null; // index de la discussion sélectionnée

function renderHistory(history) {
    historyList.innerHTML = '';
    // Tri décroissant par date
    history = history.slice().sort((a, b) => {
        const da = new Date(a.date || a.timestamp || 0);
        const db = new Date(b.date || b.timestamp || 0);
        return db - da;
    });
    history.forEach((item, idx) => {
        const li = document.createElement('li');
        li.style.position = 'relative';
        // Affiche la date et l'heure
        let dateStr = '';
        if (item.date) {
            const d = new Date(item.date);
            dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
        } else if (item.timestamp) {
            const d = new Date(item.timestamp);
            dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
        }
        li.textContent = `[${dateStr}] ` + (item.user?.length > 40 ? item.user.slice(0, 40) + '…' : item.user);
        li.title = item.user;
        // Bouton suppression
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.style.position = 'absolute';
        delBtn.style.right = '8px';
        delBtn.style.top = '8px';
        delBtn.style.background = 'none';
        delBtn.style.border = 'none';
        delBtn.style.color = '#f87171';
        delBtn.style.cursor = 'pointer';
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            await deleteHistory(idx);
            await loadHistory();
        };
        li.appendChild(delBtn);
        // Afficher la discussion complète au clic
        li.onclick = () => {
            selectedHistoryIdx = idx;
            showDiscussion(item);
        };
        historyList.appendChild(li);
    });
}

function showDiscussion(item) {
    historyEl.style.display = 'block';
    historyEl.innerHTML = '';
    // Si item contient un tableau de messages, on affiche tout le fil
    if (item.messages && Array.isArray(item.messages)) {
        item.messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + (msg.role === 'user' ? 'user' : 'bot');
            msgDiv.innerHTML = `<div class="message-content">${msg.role === 'assistant' ? safeMarkdownParse(msg.content) : escapeHtml(msg.content)}`;
            historyEl.appendChild(msgDiv);
        });
    } else {
        // Ancien format : user/bot
        const userMsg = document.createElement('div');
        userMsg.className = 'message user';
        userMsg.innerHTML = `<div class="message-content">${escapeHtml(item.user)}`;
        historyEl.appendChild(userMsg);
        const botMsg = document.createElement('div');
        botMsg.className = 'message bot';
        botMsg.innerHTML = `<div class="message-content">${safeMarkdownParse(item.bot)}`;
        historyEl.appendChild(botMsg);
    }
    scrollHistoryToBottom();
    // Ajout bouton reprendre, visuellement séparé
    const sep = document.createElement('div');
    sep.style.height = '2rem';
    sep.style.display = 'flex';
    sep.style.alignItems = 'center';
    sep.style.justifyContent = 'center';
    sep.innerHTML = '<hr style="width:80%;border:1px dashed #38bdf8;">';
    historyEl.appendChild(sep);

    let resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) resumeBtn.remove();
    resumeBtn = document.createElement('button');
    resumeBtn.id = 'resume-btn';
    resumeBtn.textContent = 'Reprendre la discussion';
    resumeBtn.style.margin = '1rem 0';
    resumeBtn.style.background = '#38bdf8';
    resumeBtn.style.color = '#fff';
    resumeBtn.style.border = 'none';
    resumeBtn.style.borderRadius = '8px';
    resumeBtn.style.padding = '0.5rem 1.2rem';
    resumeBtn.style.cursor = 'pointer';
    resumeBtn.style.fontWeight = 'bold';
    resumeBtn.style.boxShadow = '0 2px 8px #38bdf888';
    resumeBtn.onclick = () => {
        messageInput.value = '';
        messageInput.placeholder = 'Reprendre la discussion…';
        messageInput.focus();
        recentMessages = item.messages && Array.isArray(item.messages)
            ? item.messages.slice()
            : [
                { role: 'user', content: item.user },
                { role: 'assistant', content: item.bot }
            ];
        historyEl.scrollTop = historyEl.scrollHeight;
    };
    historyEl.appendChild(resumeBtn);
}

async function deleteHistory(idx) {
    await fetch(`/api/history/${idx}`, { method: 'DELETE' });
}

function renderPrompts(prompts) {
    promptsList.innerHTML = '';
    prompts.forEach((prompt, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${escapeHtml(prompt)}</span>
  <button onclick="editPrompt(${idx})">✏️</button>
  <button onclick="deletePrompt(${idx})">🗑️</button>`;
        li.onclick = () => { messageInput.value = prompt; };
        promptsList.appendChild(li);
    });
}

window.editPrompt = async function (idx) {
    const newPrompt = prompt('Modifier le prompt:', promptsList.children[idx].querySelector('span').textContent);
    if (newPrompt) {
        await fetch(`/api/prompts/${idx}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: newPrompt })
        });
        loadPrompts();
    }
}
window.deletePrompt = async function (idx) {
    await fetch(`/api/prompts/${idx}`, { method: 'DELETE' });
    loadPrompts();
}
addPromptBtn.onclick = async () => {
    const val = newPromptInput.value.trim();
    if (val) {
        await fetch('/api/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: val })
        });
        newPromptInput.value = '';
        loadPrompts();
    }
};

chatForm.onsubmit = async (e) => {
    e.preventDefault();
    let msg = messageInput.value.trim();
    if (!msg && !selectedFile) {
        setStatus('Veuillez entrer un message ou joindre un fichier.');
        setTimeout(() => setStatus(''), 5000);
        return;
    }
    setStatus('Question envoyée…');
    statusIndicator.style.display = 'block';
    if (selectedFile) {
        setStatus('Envoi de la pièce jointe…');
        statusIndicator.style.display = 'block';
        const uploadRes = await uploadFile(selectedFile);
        msg += `\n[Pièce jointe: ${uploadRes.originalname}]`;
        selectedFile = null;
        fileUpload.value = '';
    }
    messageInput.value = '';
    setStatus('Attente de DeepSeek…');
    statusIndicator.style.display = 'block';
    try {
        const res = await sendMessage(msg);
        if (res.reply) {
            setStatus('Réponse reçue');
            statusIndicator.style.display = 'block';
            historyEl.style.display = 'block';
            const userMsg = document.createElement('div');
            userMsg.className = 'message user';
            userMsg.innerHTML = `<div class=\"message-content\">${escapeHtml(msg)}`;
            historyEl.appendChild(userMsg);
            const botMsg = document.createElement('div');
            botMsg.className = 'message bot';
            botMsg.innerHTML = `<div class=\"message-content\">${safeMarkdownParse(res.reply)}`;
            historyEl.appendChild(botMsg);
            scrollHistoryToBottom();
            // Ajoute la question/réponse à la discussion sélectionnée si existante
            if (selectedHistoryIdx !== null) {
                // Récupère l'historique actuel
                const history = await fetchHistory();
                const item = history[selectedHistoryIdx];
                if (item) {
                    if (!item.messages || !Array.isArray(item.messages)) {
                        // Migration ancien format
                        item.messages = [
                            { role: 'user', content: item.user },
                            { role: 'assistant', content: item.bot }
                        ];
                    }
                    item.messages.push({ role: 'user', content: msg });
                    item.messages.push({ role: 'assistant', content: res.reply });
                    // Met à jour côté serveur
                    await fetch(`/api/history/${selectedHistoryIdx}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(item)
                    });
                }
            }
        } else if (res.error) {
            setStatus('Erreur API: ' + res.error);
            statusIndicator.style.display = 'block';
            console.error('Erreur API:', res);
        } else {
            setStatus('Réponse inattendue');
            statusIndicator.style.display = 'block';
            console.error('Réponse API inattendue:', res);
        }
    } catch (err) {
        setStatus('Erreur lors de la requête');
        statusIndicator.style.display = 'block';
        console.error('Erreur de connexion DeepSeek:', err);
    }
    await loadHistory();
    setTimeout(() => setStatus(''), 5000);
};
function setStatus(text) {
    statusIndicator.textContent = text;
    statusIndicator.style.display = text ? 'block' : 'none';
}
attachBtn.onclick = () => fileUpload.click();
fileUpload.onchange = (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        attachBtn.textContent = '✅';
    } else {
        attachBtn.textContent = '📎';
    }
};

async function loadHistory() {
    const history = await fetchHistory();
    renderHistory(history);
}
async function loadPrompts() {
    const prompts = await fetchPrompts();
    renderPrompts(prompts);
}
function escapeHtml(text) {
    return text.replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[m];
    });
}

loadHistory();
loadPrompts();

// Connexion à DeepSeek au lancement et affichage du retour
(async function () {
    const defaultPrompt = SYSTEM_PROMPT;
    setStatus('Connexion à DeepSeek…');
    try {
        const res = await sendMessage(defaultPrompt);
        console.log('Réponse brute API:', res);
        historyEl.style.display = 'block';
        historyEl.innerHTML = '';
        if (res.reply) {
            const accueil = res.reply.split('Quel est votre demande')[0].trim();
            const botMsg = document.createElement('div');
            botMsg.className = 'message bot';
            botMsg.innerHTML = `<div class=\"message-content\">${safeMarkdownParse(accueil)}`;
            historyEl.appendChild(botMsg);
            setStatus('Connecté à DeepSeek');
        } else {
            setStatus('Aucune réponse API');
            console.error('Réponse API inattendue:', res);
        }
        setTimeout(() => setStatus(''), 5000);
    } catch (err) {
        setStatus('Erreur de connexion à DeepSeek');
        setTimeout(() => setStatus(''), 5000);
        console.error('DeepSeek API error:', err);
    }
})();

function scrollHistoryToBottom() {
    var historyEl = document.getElementById('history');
    if (historyEl) historyEl.scrollTop = historyEl.scrollHeight;
}
