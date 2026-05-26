/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { Send, Paperclip, FileText, Trash2, Bot, User, Loader2, Info, FileUp } from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Document {
  id: string;
  name: string;
  base64: string;
  mimeType: string;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isStreaming?: boolean;
}

export default function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: '안녕하세요. 사내 규정 및 매뉴얼 Q&A 챗봇입니다.\n\n우측 패널에서 취업규칙, 복무규정 등의 문서를 업로드하신 후 질문해 주시면, 해당 문서를 기반으로 정확한 근거(페이지/조항)와 함께 답변해 드립니다.'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newDocs: Document[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await convertToBase64(file);
        newDocs.push({
          id: Math.random().toString(36).substring(7),
          name: file.name,
          base64: base64.split(',')[1],
          mimeType: file.type || 'application/pdf',
        });
      } catch (error) {
        console.error('Error reading file:', error);
        alert(`파일 읽기 오류: ${file.name}`);
      }
    }
    setDocuments(prev => [...prev, ...newDocs]);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const removeDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userText = inputValue.trim();
    setInputValue('');
    
    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', text: userText };
    setMessages(prev => [...prev, newUserMsg]);
    setIsLoading(true);

    const modelMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: '', isStreaming: true }]);

    try {
      const contents = messages.filter(m => m.id !== 'welcome').map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      const currentParts: any[] = [];
      if (documents.length > 0) {
        documents.forEach(doc => {
          currentParts.push({
            inlineData: {
              data: doc.base64,
              mimeType: doc.mimeType
            }
          });
        });
      }
      currentParts.push({ text: userText });

      contents.push({
        role: 'user',
        parts: currentParts
      });

      const systemInstruction = `당신은 회사의 사내 규정, 취업규칙, 매뉴얼 등을 안내하는 전문적이고 신뢰할 수 있는 사내 Q&A 챗봇입니다.
제공된 문서(PDF, 텍스트 등)의 내용만을 기반으로 사용자의 질문에 답변하십시오.

[답변 원칙]
1. 제공된 문서에서 답변을 찾을 수 없는 경우, 반드시 "제공된 문서에서는 해당 내용을 찾을 수 없어 잘 모르겠습니다."라고 솔직하게 답변하십시오. 추측하여 답변하지 마십시오.
2. 답변을 제공할 때는 반드시 근거가 되는 문서의 이름과 함께 '몇 페이지' 또는 '제 몇 조'인지 출처를 명확하게 표기하십시오. (예: [취업규칙 제15조], [복무규정 12페이지])
3. 답변은 정중하고 전문적인 비즈니스 톤(하십시오체/해요체)을 사용하십시오.
4. 이전 대화 맥락을 고려하여 사용자의 연속된 질문에 자연스럽게 답변하십시오.
5. 마크다운을 사용하여 답변을 가독성 있게 구성하십시오.`;

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-pro-preview',
        contents: contents,
        config: {
          systemInstruction,
          temperature: 0.1,
        }
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        fullText += chunk.text;
        setMessages(prev => prev.map(msg => 
          msg.id === modelMsgId ? { ...msg, text: fullText } : msg
        ));
      }
      
      setMessages(prev => prev.map(msg => 
        msg.id === modelMsgId ? { ...msg, isStreaming: false } : msg
      ));

    } catch (error) {
      console.error('Error generating response:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === modelMsgId ? { ...msg, text: '오류가 발생했습니다. 다시 시도해 주세요.', isStreaming: false } : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full border-r border-slate-200">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight text-slate-800">사내 규정 Q&A</h1>
              <p className="text-xs text-slate-500">문서 기반 지능형 어시스턴트</p>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                msg.role === 'user' ? 'bg-slate-200' : 'bg-indigo-100 text-indigo-600'
              }`}>
                {msg.role === 'user' ? <User className="w-5 h-5 text-slate-600" /> : <Bot className="w-5 h-5" />}
              </div>
              <div className={`max-w-[75%] rounded-2xl px-5 py-4 ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-white border border-slate-200 shadow-sm text-slate-800'
              }`}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-slate">
                    {msg.text ? (
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    ) : (
                      <div className="flex items-center gap-2 text-slate-400 h-6">
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="질문을 입력하세요... (예: 연차 휴가 규정은 어떻게 되나요?)"
              className="w-full bg-slate-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-full pl-6 pr-14 py-4 text-slate-800 placeholder-slate-400 transition-all shadow-sm"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="absolute right-2 w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shadow-sm"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </button>
          </div>
          <div className="text-center mt-2">
            <p className="text-xs text-slate-400">AI는 실수를 할 수 있습니다. 중요한 사항은 원본 문서를 다시 확인해 주세요.</p>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Documents */}
      <div className="w-80 bg-white h-full flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.03)] z-20">
        <div className="p-5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            참조 문서
          </h2>
          <p className="text-xs text-slate-500 mt-1">답변의 근거가 될 문서를 업로드하세요.</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {documents.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <FileUp className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-sm">업로드된 문서가 없습니다</p>
            </div>
          ) : (
            documents.map(doc => (
              <div key={doc.id} className="group flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-medium text-slate-700 truncate" title={doc.name}>{doc.name}</p>
                    <p className="text-xs text-slate-400 uppercase">{doc.mimeType.split('/')[1] || 'FILE'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => removeDocument(doc.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                  title="문서 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            multiple
            accept=".pdf,.txt,.md,.csv"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-indigo-400 transition-all font-medium shadow-sm"
          >
            <Paperclip className="w-4 h-4" />
            문서 업로드
          </button>
          <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p>PDF, TXT, MD 형식의 사내 규정, 매뉴얼 등을 업로드할 수 있습니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
