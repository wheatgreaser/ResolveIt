const express = require('express');
const { authenticate } = require('./middleware');

const router = express.Router();
const API_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;

function validateTriageInput(body) {
    const { title, description } = body || {};
    if (typeof title !== 'string' || typeof description !== 'string' ||
        !title.trim() || !description.trim() || title.length > 200 || description.length > 4000) {
        return 'Enter an incident title and description (up to 4,000 characters) first.';
    }
    return null;
}

function validateChatMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        return { error: `Send between 1 and ${MAX_MESSAGES} messages.` };
    }

    const safeMessages = [];
    for (const message of messages) {
        if (!message || !['user', 'assistant'].includes(message.role) ||
            typeof message.content !== 'string' || !message.content.trim() ||
            message.content.length > MAX_MESSAGE_LENGTH) {
            return { error: 'Messages must have a valid role and contain up to 2,000 characters.' };
        }
        safeMessages.push({ role: message.role, content: message.content.trim() });
    }

    if (safeMessages[safeMessages.length - 1].role !== 'user') {
        return { error: 'The last message must be from the user.' };
    }
    return { messages: safeMessages };
}

router.post('/triage', authenticate, async (req, res) => {
    const apiKey = process.env.POLLINATIONS_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ message: 'The AI assistant is not configured yet.' });
    }

    const { title, description, service } = req.body || {};
    const validationError = validateTriageInput(req.body);
    if (validationError) return res.status(400).json({ message: validationError });

    try {
        const upstream = await fetch(API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: process.env.POLLINATIONS_MODEL || 'openai/gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an IT incident triage assistant. Review the reported issue and give: (1) a likely category from HARDWARE, SOFTWARE, NETWORK, DATABASE, CLOUD, SECURITY, AUTHENTICATION, APPLICATION, STORAGE or say Unsure; (2) a suggested impact and urgency, each LOW, MEDIUM, or HIGH, with one short reason; (3) up to three safe troubleshooting steps. Do not ask for passwords or verification codes. If there are signs of malware, phishing, data exposure, or account compromise, advise the user to stop interacting with the affected device/account and contact IT immediately. Be concise, clearly mark all priority values as suggestions, and do not claim certainty.'
                    },
                    {
                        role: 'user',
                        content: `Title: ${title.trim()}\nAffected service: ${typeof service === 'string' ? service.slice(0, 120) : 'Not selected'}\nDescription: ${description.trim()}`
                    }
                ],
                temperature: 0.2,
                max_tokens: 500
            }),
            signal: AbortSignal.timeout(30000)
        });
        if (!upstream.ok) {
            console.error('Pollinations triage returned status:', upstream.status);
            return res.status(upstream.status === 429 ? 503 : 502).json({ message: 'The AI triage service is busy or unavailable. Please try again.' });
        }
        const data = await upstream.json();
        const suggestion = data.choices?.[0]?.message?.content;
        if (typeof suggestion !== 'string' || !suggestion.trim()) {
            return res.status(502).json({ message: 'The AI service returned an empty suggestion.' });
        }
        res.json({ suggestion: suggestion.trim() });
    } catch (error) {
        console.error('Triage request failed:', error.name || 'UnknownError');
        res.status(502).json({ message: 'Unable to reach the AI service. Please try again.' });
    }
});

router.post('/', authenticate, async (req, res) => {
    const apiKey = process.env.POLLINATIONS_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            message: 'The AI assistant is not configured yet. Add POLLINATIONS_API_KEY to the server environment.'
        });
    }

    const validation = validateChatMessages(req.body?.messages);
    if (validation.error) return res.status(400).json({ message: validation.error });
    const safeMessages = validation.messages;

    try {
        const upstream = await fetch(API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: process.env.POLLINATIONS_MODEL || 'openai/gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are ResolveIt, a practical IT support assistant. Help users understand and troubleshoot common workplace technology issues. Ask focused questions when details are missing, give safe step-by-step guidance, and explain when an issue should be reported to the IT team. Never request passwords, authentication codes, or sensitive company data. Do not claim to access ResolveIt incidents or systems. Keep answers clear and concise.'
                    },
                    ...safeMessages
                ],
                temperature: 0.4,
                max_tokens: 700
            }),
            signal: AbortSignal.timeout(30000)
        });

        if (!upstream.ok) {
            console.error('Pollinations API returned status:', upstream.status);
            return res.status(upstream.status === 429 ? 503 : 502).json({
                message: upstream.status === 429
                    ? 'The free AI service is busy. Please try again in a moment.'
                    : 'The AI service could not answer right now. Please try again.'
            });
        }

        const data = await upstream.json();
        const reply = data.choices?.[0]?.message?.content;
        if (typeof reply !== 'string' || !reply.trim()) {
            return res.status(502).json({ message: 'The AI service returned an empty reply.' });
        }
        res.json({ reply: reply.trim() });
    } catch (error) {
        console.error('Chatbot request failed:', error.name || 'UnknownError');
        res.status(502).json({ message: 'Unable to reach the AI service. Please try again.' });
    }
});

module.exports = router;
module.exports.validateChatMessages = validateChatMessages;
module.exports.validateTriageInput = validateTriageInput;
