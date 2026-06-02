// src/ui/HelpAssistant.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Z } from './shared/tokens.js';
import { Btn, MicIcon, ArrowUpIcon } from './shared/components.jsx';
import { streamNarrative } from '../llm/apiClient.js';
import { buildHelpAssistantSystemPrompt, buildHelpUserMessage } from '../llm/help-assistant-prompt.js';
import { useTheme } from "./shared/ThemeContext.jsx";

// Render a line with **bold** markers converted to <strong> spans
function renderLine(line, key) {

  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span key={key}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i} style={{ fontWeight: 700, color: 'inherit' }}>{part.slice(2, -2)}</strong>
          : part
      )}
    </span>
  );
}

// Render assistant markdown text: bold, numbered lists, bullet points, blank-line paragraphs
function MarkdownContent({ text }) {
  const { C, FONT } = useTheme();
  const lines = String(text || '').split('\n');
  const nodes = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      nodes.push(<div key={`gap-${i}`} style={{ height: 6 }} />);
    } else if (/^\d+\.\s/.test(line)) {
      // Numbered list item
      const [, num, rest] = line.match(/^(\d+)\.\s(.*)$/);
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: C.accent, fontWeight: 700, minWidth: 16 }}>{num}.</span>
          <span>{renderLine(rest, 0)}</span>
        </div>
      );
    } else if (/^[-•]\s/.test(line)) {
      // Bullet point
      const rest = line.replace(/^[-•]\s/, '');
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: C.accent, minWidth: 10 }}>•</span>
          <span>{renderLine(rest, 0)}</span>
        </div>
      );
    } else {
      nodes.push(<div key={i} style={{ marginBottom: 2 }}>{renderLine(line, 0)}</div>);
    }
    i++;
  }
  return <>{nodes}</>;
}

// Simple message bubble for conversation
function MessageBubble({ role, content }) {
  const { C, FONT } = useTheme();
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const isSystem = role === 'system';

  return (
    <div style={{
      background: isUser ? C.accent + '22' : isAssistant ? C.bg : C.surface,
      border: `1px solid ${isUser ? C.accent + '44' : C.border}`,
      borderLeft: isAssistant ? `3px solid ${C.accent}` : 'none',
      borderRadius: 8,
      padding: '10px 12px',
      color: C.text,
      fontFamily: FONT,
      fontSize: 11,
      lineHeight: 1.6,
    }}>
      {isUser && (
        <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, marginBottom: 4, letterSpacing: 0.5 }}>
          YOU
        </div>
      )}
      {isAssistant && (
        <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, marginBottom: 4, letterSpacing: 0.5 }}>
          AI
        </div>
      )}
      <div style={{ color: isSystem ? C.muted : C.text }}>
        {isAssistant ? <MarkdownContent text={content} /> : content}
      </div>
    </div>
  );
}

// Suggested questions per tab/view
const SUGGESTED_QUESTIONS = {
  // Model Library
  my: [
    "How do I start a new model from scratch?",
    "Can I copy a model to create a variant?",
    "How do I export a model to share it?",
  ],
  templates: [
    "Which template should I use for a call centre?",
    "How do I use a template as a starting point?",
    "Can I modify a template after applying it?",
  ],
  public: [
    "How do I run a public model?",
    "What happens when I fork a public model?",
    "Can I edit a public model?",
  ],
  community: [
    "How do I share my model with the community?",
    "What models are available in the gallery?",
    "Can I download a community model?",
  ],
  // Designing tabs
  visual: [
    "How do I add a queue between two nodes?",
    "Why can't I connect these nodes?",
    "What do the different node colours mean?",
  ],
  entities: [
    "How do I add a priority attribute to my Customer?",
    "What's the difference between mutable and fixed attributes?",
    "How do I model patients with different triage levels?",
  ],
  queues: [
    "When should I use PRIORITY instead of FIFO?",
    "How do I set a maximum queue capacity?",
    "What happens to customers when the queue is full?",
  ],
  bevents: [
    "How do I model arrivals that happen every 5 minutes?",
    "What distribution should I use for service times?",
    "Can I schedule arrivals at specific times of day?",
  ],
  cevents: [
    "How do I make service start only when a server is free?",
    "What operators can I use in conditions?",
    "Why isn't my C-Event firing?",
  ],
  // Running
  execute: [
    "How many replications do I need for reliable results?",
    "Should I use a warm-up period? How long?",
    "Why is my queue length exploding?",
  ],
  // Analyzing
  results: [
    "What does it mean if utilisation is over 100%?",
    "How do I know if my confidence interval is good?",
    "Which scenario performed better?",
  ],
  history: [
    "How do I compare results from two different runs?",
    "Can I export my run history to Excel?",
    "How do I organise runs into experiments?",
  ],
  validate: [
    "What does 'missing Source node' mean and how do I fix it?",
    "Why am I getting a Phase C truncation warning?",
    "How do I fix 'queue customerType does not match entity type'?",
  ],
  // Default
  overview: [
    "I've never built a DES model before. Where do I start?",
    "What's the difference between B-Events and C-Events?",
    "Are there example models I can look at?",
  ],
};

