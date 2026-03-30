import { useState, useEffect, useRef } from 'react';
import { Send, Mic, Paperclip, Bot, User, AlertCircle, CheckCircle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../api/client';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  isFile?: boolean;
}

interface QuickQuestionGroup {
  id: string;
  title: string;
  questions: string[];
}

const quickQuestionGroups: QuickQuestionGroup[] = [
  {
    id: 'group-6',
    title: 'Phân tích & hành vi khách hàng (CRM)',
    questions: [
      'Phân tích tính cách mua hàng của khách hàng 0977 123 456 dựa trên lịch sử giao dịch.',
      'Khách hàng 0912 345 678 thường quan tâm đến nhóm sản phẩm nào?',
      'Khách hàng 0933 222 111 thuộc nhóm quyết định nhanh hay cần tư vấn kỹ?',
      'Dự đoán nhu cầu mua hàng tiếp theo của khách hàng 0909 888 777.',
      'Đề xuất cách tiếp cận & tư vấn phù hợp với khách hàng có tính cách thận trọng, ít thay đổi.',
      'Tổng hợp lịch sử tương tác và mua hàng của khách hàng 0966 555 444.',
      'Phân tích hiệu quả các lần tư vấn trước đây đối với khách hàng 0988 999 000.'
    ]
  },
  {
    id: 'group-5',
    title: 'Kịch bản tư vấn & bán hàng nông nghiệp',
    questions: [
      'Gợi ý kịch bản tư vấn sản phẩm cho khách hàng trồng cà phê quy mô lớn.',
      'Xây dựng kịch bản tư vấn sản phẩm sinh học cho khách hàng mới trồng sầu riêng.'
    ]
  },
  {
    id: 'group-4',
    title: 'Chẩn đoán sâu bệnh & sinh trưởng cây trồng',
    questions: [
      'Chẩn đoán nguyên nhân cây cà phê bị vàng lá, rụng trái sớm dựa trên triệu chứng hiện tại.',
      'Cây sầu riêng bị thối rễ, lá héo có thể do những loại nấm bệnh nào?',
      'Phân tích dấu hiệu sâu cuốn lá và sâu đục thân trên cây lúa.',
      'Thanh long ra hoa kém, nguyên nhân có thể do đâu và cách khắc phục?',
      'Đề xuất phác đồ điều trị sâu bệnh cho cà phê theo hướng sinh học.'
    ]
  },
  {
    id: 'group-1',
    title: 'Tư vấn sản phẩm nông nghiệp (KA GREEN)',
    questions: [
      'Phân tích công dụng, liều lượng và thời điểm sử dụng sản phẩm KA GREEN 03 cho cây cà phê.',
      'Sản phẩm KA GREEN AMINO phù hợp sử dụng cho sầu riêng ở giai đoạn nào?',
      'So sánh hiệu quả của KA GREEN STRESS và KA GREEN 08 khi cây bị sốc thời tiết.'
    ]
  },
  {
    id: 'group-2',
    title: 'Thiết bị & hệ thống IoT nông nghiệp',
    questions: [
      'Thiết bị cảm biến độ ẩm đất 8 chỉ số hoạt động như thế nào, đo những chỉ số gì và nên lắp đặt ở đâu trong nông trại?',
      'Sự khác nhau giữa sensor, node (trạm đo), gateway (trung tâm kết nối) và handheld trong hệ thống IoT nông nghiệp của Kagri Tech là gì?'
    ]
  },
  {
    id: 'group-3',
    title: 'Vận hành & xử lý sự cố thiết bị IoT',
    questions: [
      'Quy trình bảo trì và kiểm tra định kỳ thiết bị IoT.',
      'Hướng dẫn xử lý khi thiết bị IoT gửi dữ liệu bất thường.',
      'Khi trạm đo (node) bị mất kết nối, cần kiểm tra những nguyên nhân nào?'
    ]
  }
];

