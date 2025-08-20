import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_PATH = path.join(__dirname, 'history.json');
const HISTORY_FILE = path.join(process.cwd(), 'history.json');
const PROMPTS_FILE = path.join(process.cwd(), 'prompts.json');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API;
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: API_KEY
});

app.use(express.json());
app.use(express.static('public'));
// Met à jour une entrée de l'historique
app.put('/api/history/:idx', async (req, res) => {
    const idx = parseInt(req.params.idx, 10);
    const newItem = req.body;
    try {
        const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
        if (Array.isArray(history) && history[idx]) {
            history[idx] = newItem;
            fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Entrée non trouvée.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// Stockage des fichiers uploadés
defineUploadDir();
const upload = multer({ dest: 'uploads/' });

// Historique persistant
let history = [];
try {
    if (fs.existsSync(HISTORY_FILE)) {
        const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        // Migration automatique des anciennes entrées
        let migrated = raw.map(item => {
            if (item && item.messages && Array.isArray(item.messages)) {
                // Déjà au bon format
                return item;
            } else if (item && item.user && item.bot) {
                // Ancien format, migration
                return {
                    date: new Date().toISOString(),
                    messages: [
                        { role: 'user', content: item.user },
                        { role: 'assistant', content: item.bot }
                    ]
                };
            } else {
                return item;
            }
        });
        // Filtre les entrées qui ne contiennent qu'un prompt système et sa réponse
        history = migrated.filter(item => {
            if (item && item.messages && Array.isArray(item.messages)) {
                // Cherche un message user qui n'est pas le prompt système
                const userMessages = item.messages.filter(m => m.role === 'user');
                // Si le seul message user est le prompt système, on ignore
                if (userMessages.length === 0) return false;
                const hasRealQuestion = userMessages.some(m => m.content !== process.env.SYSTEM_PROMPT && m.content !== "Réponds-moi en français, sois concis et limite chaque explication à une seule phrase simple. Donne-moi uniquement l'essentiel, sans détails inutiles.");
                return hasRealQuestion;
            } else {
                return false;
            }
        });
        // Sauvegarde le fichier migré si besoin
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    }
} catch (e) {
    history = [];
}
// Récupérer l'historique
app.get('/api/history', (req, res) => {
    res.json(history);
});

// Supprimer une conversation de l'historique
app.delete('/api/history/:index', (req, res) => {
    const idx = parseInt(req.params.index);
    if (history[idx]) {
        history.splice(idx, 1);
        try {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        } catch (e) { }
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Index invalide.' });
    }
});

// Initialisation des prompts
let prompts = [];
try {
    if (fs.existsSync(PROMPTS_FILE)) {
        prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf-8'));
    } else {
        prompts = ["Bonjour !", "Comment puis-je vous aider ?"];
        fs.writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
    }
} catch (e) {
    prompts = ["Bonjour !", "Comment puis-je vous aider ?"];
}
// Récupérer les prompts
app.get('/api/prompts', (req, res) => {
    res.json(prompts);
});

// Ajouter un prompt
app.post('/api/prompts', (req, res) => {
    const { prompt } = req.body;
    if (prompt) {
        prompts.push(prompt);
        try {
            fs.writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
        } catch (e) { }
        res.json(prompts);
    } else {
        res.status(400).json({ error: 'Prompt manquant.' });
    }
});

// Modifier un prompt
app.put('/api/prompts/:index', (req, res) => {
    const idx = parseInt(req.params.index);
    const { prompt } = req.body;
    if (prompts[idx] && prompt) {
        prompts[idx] = prompt;
        try {
            fs.writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
        } catch (e) { }
        res.json(prompts);
    } else {
        res.status(400).json({ error: 'Prompt ou index invalide.' });
    }
});

// Supprimer un prompt
app.delete('/api/prompts/:index', (req, res) => {
    const idx = parseInt(req.params.index);
    if (prompts[idx]) {
        prompts.splice(idx, 1);
        try {
            fs.writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
        } catch (e) { }
        res.json(prompts);
    } else {
        res.status(400).json({ error: 'Index invalide.' });
    }
});

// Envoyer un message au bot
app.post('/api/chat', async (req, res) => {
    // Accept DeepSeek official payload: model, messages, stream
    const { model, messages, stream, selectedHistoryIdx } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages manquants.' });
    }
    try {
        // Forward the payload to DeepSeek API
        let botReply = "";
        if (stream) {
            // Streaming mode: accumulate chunks
            const streamRes = await openai.chat.completions.create({
                model: model || "deepseek-chat",
                messages,
                stream: true
            });
            for await (const chunk of streamRes) {
                const content = chunk.choices?.[0]?.delta?.content;
                if (content) botReply += content;
            }
        } else {
            const completion = await openai.chat.completions.create({
                model: model || "deepseek-chat",
                messages,
                stream: false
            });
            botReply = completion.choices?.[0]?.message?.content || "Réponse indisponible.";
        }
        const fullMessages = req.body.messages || [];
        const discussionId = req.body.discussionId;
        if (discussionId) {
            // Ignore selectedHistoryIdx si discussionId fourni
            let idx = history.findIndex(h => h.id === discussionId);
            if (idx !== -1) {
                // Ajoute uniquement le dernier message user et la réponse assistant
                const lastUserMsg = fullMessages.filter(m => m.role === 'user').pop();
                if (lastUserMsg) {
                    history[idx].messages.push(lastUserMsg);
                }
                history[idx].messages.push({ role: 'assistant', content: botReply });
                history[idx].date = new Date().toISOString();
            } else {
                // Nouvelle discussion si l'id n'existe pas encore
                const userMessages = fullMessages.filter(m => m.role === 'user');
                const hasRealQuestion = userMessages.some(m => m.content !== process.env.SYSTEM_PROMPT && m.content !== "Réponds-moi en français, sois concis et limite chaque explication à une seule phrase simple. Donne-moi uniquement l'essentiel, sans détails inutiles.");
                if (hasRealQuestion) {
                    history.push({
                        id: discussionId,
                        date: new Date().toISOString(),
                        messages: fullMessages.concat([{ role: 'assistant', content: botReply }])
                    });
                }
            }
        } else if (typeof selectedHistoryIdx === 'number' && history[selectedHistoryIdx]) {
            // Ajoute à la discussion existante (fallback)
            const lastUserMsg = fullMessages.filter(m => m.role === 'user').pop();
            if (lastUserMsg) {
                history[selectedHistoryIdx].messages.push(lastUserMsg);
            }
            history[selectedHistoryIdx].messages.push({ role: 'assistant', content: botReply });
            history[selectedHistoryIdx].date = new Date().toISOString();
        } else {
            // Nouvelle discussion sans id (fallback)
            const userMessages = fullMessages.filter(m => m.role === 'user');
            const hasRealQuestion = userMessages.some(m => m.content !== process.env.SYSTEM_PROMPT && m.content !== "Réponds-moi en français, sois concis et limite chaque explication à une seule phrase simple. Donne-moi uniquement l'essentiel, sans détails inutiles.");
            if (hasRealQuestion) {
                history.push({
                    id: 'd_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
                    date: new Date().toISOString(),
                    messages: fullMessages.concat([{ role: 'assistant', content: botReply }])
                });
            }
        }
        try {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        } catch (e) {
            // ignore file write error
        }
        res.json({ reply: botReply });
    } catch (e) {
        console.error('Erreur DeepSeek:', e);
        res.status(500).json({ error: 'Erreur API.' });
    }
});

// Upload de fichier
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier.' });
    res.json({ filename: req.file.filename, originalname: req.file.originalname });
});

app.listen(PORT, () => {
    console.log(`Serveur lancé sur http://localhost:${PORT}`);
});

function defineUploadDir() {
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
}

// LOGS DEBUG
console.log('API_KEY:', API_KEY);
console.log('HISTORY_FILE:', HISTORY_FILE);
console.log('Serveur prêt, endpoints: /api/chat, /api/history, /api/prompts, /api/upload');
