import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCity } from '../context/CityContext';

export default function HelpAssistant() {
  const { token, isAuthenticated } = useAuth();
  const { t, lang } = useLanguage();
  const { city } = useCity();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: 'Namaskar! I am your Nagar Setu Civic Assistant. I can help you report an issue, track a grievance, or guide you to Pune municipal services. How can I help you today?'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [reportState, setReportState] = useState({
    active: false,
    step: 0,
    department: 'roads',
    category: 'Pothole',
    title: '',
    description: '',
    address: 'Pune Central',
    isEmergency: false
  });
  const [submitting, setSubmitting] = useState(false);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Initialize Web Speech API if supported
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = lang === 'mr' ? 'mr-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsRecording(false);
      };

      recognition.onerror = () => {
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, [lang]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech-to-text is not supported by your current browser. Please type your message.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.lang = lang === 'mr' ? 'mr-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN';
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        setIsRecording(false);
      }
    }
  };

  const handleSend = async (customText = null) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim()) return;

    const userMsg = { sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText('');

    const lower = textToSend.toLowerCase();

    // Guided Report Flow
    if (reportState.active) {
      handleReportStep(textToSend);
      return;
    }

    if (lower.includes('report') || lower.includes('file') || lower.includes('pothole') || lower.includes('garbage') || lower.includes('water')) {
      setReportState({
        active: true,
        step: 1,
        department: lower.includes('garbage') || lower.includes('waste') ? 'waste' : lower.includes('water') ? 'water' : 'roads',
        category: lower.includes('garbage') ? 'Garbage Dump' : lower.includes('water') ? 'Pipe Leakage' : 'Pothole',
        title: '',
        description: '',
        address: 'Shivajinagar, Pune',
        isEmergency: false
      });
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: 'I can assist you in filing this grievance. What is the location or landmark in Pune? (e.g. Kothrud, Shivajinagar, Viman Nagar, Baner)'
        }
      ]);
      return;
    }

    if (lower.includes('track') || lower.includes('status')) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: 'To track your grievance, enter your tracking ID (like NS-2026-...) into the search bar at the top or visit the "My Grievances" page.'
        }
      ]);
      return;
    }

    if (lower.includes('emergency')) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: '⚠️ For life-threatening emergencies, dial 112 immediately. For urgent municipal hazards like open manholes or live wires, you can flag "Possible Emergency" when submitting a report.'
        }
      ]);
      return;
    }

    // Default response
    setMessages((prev) => [
      ...prev,
      {
        sender: 'assistant',
        text: 'I can help you file a grievance, check service areas in Pune, or clarify SLA policies. Would you like to file a new report or track an existing one?'
      }
    ]);
  };

  const handleReportStep = async (input) => {
    if (reportState.step === 1) {
      setReportState((prev) => ({ ...prev, address: input, step: 2 }));
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `Got it: Location is ${input}. Please describe the issue in a few words so the department field team can understand the problem.`
        }
      ]);
    } else if (reportState.step === 2) {
      setReportState((prev) => ({ ...prev, description: input, title: input.slice(0, 60), step: 3 }));
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `Thank you. Is this an emergency or dangerous condition? Reply "Yes" or "No".`
        }
      ]);
    } else if (reportState.step === 3) {
      const isEm = input.toLowerCase().includes('yes');
      const updatedState = { ...reportState, isEmergency: isEm, step: 4 };
      setReportState(updatedState);

      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `Reviewing report: Department: ${updatedState.department.toUpperCase()}, Issue: ${updatedState.category}, Location: ${updatedState.address}, Emergency: ${isEm ? 'Yes' : 'No'}.`,
          showConfirm: true
        }
      ]);
    }
  };

  const submitGuidedReport = async () => {
    if (!isAuthenticated) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: 'Please log in with a citizen account to submit a report to Pune Municipal Corporation.'
        }
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', reportState.title || `${reportState.category} at ${reportState.address}`);
      formData.append('description', reportState.description || `Reported via Nagar Setu Help Assistant`);
      formData.append('department', reportState.department);
      formData.append('category', reportState.category);
      formData.append('lat', '18.5204');
      formData.append('lng', '73.8567');
      formData.append('address', reportState.address);
      formData.append('locationSource', 'manual_text');
      formData.append('isPossibleEmergency', reportState.isEmergency ? 'true' : 'false');
      if (reportState.isEmergency) {
        formData.append('emergencyConcern', 'Urgent condition reported via civic assistant');
      }

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        const trackingId = data.trackingId || data.referenceId || data.report?.referenceId;
        setMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: `✅ Grievance submitted successfully! Your tracking ID is [${trackingId}]. Our municipal team has been notified.`,
            trackingId
          }
        ]);
        setReportState({ active: false, step: 0 });
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: `❌ Could not submit report: ${data.message || 'Server error'}. Please try the Report page.`
          }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { sender: 'assistant', text: `❌ Network error while submitting report.` }
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Launcher Pill */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 bg-[#1E4FA3] hover:bg-[#16365c] text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold transition transform hover:scale-105"
          aria-label="Open Civic Help Assistant"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>Help Assistant</span>
        </button>
      )}

      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-slate-300 flex flex-col h-[520px] overflow-hidden font-sans">
          {/* Header */}
          <div className="bg-[#1E4FA3] text-white p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                🏛️
              </div>
              <div>
                <h3 className="font-bold text-xs leading-none">Nagar Setu Assistant</h3>
                <span className="text-[10px] text-blue-200">Pune Municipal Grievance Support</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-white/20 rounded transition text-white"
              aria-label="Close Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Action Chips */}
          <div className="bg-slate-50 p-2 border-b border-slate-200 flex gap-1.5 overflow-x-auto text-[11px] whitespace-nowrap">
            <button
              onClick={() => handleSend('I want to report an issue')}
              className="px-2.5 py-1 bg-white border border-slate-300 hover:border-[#1E4FA3] rounded-full text-slate-700 font-medium transition"
            >
              📝 Report Issue
            </button>
            <button
              onClick={() => handleSend('How do I track my grievance?')}
              className="px-2.5 py-1 bg-white border border-slate-300 hover:border-[#1E4FA3] rounded-full text-slate-700 font-medium transition"
            >
              🔍 Track Status
            </button>
            <button
              onClick={() => handleSend('Emergency helplines')}
              className="px-2.5 py-1 bg-white border border-slate-300 hover:border-[#1E4FA3] rounded-full text-slate-700 font-medium transition"
            >
              🚨 Emergency
            </button>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs bg-slate-50/50">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-2.5 rounded-xl max-w-[85%] leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-[#1E4FA3] text-white rounded-br-none shadow-xs font-medium'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-xs'
                  }`}
                >
                  <p>{m.text}</p>

                  {m.showConfirm && (
                    <div className="mt-3 pt-2 border-t border-slate-200 flex gap-2">
                      <button
                        onClick={submitGuidedReport}
                        disabled={submitting}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition"
                      >
                        {submitting ? 'Submitting...' : 'Confirm & Submit'}
                      </button>
                      <button
                        onClick={() => {
                          setReportState({ active: false, step: 0 });
                          setMessages((prev) => [
                            ...prev,
                            { sender: 'assistant', text: 'Report cancelled.' }
                          ]);
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {m.trackingId && (
                    <a
                      href={`/complaints/${m.trackingId}`}
                      className="mt-2 inline-flex items-center gap-1 font-bold text-blue-600 hover:underline"
                    >
                      <span>View Grievance Details</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box with Speech-to-Text Button */}
          <div className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleRecording}
              className={`p-2 rounded-lg border transition ${
                isRecording
                  ? 'bg-rose-100 border-rose-400 text-rose-600 animate-pulse'
                  : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              title={isRecording ? 'Listening... click to stop' : 'Click to speak (Speech-to-Text)'}
              aria-label="Speech to text input"
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <input
              type="text"
              placeholder={isRecording ? 'Listening... speak now' : 'Ask assistant or type problem...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              className="flex-1 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1E4FA3]"
            />

            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!inputText.trim()}
              className="p-2 bg-[#1E4FA3] hover:bg-[#16365c] disabled:opacity-40 text-white rounded-lg transition"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
