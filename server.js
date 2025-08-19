const fs = require('fs');
const path = require('path');
const HISTORY_PATH = path.join(__dirname, 'history.json');
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
import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
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

// Stockage des fichiers uploadés
defineUploadDir();
const upload = multer({ dest: 'uploads/' });

// Historique persistant
let history = [];
try {
    if (fs.existsSync(HISTORY_FILE)) {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
} catch (e) {
    history = [];
}
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
    const { model, messages, stream } = req.body;
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
            // DeepSeek's SDK returns an async iterator for streaming
            for await (const chunk of streamRes) {
                const content = chunk.choices?.[0]?.delta?.content;
                if (content) botReply += content;
            }
        } else {
            // Non-streaming mode
            const completion = await openai.chat.completions.create({
                model: model || "deepseek-chat",
                messages,
                stream: false
            });
            botReply = completion.choices?.[0]?.message?.content || "Réponse indisponible.";
        }
        // Append only the latest round (user + botReply) to history.json
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
            history.push({ user: lastUserMsg.content, bot: botReply });
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
