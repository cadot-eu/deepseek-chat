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
    } catch (e) {}
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
    } catch (e) {}
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
    } catch (e) {}
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
    } catch (e) {}
    res.json(prompts);
  } else {
    res.status(400).json({ error: 'Index invalide.' });
  }
});

// Envoyer un message au bot
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message manquant.' });
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: message }
      ],
      model: "deepseek-chat"
    });
    const botReply = completion.choices?.[0]?.message?.content || "Réponse indisponible.";
    history.push({ user: message, bot: botReply });
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
