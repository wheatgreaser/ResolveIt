const express = require('express');
const { authenticate } = require('./middleware');

const router = express.Router();
const API_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;

function getGenericReply(message) {
    const text = message.toLowerCase();

    if (/hack|phish|virus|malware|stolen|breach|compromis/.test(text)) {
        return 'This may be a security issue. Stop interacting with the affected account or device and contact your IT team right away. Do not share passwords or verification codes here.';
    }
    if (/password|login|sign in|account|locked/.test(text)) {
        return 'For sign-in problems, check your username and try the official password reset process. If the account is locked or the issue continues, contact your IT team. Never share your password or verification code.';
    }
    if (/wifi|wi-fi|internet|network|vpn|connection/.test(text)) {
        return 'For a connection issue, check whether other sites or services are affected, then reconnect to your network or VPN. If it still fails, note when it started and contact your IT team.';
    }
    if (/printer|printing|print/.test(text)) {
        return 'For a printing issue, check that the printer is powered on, connected, and has paper. Clear any stuck jobs and try again. If it persists, contact your IT team with the printer name and any error shown.';
    }
    if (/slow|frozen|freeze|crash|restart|computer|laptop/.test(text)) {
        return 'Try saving your work, closing and reopening the affected app, and restarting your device if it is safe to do so. If the problem returns, contact your IT team and include any error message.';
    }
    if (/app|software|error|install|update|website/.test(text)) {
        return 'Try closing and reopening the app, then check whether the issue continues. Note the exact error and what you were doing when it appeared so your IT team can investigate.';
    }

    return 'I can offer basic troubleshooting, but I may need more detail. What device or app is affected, what were you trying to do, and what happened? If work is blocked, report it to your IT team.';
}

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
    const validation = validateChatMessages(req.body?.messages);
    if (validation.error) return res.status(400).json({ message: validation.error });
    const lastMessage = validation.messages[validation.messages.length - 1];
    res.json({ reply: getGenericReply(lastMessage.content) });
});

module.exports = router;
module.exports.validateChatMessages = validateChatMessages;
module.exports.validateTriageInput = validateTriageInput;
