import { marked } from 'marked';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

function safeMarkedParse(text) {
    return marked.parse(text);
}

async function fetchHistory() {
    const res = await fetch('/api/history');
    return res.json();
}
async function fetchPrompts() {
    const res = await fetch('/api/prompts');
    return res.json();
}

let conversationSummary = "";
let recentMessages = [];

function buildContext() {
    const messages = [];
    if (conversationSummary) {
        messages.push({
            role: "system",
            content: `Contexte précédent : ${conversationSummary}`
        });
    }
    messages.push(...recentMessages);
    return messages;
}

function manageContext() {
    if (recentMessages.length > 15) {
        const toSummarize = recentMessages.slice(0, 10);
        conversationSummary = createSummary(toSummarize);
        recentMessages = recentMessages.slice(10);
    }
}

function createSummary(messages) {
    return messages.map(m => `${m.role}: ${m.content}`).join(' | ');
}

async function sendMessage(message) {
    recentMessages.push({ role: 'user', content: message });
    const context = buildContext();
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: context })
    });
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

function renderHistory(history) {
    historyList.innerHTML = '';
    history.forEach((item, idx) => {
        const li = document.createElement('li');
        li.style.position = 'relative';
        li.textContent = item.user.length > 40 ? item.user.slice(0, 40) + '…' : item.user;
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
        // Afficher la discussion dans la fenêtre principale
        li.onclick = () => {
            function showDiscussion(item, idx) {
                // Affiche la discussion dans la fenêtre principale
                historyEl.style.display = 'block';
                historyEl.innerHTML = '';
                const userMsg = document.createElement('div');
                userMsg.className = 'message user';
                userMsg.innerHTML = `<div class="message-content">${escapeHtml(item.user)}</div>`;
                historyEl.appendChild(userMsg);
                // Ajout icône refresh sous la question
                const refreshBtn = document.createElement('button');
                refreshBtn.innerHTML = '🔄';
                refreshBtn.title = 'Renvoyer la question';
                refreshBtn.style.display = 'block';
                refreshBtn.style.margin = '0.5rem auto 1rem auto';
                refreshBtn.style.background = '#0ea5e9';
                refreshBtn.style.color = '#fff';
                refreshBtn.style.border = 'none';
                refreshBtn.style.borderRadius = '50%';
                refreshBtn.style.width = '2.5rem';
                refreshBtn.style.height = '2.5rem';
                refreshBtn.style.fontSize = '1.5rem';
                refreshBtn.style.cursor = 'pointer';
                refreshBtn.onclick = async () => {
                    messageInput.value = item.user;
                    messageInput.placeholder = 'Renvoyer la question…';
                    messageInput.focus();
                    setStatus('Question renvoyée…');
                    await chatForm.onsubmit(new Event('submit'));
                };
                historyEl.appendChild(refreshBtn);
                const botMsg = document.createElement('div');
                botMsg.className = 'message bot';
                botMsg.innerHTML = `<div class="message-content">${safeMarkedParse(item.bot)}`;
                historyEl.appendChild(botMsg);
                scrollHistoryToBottom(); // Ajouté pour le défilement automatique
                // Ajout bouton reprendre
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
                resumeBtn.onclick = () => {
                    messageInput.value = item.user;
                    messageInput.placeholder = 'Reprendre la discussion…';
                    messageInput.focus();
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
                        botMsg.innerHTML = `<div class=\"message-content\">${safeMarkedParse(res.reply)}`;
                        historyEl.appendChild(botMsg);
                        scrollHistoryToBottom(); // Ajouté pour le défilement automatique
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

            function scrollHistoryToBottom() {
                setTimeout(() => {
                    historyEl.scrollTop = historyEl.scrollHeight;
                }, 100);
            }
        };
    });
}

function scrollHistoryToBottom() {
    setTimeout(() => {
        historyEl.scrollTop = historyEl.scrollHeight;
    }, 100);
}

loadHistory();
loadPrompts();

// ...existing code from public/app.js will be copied here...
