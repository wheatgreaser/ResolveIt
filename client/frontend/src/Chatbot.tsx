import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./Chatbot.css";

type Message = { role: "user" | "assistant"; content: string };

const STARTER: Message = {
    role: "assistant",
    content: "Hi! I’m ResolveIt’s IT support assistant. Tell me what’s going wrong, and we’ll work through it together."
};

function Chatbot() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([STARTER]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending, open]);

    async function sendMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const content = input.trim();
        if (!content || sending) return;

        const nextMessages = [...messages, { role: "user" as const, content }];
        setMessages(nextMessages);
        setInput("");
        setError("");
        setSending(true);

        try {
            const token = localStorage.getItem("token");
            const response = await fetch("http://localhost:8080/chatbot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    messages: nextMessages.filter(message => message !== STARTER).slice(-12)
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "The assistant could not reply.");
            setMessages(current => [...current, { role: "assistant", content: data.reply }]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to reach the assistant.");
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="chatbotRoot">
            {open && (
                <section className="chatbotPanel" aria-label="ResolveIt IT support assistant">
                    <header className="chatbotHeader">
                        <div className="chatbotAvatar">✦</div>
                        <div><strong>ResolveIt Assistant</strong><span>IT support, whenever you need it</span></div>
                        <button className="chatbotClose" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
                    </header>
                    <div className="chatbotMessages" aria-live="polite">
                        {messages.map((message, index) => (
                            <div className={`chatMessage ${message.role}`} key={`${index}-${message.role}`}>
                                {message.content}
                            </div>
                        ))}
                        {sending && <div className="chatMessage assistant typing">Thinking…</div>}
                        {error && <p className="chatbotError" role="alert">{error}</p>}
                        <div ref={bottomRef} />
                    </div>
                    <form className="chatbotForm" onSubmit={sendMessage}>
                        <textarea
                            value={input}
                            onChange={event => setInput(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    event.currentTarget.form?.requestSubmit();
                                }
                            }}
                            placeholder="Describe your IT issue…"
                            aria-label="Message the assistant"
                            maxLength={2000}
                            rows={2}
                            disabled={sending}
                        />
                        <button type="submit" disabled={sending || !input.trim()} aria-label="Send message">↑</button>
                    </form>
                    <p className="chatbotHint">Basic support tips only. Never share passwords or codes.</p>
                </section>
            )}
            <button className="chatbotLauncher" onClick={() => setOpen(value => !value)} aria-label={open ? "Close support chat" : "Open support chat"}>
                <span>{open ? "×" : "✦"}</span>{!open && <span>Ask IT Assistant</span>}
            </button>
        </div>
    );
}

export default Chatbot;
