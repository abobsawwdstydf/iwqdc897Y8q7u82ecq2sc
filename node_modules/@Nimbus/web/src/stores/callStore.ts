import { create } from 'zustand';

interface CallState {
  isInCall: boolean;
  callType: 'voice' | 'video' | 'group' | null;
  callChatId: string | null;
  setInCall: (isInCall: boolean, callType?: 'voice' | 'video' | 'group' | null, callChatId?: string | null) => void;
  clearCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  isInCall: false,
  callType: null,
  callChatId: null,
  setInCall: (isInCall, callType = null, callChatId = null) => set({ isInCall, callType, callChatId }),
  clearCall: () => set({ isInCall: false, callType: null, callChatId: null }),
}));