function getSuggestedQuestions(currentTab, currentView, validation) {
  const key = currentTab || 'overview';
  let questions = SUGGESTED_QUESTIONS[key] || SUGGESTED_QUESTIONS.overview;
  
  // If validation errors exist, prioritise help with fixing them
  if (validation?.errors?.length > 0) {
    return [
      "How do I fix validation errors?",
      ...questions.slice(0, 2),
    ];
  }
  
  // If validation warnings exist, offer help
  if (validation?.warnings?.length > 0) {
    return [
      "What do validation warnings mean?",
      ...questions.slice(0, 2),
    ];
  }
  
  return questions.slice(0, 4);
}

function getWorkflowMode(currentTab, currentView) {
  if (currentView === 'library') return 'Library';
  
  const designingTabs = ['visual', 'entities', 'queues', 'bevents', 'cevents', 'state', 'goals'];
  const runningTabs = ['execute'];
  const analyzingTabs = ['results', 'history', 'validate', 'overview'];
  
  if (designingTabs.includes(currentTab)) return 'Designing';
  if (runningTabs.includes(currentTab)) return 'Running';
  if (analyzingTabs.includes(currentTab)) return 'Analyzing';
  
  return 'Designing';
}

function buildModelSummary(model, validation) {
  if (!model) return null;
  
  return {
    entityCount: (model.entityTypes || []).length,
    queueCount: (model.queues || []).length,
    bEventCount: (model.bEvents || []).length,
    cEventCount: (model.cEvents || []).length,
    hasValidationErrors: (validation?.errors || []).length > 0,
    hasValidationWarnings: (validation?.warnings || []).length > 0,
  };
}