const KagriAI = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'bot',
      content: 'Xin chào! Tôi là Kagri AI. Tôi có thể giúp gì cho bạn hôm nay?'
    }
  ]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification state
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ show: false, message: '', type: 'info' });

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
  };

  useEffect(() => {
    // Derive socket URL - use current origin for relative API_URL
    let socketUrl = 'http://localhost:5000';
    if (API_URL) {
      if (API_URL.startsWith('http')) {
        socketUrl = API_URL.replace('/api', '');
      } else {
        // Relative URL like '/api' - use current window origin
        socketUrl = window.location.origin;
      }
    }
    console.log('KagriAI: Connecting to socket at', socketUrl);
    
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('KagriAI: Connected to socket server, id:', newSocket.id);
    });

    newSocket.on('connect_error', (error) => {
      console.error('KagriAI: Socket connection error:', error);
    });

    newSocket.on('stream_chunk', (data: { chunk: string, isLast: boolean }) => {
      console.log('KagriAI: Received stream_chunk:', data);
      setIsStreaming(true);
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'bot' && lastMsg.id === 'streaming') {
          const updatedContent = lastMsg.content + data.chunk;
          if (data.isLast) {
             return prev.map(m => m.id === 'streaming' ? { ...m, id: Date.now().toString(), content: updatedContent } : m);
          }
          return prev.map(m => m.id === 'streaming' ? { ...m, content: updatedContent } : m);
        } else {
          if (data.isLast) {
             return [...prev, { id: Date.now().toString(), role: 'bot', content: data.chunk }];
           }
           return [...prev, { id: 'streaming', role: 'bot', content: data.chunk }];
        }
      });
      
      if (data.isLast) {
        setIsStreaming(false);
      }
    });

    return () => {
      console.log('KagriAI: Disconnecting socket');
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !socket) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input
    };

    setMessages(prev => [...prev, userMsg]);
    
    // Prepare for streaming response
    setMessages(prev => [...prev, { id: 'streaming', role: 'bot', content: '' }]);
    
    console.log('KagriAI: Emitting chat_message:', { type: 'text', content: input });
    socket.emit('chat_message', { type: 'text', content: input });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    showNotification('Tính năng đang phát triển', 'info');
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showNotification('Dung lượng tệp vượt quá 10MB', 'error');
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Đã gửi tệp: ${file.name}`,
      isFile: true
    };

    setMessages(prev => [...prev, userMsg]);
     // Prepare for streaming response
    setMessages(prev => [...prev, { id: 'streaming', role: 'bot', content: '' }]);

    // We don't send file content as per requirements, just trigger
    if (socket) {
        socket.emit('chat_message', { type: 'file', name: file.name, size: file.size });
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative">
       {/* Toast Notification */}
       {notification.show && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 transition-all duration-300 ${
          notification.type === 'success' ? 'bg-green-500 text-white' :
          notification.type === 'error' ? 'bg-red-500 text-white' :
          'bg-blue-500 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : 
           notification.type === 'error' ? <AlertCircle size={20} /> : 
           <AlertCircle size={20} />}
          <span>{notification.message}</span>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-3">
          <img src="/logo-AI.gif" alt="AI Logo" className="h-12" />
          <h2 className="text-2xl font-bold text-gray-900">Kagri AI</h2>
        </div>
        <p className="text-gray-500 text-sm ml-15">Trợ lý ảo thông minh cho nông nghiệp</p>
      </div>

      <div className="flex-1 bg-white rounded-card shadow-sm p-6 flex flex-col">
        <div className="mb-4 max-h-56 overflow-y-auto pr-2 border-b border-gray-100 pb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Nhóm câu hỏi nhanh</h3>
          <div className="space-y-3">
            {quickQuestionGroups.map(group => (
              <div key={group.id}>
                <p className="text-xs font-semibold text-primary mb-1">🟢 {group.title}</p>
                <div className="flex flex-wrap gap-2">
                  {group.questions.map((q, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setInput(q)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs hover:bg-blue-100 transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                msg.role === 'bot' ? 'bg-transparent' : 'bg-gray-200 text-gray-600'
              }`}>
                {msg.role === 'bot' ? (
                  <img src="/AILogo.png" alt="AI" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} />
                )}
              </div>
              <div className={`p-4 rounded-2xl max-w-[80%] ${
                msg.role === 'bot' 
                  ? 'bg-gray-100 rounded-tl-none text-gray-800' 
                  : 'bg-primary text-white rounded-tr-none'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.txt,.md"
            />
            <button 
              onClick={handleFileClick}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg"
              title="Đính kèm tệp"
            >
              <Paperclip size={20} />
            </button>
            <button 
              onClick={handleMicClick}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg"
              title="Nhập bằng giọng nói"
            >
              <Mic size={20} />
            </button>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập câu hỏi hoặc yêu cầu..." 
              className="flex-1 bg-transparent border-none focus:ring-0 text-gray-800 placeholder-gray-400"
              disabled={isStreaming}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KagriAI;
