import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  name: string;
  role: string;
  company_id: string;
  country: string;
}

export interface Message {
  role: "user" | "model";
  parts: any[];
  type?: "CREATE_CLIENT" | "CREATE_PROPERTY" | "CREATE_DEAL";
  data?: any;
  isHidden?: boolean;
}

interface AppState {
  token: string | null;
  user: User | null;
  language: "en" | "ru" | "ka" | "hy" | "kk";
  messages: Message[];
  activeTab: string;
  pendingEntity: { type: string; id: string | number } | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  setLanguage: (lang: "en" | "ru" | "ka" | "hy" | "kk") => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  setActiveTab: (tab: string) => void;
  setPendingEntity: (entity: { type: string; id: string | number } | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      language: "en",
      messages: [],
      activeTab: "dashboard",
      pendingEntity: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null, messages: [], activeTab: "dashboard", pendingEntity: null }),
      setLanguage: (language) => set({ language }),
      setMessages: (messages) => set({ messages }),
      clearMessages: () => set({ messages: [] }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setPendingEntity: (pendingEntity) => set({ pendingEntity }),
    }),
    { name: "georeal-storage" }
  )
);
