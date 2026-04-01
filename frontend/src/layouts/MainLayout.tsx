import React, { useState, useEffect, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { ChatProvider } from '../context/ChatContext';
import { useSidebarStore } from '../context/useSidebarStore';
import clsx from 'clsx';
import { useGlobalRealtime } from '../hooks/useGlobalRealtime';

// Lazy load khối Chat (popup) — tải sau first paint để trang vào nhanh hơn
const ChatContainerLazy = React.lazy(() => import('../components/chat/ChatContainer'));
const GlobalCallHandler = React.lazy(() => import('../components/chat/GlobalCallHandler'));

const MainLayoutContent = () => {
  const { isOpen, isCollapsed, setOpen, toggleCollapse, toggleOpen } = useSidebarStore();
  const [deferChat, setDeferChat] = useState(true);

  // Use global real-time listener (it will use the socket from ChatProvider)
  useGlobalRealtime();

  useEffect(() => {
    const t = setTimeout(() => setDeferChat(false), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        isOpen={isOpen} 
        isCollapsed={isCollapsed}
        onClose={() => setOpen(false)} 
        onToggleCollapse={toggleCollapse}
      />
      <Header 
        toggleSidebar={toggleOpen}
        isSidebarCollapsed={isCollapsed}
      />
      <main className={clsx(
        "flex-1 p-4 md:p-8 mt-16 transition-all duration-300 w-full overflow-x-hidden",
        isCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64"
      )}>
        <Outlet />
      </main>
      {!deferChat && (
        <Suspense fallback={null}>
          <ChatContainerLazy />
        </Suspense>
      )}
    </div>
  );
};

const MainLayout = () => {
  return (
    <ChatProvider>
      <MainLayoutContent />
      <Suspense fallback={null}>
        <GlobalCallHandler />
      </Suspense>
    </ChatProvider>
  );
};

export default MainLayout;
