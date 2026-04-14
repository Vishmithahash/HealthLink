import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Activity } from 'lucide-react';

const SymptomChecker = () => {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'ai', text: 'Hello! I am the HealthConnect AI Symptom Checker. Please describe your symptoms (e.g., headache, fever, cough).' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = { id: Date.now(), sender: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsTyping(true);

        // Mock AI Response
        setTimeout(() => {
            let aiResponse = "Based on your symptoms, it could be a mild viral infection. I recommend resting, staying hydrated, and booking an appointment with a General Practitioner if symptoms persist for more than 48 hours.";

            const lowerInput = userMessage.text.toLowerCase();
            if (lowerInput.includes('chest pain') || lowerInput.includes('shortness of breath')) {
                aiResponse = "⚠️ WARNING: Chest pain or shortness of breath can be signs of a medical emergency. Please seek immediate emergency medical care or call your local emergency number.";
            } else if (lowerInput.includes('headache') || lowerInput.includes('migraine')) {
                aiResponse = "For headaches, ensure you are drinking enough water and resting in a quiet, dark room. If it is severe or accompanied by vision changes, consider seeing a Neurologist.";
            }

            setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: aiResponse }]);
            setIsTyping(false);
        }, 1500);
    };

    return (
        <div className="max-w-4xl mx-auto h-[80vh] flex flex-col bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in">
            <div className="bg-slate-800 p-4 text-white flex items-center shadow-md z-10">
                <Bot className="h-8 w-8 text-blue-400 mr-3" />
                <div>
                    <h2 className="text-xl font-bold">AI Symptom Checker</h2>
                    <p className="text-xs text-slate-300">Powered by HealthConnect ML (Mock)</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex max-w-[80%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${msg.sender === 'user' ? 'bg-blue-600 ml-3' : 'bg-slate-800 mr-3'}`}>
                                {msg.sender === 'user' ? <User className="h-6 w-6 text-white" /> : <Activity className="h-6 w-6 text-blue-400" />}
                            </div>
                            <div className={`p-4 rounded-2xl shadow-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="flex flex-row max-w-[80%]">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-800 mr-3 flex items-center justify-center">
                                <Bot className="h-6 w-6 text-blue-400" />
                            </div>
                            <div className="p-4 rounded-2xl bg-white border border-slate-200 text-slate-500 rounded-tl-none flex items-center space-x-2">
                                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"></div>
                                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-200">
                <form onSubmit={handleSend} className="flex space-x-4">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        className="flex-1 border border-slate-300 rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition"
                        placeholder="Describe your symptoms (e.g., I have a bad headache...)"
                        disabled={isTyping}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isTyping}
                        className="bg-blue-600 text-white rounded-full p-3 hover:bg-blue-700 transition disabled:bg-slate-300 shadow-sm"
                    >
                        <Send className="h-6 w-6" />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default SymptomChecker;
