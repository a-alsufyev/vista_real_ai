import React from "react";
import { useStore } from "./store";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import ClientsBoard from "./components/ClientsBoard";
import PropertiesList from "./components/PropertiesList";
import DealsPipeline from "./components/DealsPipeline";
import AIChat from "./components/AIChat";
import { motion, AnimatePresence } from "motion/react";
import { YMaps } from "@pbe/react-yandex-maps";
import AuthScreen from "./components/AuthScreen";

export default function App() {
  const { token, user, setAuth, logout, activeTab, setActiveTab } = useStore();
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const res = await fetch("/api/auth/me", {
            headers: { "Authorization": `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok) {
            setAuth(token, data.user);
          } else {
            logout();
          }
        } catch (err) {
          console.error("Auth check failed:", err);
          logout();
        }
      }
      setIsLoading(false);
    };
    checkAuth();
  }, [token, setAuth, logout]);

  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY;
  const ymapsQuery: { apikey?: string; load: string; lang: "en_US" } = apiKey 
    ? { apikey: apiKey, load: "package.full", lang: "en_US" } 
    : { load: "package.full", lang: "en_US" };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#10B981]"></div>
      </div>
    );
  }

  if (!token || !user) {
    return <AuthScreen onSuccess={(token, user) => setAuth(token, user)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard": return <Dashboard />;
      case "leads": return <ClientsBoard />;
      case "properties": return <PropertiesList />;
      case "deals": return <DealsPipeline />;
      case "ai": return <AIChat />;
      default: return <Dashboard />;
    }
  };

  return (
    <YMaps query={ymapsQuery}>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </Layout>
    </YMaps>
  );
}
