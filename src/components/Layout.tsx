import React from "react";
import { useStore } from "../store";
import { translations, countryConfig } from "../translations";
import { 
  LayoutDashboard, 
  Users, 
  Home, 
  Handshake, 
  MessageSquareCode, 
  Settings, 
  LogOut, 
  Globe,
  ChevronRight,
  Menu,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout({ children, activeTab, setActiveTab }: { 
  children: React.ReactNode, 
  activeTab: string, 
  setActiveTab: (tab: string) => void 
}) {
  const { user, logout, language, setLanguage } = useStore();
  const t = translations[language as keyof typeof translations] || translations.en;
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

  const menuItems = [
    { id: "dashboard", label: t.dashboard, icon: LayoutDashboard },
    { id: "leads", label: t.leads, icon: Users },
    { id: "properties", label: t.properties, icon: Home },
    { id: "deals", label: t.deals, icon: Handshake },
    { id: "ai", label: t.ai_assistant, icon: MessageSquareCode },
  ];

  const config = countryConfig[user?.country || "Georgia"];
  const availableLanguages = config?.languages || ["en", "ru", "ka"];

  return (
    <div className="flex h-screen bg-[#F9FAFB] text-[#111827]">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="bg-white border-r border-[#E5E7EB] flex flex-col h-full z-50"
      >
        <div className="p-6 flex items-center justify-between">
          <AnimatePresence mode="wait">
            {isSidebarOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-bold text-xl tracking-tight text-[#10B981]"
              >
                VistaReal<span className="text-[#111827]">AI</span>
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-[#F3F4F6] transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                activeTab === item.id 
                  ? "bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20" 
                  : "text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
              )}
            >
              <item.icon size={20} className={cn(activeTab === item.id ? "text-white" : "text-[#9CA3AF] group-hover:text-[#111827]")} />
              {isSidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E5E7EB] space-y-2">
          <div className="flex items-center gap-2 px-3 py-2">
            <Globe size={18} className="text-[#9CA3AF]" />
            {isSidebarOpen && (
              <div className="flex gap-2">
                {availableLanguages.map((lang) => {
                  const flagCodes: Record<string, string> = { en: "gb", ru: "ru", ka: "ge", hy: "am", kk: "kz" };
                  return (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang as any)}
                      className={cn(
                        "p-1 rounded-lg transition-all flex items-center justify-center",
                        language === lang 
                          ? "bg-[#111827] shadow-md ring-2 ring-[#10B981] scale-110" 
                          : "opacity-40 hover:opacity-100 hover:bg-[#F3F4F6]"
                      )}
                      title={lang.toUpperCase()}
                    >
                      <img 
                        src={`https://flagcdn.com/w40/${flagCodes[lang]}.png`}
                        alt={lang}
                        className="w-6 h-4 object-cover rounded-sm"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              logout();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#EF4444] hover:bg-[#FEF2F2] transition-colors"
          >
            <LogOut size={20} />
            {isSidebarOpen && <span className="font-medium">{t.logout}</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 bg-white border-bottom border-[#E5E7EB] px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <span>{t.dashboard}</span>
            <ChevronRight size={14} />
            <span className="text-[#111827] font-medium capitalize">{activeTab}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-[#6B7280] uppercase tracking-wider">{user?.role}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center text-white font-bold">
              {user?.name?.[0]}
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
