import { useChat } from '../../context/ChatContext';
import ChatPopup from './ChatPopup';

/**
 * Container render danh sách ChatPopup.
 * Được lazy-load trong MainLayout để không chặn first paint.
 */
const ChatContainer = () => {
  const { openChats } = useChat();
  return (
    <>
      {openChats.map((session, index) => (
        <ChatPopup key={session.id} session={session} index={index} />
      ))}
    </>
  );
};

export default ChatContainer;
