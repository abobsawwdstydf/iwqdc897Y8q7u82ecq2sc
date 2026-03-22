import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './stores/authStore';
import { useChatStore } from './stores/chatStore';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import { api } from './lib/api';

export default function App() {
  const { token, user, checkAuth, isLoading } = useAuthStore();
  const { setActiveChat } = useChatStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle username links (/@username)
  useEffect(() => {
    if (!token || !user) return;

    const path = window.location.pathname;
    const match = path.match(/^\/@([a-zA-Z0-9_]+)$/);
    
    if (match) {
      const username = match[1];
      
      // Find chat/user by username
      api.getChats().then(chats => {
        const targetChat = chats.find(c => c.username === username || c.members?.some(m => m.user.username === username));
        
        if (targetChat) {
          setActiveChat(targetChat.id);
        }
      }).catch(console.error);
    }
  }, [token, user, setActiveChat]);

  // Auto-redirect after login/register
  useEffect(() => {
    if (token && user && window.location.pathname.includes('auth')) {
      window.history.replaceState({}, '', '/');
    }
  }, [token, user]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <NimbusLoader />
          <p className="text-zinc-500 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {token && user ? (
        <ChatPage key="chat" />
      ) : (
        <AuthPage key="auth" />
      )}
    </AnimatePresence>
  );
}

function NimbusLoader() {
  return (
    <div className="relative w-12 h-12">
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-Nimbus-500 animate-spin" />
      <div
        className="absolute inset-1 rounded-full border-2 border-transparent border-t-Nimbus-400 animate-spin"
        style={{ animationDuration: '0.8s', animationDirection: 'reverse' }}
      />
      <div
        className="absolute inset-2 rounded-full border-2 border-transparent border-t-Nimbus-300 animate-spin"
        style={{ animationDuration: '0.6s' }}
      />
    </div>
  );
}
