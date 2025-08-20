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
let conversationSummary = '';
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
    // Envoie le message à l'API DeepSeek
    const discussionId = getDiscussionIdFromUrl();
    const payload = {
        model: "deepseek-chat",
        messages: buildContext().concat([{ role: "user", content: message }]),
        discussionId: discussionId || undefined,
        selectedHistoryIdx: selectedHistoryIdx
    };
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            return { error: error.error || 'Erreur API.' };
        }
        return await res.json();
    } catch (err) {
        return { error: 'Erreur de connexion.' };
    }
}
function getDiscussionIdFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('discussion');
}

function showChatIfId() {
    const id = getDiscussionIdFromUrl();
    const chatPanel = document.getElementById('chat-panel');
    if (chatPanel) {
        chatPanel.style.display = id ? '' : 'none';
    }
}

window.addEventListener('DOMContentLoaded', showChatIfId);
window.addEventListener('DOMContentLoaded', () => {
    historyEl.style.display = 'block';
});
window.addEventListener('popstate', showChatIfId);
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
const historyEl = document.getElementById('history');

let selectedFile = null;
let selectedHistoryIdx = null; // index de la discussion sélectionnée

function renderHistory(history) {
    historyList.innerHTML = '';
    historyList.style.display = '';
    // Ajoute le bouton dans le header du panneau historique (Bootstrap .card-header)
    // Ajout du bouton dans le header du panneau historique, même si le DOM n'est pas prêt
    function addNewDiscussionBtn() {
        const historyCard = historyList.closest('.card');
        if (historyCard) {
            const header = historyCard.querySelector('.card-header');
            if (header && !header.querySelector('#new-discussion-btn')) {
                const newDiscussionBtn = document.createElement('button');
                newDiscussionBtn.id = 'new-discussion-btn';
                newDiscussionBtn.textContent = 'Nouvelle discussion';
                newDiscussionBtn.className = 'btn btn-sm btn-info';
                newDiscussionBtn.style.marginLeft = '1rem';
                newDiscussionBtn.onclick = () => {
                    const discussionId = 'd_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
                    window.history.replaceState({}, '', '?discussion=' + discussionId);
                    selectedHistoryIdx = null;
                    recentMessages = [];
                    historyEl.innerHTML = '';
                    messageInput.value = '';
                    messageInput.placeholder = 'Votre message...';
                };
                header.appendChild(newDiscussionBtn);
            }
        }
    }
    addNewDiscussionBtn();
    // Si le bouton n'est pas là, on réessaie après un court délai (DOM async)
    setTimeout(addNewDiscussionBtn, 300);
    // Tri décroissant par date
    if (!Array.isArray(history)) return;
    // Utilise la variable globale pour garder la référence
    window.historyData = history.slice().sort((a, b) => {
        const da = new Date(a.date || a.timestamp || 0);
        const db = new Date(b.date || b.timestamp || 0);
        return db - da;
    });
    window.historyData.forEach((item, idx) => {
        // Titre = première question user, en ignorant le prompt système et sa première réponse
        let title = 'Sans titre';
        if (item.messages && item.messages.length) {
            let startIdx = 0;
            if (
                item.messages.length > 2 &&
                item.messages[0].role === 'system' &&
                item.messages[1].role === 'user' &&
                item.messages[2].role === 'assistant'
            ) {
                startIdx = 3;
            }
            for (let i = startIdx; i < item.messages.length; i++) {
                if (item.messages[i].role === 'user') {
                    title = item.messages[i].content;
                    break;
                }
            }
        }
        let dateStr = '';
        if (item.date) {
            const d = new Date(item.date);
            dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
        } else if (item.timestamp) {
            const d = new Date(item.timestamp);
            dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
        }
        const li = document.createElement('li');
        li.style.position = 'relative';
        li.textContent = title.length > 40 ? title.slice(0, 40) + '…' : title;
        li.title = dateStr || '';
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
            // Ajoute l'id de discussion à l'URL
            if (item.id) {
                window.history.replaceState({}, '', '?discussion=' + item.id);
            }
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
        // Masque le prompt système et sa première réponse
        let startIdx = 0;
        if (item.messages.length > 2 && item.messages[0].role === 'system' && item.messages[1].role === 'user' && item.messages[2].role === 'assistant') {
            startIdx = 1; // commence à la première question user
        }
        for (let i = startIdx; i < item.messages.length; i++) {
            const msg = item.messages[i];
            if (msg.role === 'system') continue; // ne jamais afficher le prompt système
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + (msg.role === 'user' ? 'user' : 'bot');
            msgDiv.innerHTML = `<div class="message-content">${msg.role === 'assistant' ? safeMarkdownParse(msg.content) : escapeHtml(msg.content)}`;
            historyEl.appendChild(msgDiv);
        }
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
            // Ajoute à l'historique local pour buildContext
            recentMessages.push({ role: 'user', content: msg });
            recentMessages.push({ role: 'assistant', content: res.reply });
            // Affiche le message dans l'historique, même si aucune discussion n'est sélectionnée
            historyEl.innerHTML += `<div class="message user"><div class="message-content">${escapeHtml(msg)}</div></div>`;
            historyEl.innerHTML += `<div class="message bot"><div class="message-content">${safeMarkdownParse(res.reply)}</div></div>`;
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

// Relie le bouton 'Nouvelle discussion' à la logique JS
const newDiscussionBtn = document.getElementById('new-discussion-btn');
// Appeler showChatIfId après chaque navigation ou création de discussion
function nouvelleDiscussion() {
    // ...existing code...
    showChatIfId();
}
if (newDiscussionBtn) {
    newDiscussionBtn.addEventListener('click', async () => {
        const discussionId = 'd_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        window.history.replaceState({}, '', '?discussion=' + discussionId);
        selectedHistoryIdx = null;
        recentMessages = [];
        historyEl.innerHTML = '';
        messageInput.value = '';
        messageInput.placeholder = 'Votre message...';
        // Envoie le prompt système à DeepSeek pour initialiser la discussion
        setStatus('Initialisation de la discussion...');
        statusIndicator.style.display = 'block';
        await sendMessage(SYSTEM_PROMPT);
        setTimeout(() => setStatus(''), 2000);
    });
}

function escapeHtml(text) {
    return text.replace(/[&<>"]|'/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
}

function scrollHistoryToBottom() {
    if (historyEl) historyEl.scrollTop = historyEl.scrollHeight;
}

async function loadHistory() {
    const history = await fetchHistory();
    renderHistory(history);
}