export function HelpAssistant({
  isOpen,
  onClose,
  currentModel,
  currentTab,
  currentView,
  validation,
}) {
  const { C, FONT } = useTheme();
  const [conversationHistory, setConversationHistory] = useState([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [error, setError] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const conversationEndRef = useRef(null);
  const inputRef = useRef(null);
  const systemPrompt = useCallback(() => buildHelpAssistantSystemPrompt(), []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    try {
      if (conversationEndRef.current && typeof conversationEndRef.current.scrollIntoView === 'function') {
        conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (e) {
      // Ignore scroll errors in test environments
    }
  }, [conversationHistory, currentResponse]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Update suggested questions when context changes
  useEffect(() => {
    if (isOpen) {
      const questions = getSuggestedQuestions(currentTab, currentView, validation);
      setSuggestedQuestions(questions);
    }
  }, [currentTab, currentView, validation, isOpen]);

  // Handle escape key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(async (question) => {
    if (!question.trim() || isLoading) return;

    const userQuestion = question.trim();
    setInputValue('');
    setError(null);
    setCurrentResponse('');

    const workflowMode = getWorkflowMode(currentTab, currentView);
    const modelSummary = buildModelSummary(currentModel, validation);

    // Send context (workflowMode, modelSummary) only on the first turn; follow-ups send the
    // question alone so the growing history doesn't re-transmit the same static block.
    const isFirstTurn = conversationHistory.length === 0;
    const userContent = buildHelpUserMessage(userQuestion, isFirstTurn
      ? { workflowMode, currentTab, currentView, modelSummary }
      : {});

    const newHistory = [...conversationHistory, { role: 'user', content: userQuestion }];
    setConversationHistory(newHistory);
    setIsLoading(true);

    const messages = [
      { role: 'system', content: systemPrompt() },
      ...conversationHistory.slice(-10),
      { role: 'user', content: userContent },
    ];

    let accumulated = '';
    streamNarrative(
      { kind: 'help-assistant', messages, max_tokens: 800 },
      {
        onToken: token => {
          accumulated += token;
          setCurrentResponse(accumulated);
        },
        onComplete: () => {
          setConversationHistory(prev => [...prev, { role: 'assistant', content: accumulated }]);
          setCurrentResponse('');
          setIsLoading(false);
        },
        onError: err => {
          setError(err?.message || 'Failed to get response from Help Assistant');
          setIsLoading(false);
        },
      }
    );
  }, [conversationHistory, currentModel, currentTab, currentView, validation, isLoading, systemPrompt]);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
      }
      if (transcript) setInputValue(prev => prev + (prev.trim() ? ' ' : '') + transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  };

  const handleSuggestedClick = (question) => {
    handleSubmit(question);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(inputValue);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-assistant-title"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '480px',
        maxWidth: '100vw',
        background: C.surface,
        borderLeft: `1px solid ${C.border}`,
        zIndex: Z.modal,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.1)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div>
          <div id="help-assistant-title" style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            Help Assistant
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            Ask about DES Studio or modelling concepts
          </div>
        </div>
        <button
          type="button"
          aria-label="Close help"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: C.muted,
            fontSize: 18,
            cursor: 'pointer',
            lineHeight: 1,
            padding: '4px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Conversation Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {/* Suggested Questions */}
        {conversationHistory.length === 0 && suggestedQuestions.length > 0 && (
          <div style={{
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 8 }}>
              SUGGESTED QUESTIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSuggestedClick(q)}
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: C.text,
                    fontFamily: FONT,
                    fontSize: 11,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = C.accent;
                    e.currentTarget.style.background = C.accent + '11';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = C.border;
                    e.currentTarget.style.background = C.panel;
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation History */}
        {conversationHistory.map((turn, i) => (
          <MessageBubble
            key={i}
            role={turn.role}
            content={turn.content}
          />
        ))}

        {/* Current Response (streaming) */}
        {currentResponse && (
          <MessageBubble role="assistant" content={currentResponse} />
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            background: C.red + '22',
            border: `1px solid ${C.red}`,
            borderRadius: 6,
            padding: 10,
            color: C.red,
            fontFamily: FONT,
            fontSize: 11,
          }}>
            {error}
          </div>
        )}

        {/* Loading Indicator */}
        {isLoading && !currentResponse && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: C.muted,
            fontSize: 11,
            fontFamily: FONT,
          }}>
            <div style={{
              width: 16,
              height: 16,
              border: `2px solid ${C.border}`,
              borderTopColor: C.accent,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            Thinking...
          </div>
        )}

        <div ref={conversationEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        padding: '14px 18px',
        borderTop: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            aria-label="Your question"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            rows={3}
            placeholder="e.g. How do I set up exponential arrivals?"
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            style={{
              flex: 1,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              color: C.text,
              fontFamily: FONT,
              fontSize: 12,
              padding: '8px 10px',
              outline: 'none',
              boxSizing: 'border-box',
              resize: 'none',
            }}
          />
          <button
            type="button"
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            title={typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition) ? 'Voice input' : 'Voice input requires Chrome or Edge'}
            onClick={toggleListening}
            disabled={isLoading}
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: listening ? C.red + '22' : 'transparent',
              border: `1px solid ${listening ? C.red : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.45 : 1,
              transition: 'all .15s',
            }}
          >
            <MicIcon size={15} color={listening ? C.red : C.muted} />
          </button>
          <button
            type="button"
            aria-label="Send"
            onClick={() => handleSubmit(inputValue)}
            disabled={!inputValue.trim() || isLoading}
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: !inputValue.trim() || isLoading ? C.muted : C.accent,
              border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: !inputValue.trim() || isLoading ? 'not-allowed' : 'pointer',
              opacity: !inputValue.trim() || isLoading ? 0.35 : 1,
              transition: 'opacity .12s, background .12s',
            }}
          >
            <ArrowUpIcon size={16} color={C.bg} />
          </button>
        </div>
      </div>

      {/* Inline styles for animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
