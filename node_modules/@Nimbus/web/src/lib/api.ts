import type { User, UserBasic, UserPresence, Chat, Message, MediaItem, StoryGroup, FriendRequest, FriendWithId, FriendshipStatus, ChatAvatar } from './types';

const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit & { timeout?: number } = {}): Promise<T> {
    const { timeout = 30_000, ...fetchOptions } = options;
    const controller = new AbortController();
    const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...fetchOptions.headers,
    };

    console.log(`[API] ${fetchOptions.method || 'GET'} ${endpoint}`);

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Время ожидания запроса истекло');
      }
      console.error(`[API] Network error:`, err);
      throw err;
    }
    clearTimeout(timer);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Ошибка сервера' }));
      console.error(`[API] Error ${response.status}:`, error);
      console.error(`[API] Failed request: ${fetchOptions.method || 'GET'} ${endpoint}`);
      console.error(`[API] Request body:`, fetchOptions.body);
      throw new Error(error.error || 'Ошибка запроса');
    }

    const data = await response.json();
    console.log(`[API] Response ${endpoint}:`, data);
    return data;
  }

  // \u0410\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u044f
  async login(username: string, password: string) {
    return this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async register(username: string, displayName: string, password: string, bio?: string, fingerprint?: string) {
    return this.request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password, bio, fingerprint }),
    });
  }

  async getMe() {
    return this.request<{ user: User }>('/auth/me');
  }

  // \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438
  async searchUsers(query: string) {
    return this.request<UserPresence[]>(`/users/search?q=${encodeURIComponent(query)}`);
  }

  async getUser(id: string) {
    return this.request<User>(`/users/${id}`);
  }

  async updateProfile(data: { displayName?: string; bio?: string; birthday?: string }) {
    return this.request<User>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append('avatar', file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(`${API_BASE}/users/avatar`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error('Ошибка загрузки аватара');
    return response.json() as Promise<User>;
  }

  async removeAvatar() {
    return this.request<User>('/users/avatar', { method: 'DELETE' });
  }

  async searchMessages(query: string, chatId?: string) {
    const params = new URLSearchParams({ q: query });
    if (chatId) params.append('chatId', chatId);
    return this.request<Message[]>(`/users/messages/search?${params}`);
  }

  // \u0427\u0430\u0442\u044b
  async getChats() {
    return this.request<Chat[]>('/chats');
  }

  async getChat(id: string) {
    return this.request<Chat>(`/chats/${id}`);
  }

  async createPersonalChat(userId: string) {
    return this.request<Chat>('/chats/personal', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async createGroupChat(name: string, memberIds: string[]) {
    return this.request<Chat>('/chats/group', {
      method: 'POST',
      body: JSON.stringify({ name, memberIds }),
    });
  }

  async createChannel(name: string, username: string, description?: string, memberIds?: string[]) {
    return this.request<Chat>('/chats/channel', {
      method: 'POST',
      body: JSON.stringify({ name, username, description, memberIds }),
    });
  }

  async getChannel(id: string) {
    return this.request<Chat>(`/chats/${id}`);
  }

  // ─── Multiple Avatars Management ─────────────────────────────────────

  async uploadChatAvatars(chatId: string, files: File[]) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('avatars', file);
    }
    return this.request<ChatAvatar[]>(`/chats/${chatId}/avatars`, {
      method: 'POST',
      body: formData,
    });
  }

  async getChatAvatars(chatId: string) {
    return this.request<ChatAvatar[]>(`/chats/${chatId}/avatars`);
  }

  async reorderChatAvatars(chatId: string, avatarIds: number[]) {
    return this.request<{ ok: boolean }>(`/chats/${chatId}/avatars/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ avatarIds }),
    });
  }

  async setMainChatAvatar(chatId: string, avatarId: number) {
    return this.request<{ ok: boolean }>(`/chats/${chatId}/avatars/${avatarId}/main`, {
      method: 'PUT',
    });
  }

  async deleteChatAvatar(chatId: string, avatarId: number) {
    return this.request<{ ok: boolean }>(`/chats/${chatId}/avatars/${avatarId}`, {
      method: 'DELETE',
    });
  }

  // \u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f
  async getMessages(chatId: string, cursor?: string) {
    const params = cursor ? `?cursor=${cursor}` : '';
    return this.request<Message[]>(`/messages/chat/${chatId}${params}`);
  }

  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(`${API_BASE}/messages/upload`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0444\u0430\u0439\u043b\u0430');
    return response.json() as Promise<{ url: string; filename: string; size: number; mimetype?: string }>;
  }

  async uploadFiles(files: File[]) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    console.log('[API] Uploading files:', files.map(f => ({ name: f.name, size: f.size, type: f.type })));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    
    try {
      const response = await fetch(`${API_BASE}/messages/upload-multiple`, {
        method: 'POST',
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: formData,
        signal: controller.signal,
      });
      
      console.log('[API] Upload response status:', response.status);
      
      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[API] Upload error response:', errorText);
        throw new Error('Ошибка загрузки файлов');
      }
      
      const data = await response.json();
      console.log('[API] Upload success:', data);
      return data as { files: Array<{ url: string; filename: string; size: number; mimetype?: string }> };
    } catch (err) {
      console.error('[API] Upload failed:', err);
      clearTimeout(timer);
      throw err;
    }
  }

  // \u0413\u0440\u0443\u043f\u043f\u044b
  async updateGroup(chatId: string, data: { name?: string }) {
    return this.request<Chat>(`/chats/${chatId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadGroupAvatar(chatId: string, file: File) {
    const formData = new FormData();
    formData.append('avatar', file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(`${API_BASE}/chats/${chatId}/avatar`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0430\u0432\u0430\u0442\u0430\u0440\u0430');
    return response.json() as Promise<Chat>;
  }

  async removeGroupAvatar(chatId: string) {
    return this.request<Chat>(`/chats/${chatId}/avatar`, { method: 'DELETE' });
  }

  async addGroupMembers(chatId: string, userIds: string[]) {
    return this.request<Chat>(`/chats/${chatId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  async removeGroupMember(chatId: string, userId: string) {
    return this.request<Chat>(`/chats/${chatId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async clearChat(chatId: string) {
    return this.request<{ message: string }>(`/chats/${chatId}/clear`, { method: 'POST' });
  }

  async deleteChat(chatId: string) {
    return this.request<{ message: string }>(`/chats/${chatId}`, { method: 'DELETE' });
  }

  async togglePinChat(chatId: string) {
    return this.request<{ isPinned: boolean }>(`/chats/${chatId}/pin`, { method: 'POST' });
  }

  async getSharedMedia(chatId: string, type: 'media' | 'files' | 'links') {
    return this.request<Message[]>(`/messages/chat/${chatId}/shared?type=${type}`);
  }

  // ICE серверы для WebRTC
  async getIceServers() {
    return this.request<{ iceServers: RTCIceServer[] }>('/ice-servers');
  }

  // Stories
  async getStories() {
    return this.request<StoryGroup[]>('/stories');
  }

  async createStory(data: { type: string; mediaUrl?: string; content?: string; bgColor?: string }) {
    return this.request<{ id: string }>('/stories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async viewStory(storyId: string) {
    return this.request<{ message: string }>(`/stories/${storyId}/view`, { method: 'POST' });
  }

  async deleteStory(storyId: string) {
    return this.request<{ message: string }>(`/stories/${storyId}`, { method: 'DELETE' });
  }

  async getStoryViewers(storyId: string) {
    return this.request<Array<{ userId: string; username: string; displayName: string; avatar: string | null; viewedAt: string }>>(`/stories/${storyId}/viewers`);
  }

  // Favorites chat
  async getOrCreateFavorites() {
    return this.request<Chat>('/chats/favorites', { method: 'POST' });
  }

  // User settings
  async updateSettings(data: { hideStoryViews?: boolean }) {
    return this.request<User>('/users/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Friends
  async getFriends() {
    return this.request<FriendWithId[]>('/friends');
  }

  async getFriendRequests() {
    return this.request<FriendRequest[]>('/friends/requests');
  }

  async getOutgoingRequests() {
    return this.request<FriendRequest[]>('/friends/outgoing');
  }

  async getFriendshipStatus(userId: string) {
    return this.request<FriendshipStatus>(`/friends/status/${userId}`);
  }

  async sendFriendRequest(friendId: string) {
    return this.request<{ status: string }>('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ friendId }),
    });
  }

  async acceptFriendRequest(friendshipId: string) {
    return this.request<{ id: string }>(`/friends/${friendshipId}/accept`, { method: 'POST' });
  }

  async declineFriendRequest(friendshipId: string) {
    return this.request<{ success: boolean }>(`/friends/${friendshipId}/decline`, { method: 'POST' });
  }

  async removeFriend(friendshipId: string) {
    return this.request<{ success: boolean }>(`/friends/${friendshipId}`, { method: 'DELETE' });
  }

  // Chat Folders
  async getFolders() {
    return this.request<Array<{ id: number; name: string; color: string; icon: string; position: number; chats: Array<{ chatId: number; position: number }> }>>('/folders');
  }

  async createFolder(name: string, color?: string, icon?: string, chatIds?: number[]) {
    return this.request('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, color, icon, chatIds }),
    });
  }

  async updateFolder(folderId: number, data: { name?: string; color?: string; icon?: string }) {
    return this.request(`/folders/${folderId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteFolder(folderId: number) {
    return this.request(`/folders/${folderId}`, { method: 'DELETE' });
  }

  async addChatsToFolder(folderId: number, chatIds: number[]) {
    return this.request(`/folders/${folderId}/chats`, {
      method: 'POST',
      body: JSON.stringify({ chatIds }),
    });
  }

  async removeChatFromFolder(folderId: number, chatId: number) {
    return this.request(`/folders/${folderId}/chats/${chatId}`, { method: 'DELETE' });
  }

  async reorderFolderChats(folderId: number, chatIds: number[]) {
    return this.request(`/folders/${folderId}/chats/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ chatIds }),
    });
  }

  // Drafts
  async getDraft(chatId: string) {
    return this.request<{ content: string }>('/drafts', {
      method: 'POST',
      body: JSON.stringify({ chatId }),
    });
  }

  async saveDraft(chatId: string, content: string) {
    return this.request('/drafts', {
      method: 'PUT',
      body: JSON.stringify({ chatId, content }),
    });
  }

  async deleteDraft(chatId: string) {
    return this.request(`/drafts/${chatId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();

