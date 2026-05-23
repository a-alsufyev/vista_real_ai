import React from "react";
import { useStore } from "../store";
import { translations, countryConfig } from "../translations";
import { 
  Plus, 
  MoreVertical, 
  Phone, 
  Mail, 
  MapPin, 
  DollarSign,
  User,
  Home,
  X,
  Search,
  Filter,
  Edit2,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const STAGES = ["New", "Contacted", "Meeting", "Negotiation", "Closed", "Lost"];

export default function ClientsBoard() {
  const { language, token, user } = useStore();
  const t = translations[language as keyof typeof translations] || translations.en;
  
  const config = countryConfig[user?.country || "Georgia"];
  const availableCities = config?.cities || ["Tbilisi", "Batumi"];
  
  const [clients, setClients] = React.useState<any[]>([]);
  const { pendingEntity, setPendingEntity } = useStore();
  const [loading, setLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [viewingClient, setViewingClient] = React.useState<any | null>(null);
  const [editingClientId, setEditingClientId] = React.useState<number | null>(null);
  const [newClient, setNewClient] = React.useState({
    name: "",
    phone: "",
    email: "",
    budget: "",
    city: availableCities[0],
    district: "",
    rooms: "",
    status: "New"
  });

  // Update city when available cities change
  React.useEffect(() => {
    if (!availableCities.includes(newClient.city)) {
      setNewClient(prev => ({ ...prev, city: availableCities[0] }));
    }
  }, [availableCities]);

  const fetchClients = React.useCallback(() => {
    if (!token || token === "null" || token === "undefined") return;
    
    fetch("/api/leads", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(async res => {
      if (res.status === 401) {
        const data = await res.json().catch(() => ({ error: "Unauthorized" }));
        console.error("Auth error fetching clients:", data.error);
        useStore.getState().logout();
        throw new Error(data.error || "Unauthorized");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to fetch" }));
        throw new Error(data.error || "Failed to fetch");
      }
      return res.json();
    })
    .then(data => {
      setClients(Array.isArray(data) ? data : []);
      setLoading(false);
    })
    .catch(err => {
      console.error("Failed to fetch clients:", err);
      setLoading(false);
    });
  }, [token]);

  React.useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  React.useEffect(() => {
    if (pendingEntity?.type === "client" && clients.length > 0) {
      const client = clients.find(c => c.id === pendingEntity.id || c.id?.toString() === pendingEntity.id?.toString());
      if (client) {
        setViewingClient(client);
        setPendingEntity(null);
      }
    }
  }, [pendingEntity, clients, setPendingEntity]);

  const [error, setError] = React.useState<string | null>(null);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const method = editingClientId ? "PUT" : "POST";
    const url = editingClientId ? `/api/leads/${editingClientId}` : "/api/leads";
    
    const res = await fetch(url, {
      method,
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({
        ...newClient,
        budget: Number(newClient.budget),
        rooms: Number(newClient.rooms)
      })
    });
    if (res.status === 401) {
      useStore.getState().logout();
      return;
    }

    if (res.ok) {
      setShowModal(false);
      setEditingClientId(null);
      setNewClient({ name: "", phone: "", email: "", budget: "", city: availableCities[0], district: "", rooms: "", status: "New" });
      fetchClients();
    } else {
      const err = await res.json();
      if (res.status === 403 && err.error === "LIMIT_REACHED") {
        setError(t.demo_limit_reached || err.message);
      } else {
        setError(err.error || "Failed to save client");
      }
      console.error(`Error: ${err.error || "Failed to save client"}`);
    }
  };

  const handleDeleteClient = async (id: number) => {
    const res = await fetch(`/api/leads/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      fetchClients();
    }
  };

  const openEditModal = (client: any) => {
    setEditingClientId(client.id);
    setNewClient({
      name: client.name || "",
      phone: client.phone || "",
      email: client.email || "",
      budget: client.budget?.toString() || "",
      city: client.city || availableCities[0],
      district: client.district || "",
      rooms: client.rooms?.toString() || "",
      status: client.status || "New"
    });
    setShowModal(true);
  };

  const updateClientStatus = (id: number, status: string) => {
    // Optimistic update
    setClients(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    
    return fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ status })
    });
  };

  const handleOpenAddModal = () => {
    if (clients.length >= 3) {
      setError(t.demo_limit_reached);
      return;
    }
    setError(null);
    setEditingClientId(null);
    setNewClient({ name: "", phone: "", email: "", budget: "", city: availableCities[0], district: "", rooms: "", status: "New" });
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{t.leads}</h1>
          <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 shadow-sm">
            <Search size={18} className="text-[#9CA3AF]" />
            <input 
              type="text" 
              placeholder={t.search} 
              className="bg-transparent border-none focus:ring-0 text-sm font-medium w-48"
            />
          </div>
        </div>
        <button 
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-[#10B981] text-white px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-[#10B981]/20 hover:bg-[#059669] transition-all"
        >
          <Plus size={20} />
          {t.add_lead}
        </button>
      </div>

      {error && !showModal && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-medium flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            {error}
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-[#F3F4F6] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#111827]">{editingClientId ? (language === 'ru' ? "Редактировать клиента" : "Edit Client") : t.add_lead}</h2>
                <button onClick={() => setShowModal(false)} className="text-[#9CA3AF] hover:text-[#111827]">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              <form onSubmit={handleAddClient} className="p-6 space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium p-3 rounded-xl">
                    {error}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{language === 'ru' ? 'Имя' : 'Name'}</label>
                  <input 
                    required
                    type="text" 
                    value={newClient.name}
                    onChange={e => setNewClient({...newClient, name: e.target.value})}
                    className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{language === 'ru' ? 'Телефон' : 'Phone'}</label>
                    <input 
                      type="text" 
                      value={newClient.phone}
                      onChange={e => setNewClient({...newClient, phone: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{language === 'ru' ? 'Бюджет' : 'Budget'} ($)</label>
                    <input 
                      type="number" 
                      value={newClient.budget}
                      onChange={e => setNewClient({...newClient, budget: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{language === 'ru' ? 'Комнаты' : 'Rooms'}</label>
                    <input 
                      required
                      type="number" 
                      value={newClient.rooms}
                      onChange={e => setNewClient({...newClient, rooms: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{language === 'ru' ? 'Город' : 'City'}</label>
                    <select 
                      value={newClient.city}
                      onChange={e => setNewClient({...newClient, city: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                    >
                      {availableCities.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{language === 'ru' ? 'Район' : 'District'}</label>
                    <input 
                      type="text" 
                      value={newClient.district}
                      onChange={e => setNewClient({...newClient, district: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{language === 'ru' ? 'Статус' : 'Status'}</label>
                    <select 
                      value={newClient.status}
                      onChange={e => setNewClient({...newClient, status: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                    >
                      {STAGES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button 
                  type="submit"
                  className="w-full bg-[#10B981] text-white py-3 rounded-xl font-bold shadow-lg shadow-[#10B981]/20 hover:bg-[#059669] transition-all pt-4"
                >
                  {editingClientId ? (language === 'ru' ? "Обновить клиента" : "Update Client") : t.add_lead}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                      <User size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-[#111827]">{viewingClient.name}</h2>
                      <div className="text-sm font-bold text-[#9CA3AF] uppercase tracking-wider">#{viewingClient.id}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const c = viewingClient;
                        setViewingClient(null);
                        openEditModal(c);
                      }}
                      className="p-3 bg-[#F3F4F6] text-[#6B7280] hover:text-[#10B981] rounded-xl transition-all hover:scale-110"
                      title="Edit"
                    >
                      <Edit2 size={20} />
                    </button>
                    <button 
                      onClick={() => setViewingClient(null)}
                      className="p-3 bg-black/5 text-[#6B7280] hover:text-[#111827] rounded-xl transition-all hover:scale-110"
                    >
                      <Plus size={24} className="rotate-45" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#F3F4F6]">
                    <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">{language === 'ru' ? 'Статус' : 'Status'}</div>
                    <select 
                      value={viewingClient.status}
                      onChange={(e) => {
                        const newStatus = e.target.value;
                        setViewingClient({ ...viewingClient, status: newStatus });
                        updateClientStatus(viewingClient.id, newStatus);
                      }}
                      className="w-full bg-transparent border-none p-0 text-sm font-bold text-[#374151] focus:ring-0 cursor-pointer"
                    >
                      {STAGES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#F3F4F6]">
                    <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">{language === 'ru' ? 'Комнаты' : 'Rooms'}</div>
                    <div className="text-lg font-bold text-[#374151]">
                      {viewingClient.rooms || '—'}
                    </div>
                  </div>
                  <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#F3F4F6]">
                    <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">{language === 'ru' ? 'Бюджет' : 'Budget'}</div>
                    <div className="text-lg font-bold text-[#10B981]">
                      {viewingClient.budget ? `$${Number(viewingClient.budget).toLocaleString()}` : '—'}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider border-b border-[#F3F4F6] pb-2">
                    {language === 'ru' ? 'Контактная информация' : 'Contact Information'}
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {viewingClient.phone && (
                      <div className="flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#10B981] transition-colors group">
                        <div className="p-2 bg-emerald-50 text-[#10B981] rounded-lg group-hover:bg-[#10B981] group-hover:text-white transition-colors">
                          <Phone size={18} />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">{language === 'ru' ? 'Телефон' : 'Phone'}</div>
                          <div className="text-sm font-bold text-[#374151]">{viewingClient.phone}</div>
                        </div>
                      </div>
                    )}
                    {viewingClient.email && (
                      <div className="flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#10B981] transition-colors group">
                        <div className="p-2 bg-blue-50 text-blue-500 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors">
                          <Mail size={18} />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">{language === 'ru' ? 'Эл. почта' : 'Email'}</div>
                          <div className="text-sm font-bold text-[#374151]">{viewingClient.email}</div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#10B981] transition-colors group">
                      <div className="p-2 bg-violet-50 text-violet-500 rounded-lg group-hover:bg-violet-500 group-hover:text-white transition-colors">
                        <MapPin size={18} />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">{language === 'ru' ? 'Локация' : 'Location'}</div>
                        <div className="text-sm font-bold text-[#374151]">
                          {viewingClient.city}{viewingClient.district ? `, ${viewingClient.district}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => {
                      const id = viewingClient.id;
                      setViewingClient(null);
                      handleDeleteClient(id);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-red-100 text-red-500 rounded-xl font-bold hover:bg-red-50 transition-all"
                  >
                    <Trash2 size={18} />
                    {t.delete}
                  </button>
                  <button 
                    onClick={() => setViewingClient(null)}
                    className="flex-1 px-6 py-3 bg-[#111827] text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg"
                  >
                    {t.close || "Close"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
        <AnimatePresence mode="popLayout">
          {clients.map((client) => (
            <motion.div
              layout
              key={client.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => setViewingClient(client)}
              className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
            >
              <div className="flex flex-col gap-1 mb-3">
                <div className="flex items-start justify-between">
                  <div className="font-bold text-[#111827] group-hover:text-[#10B981] transition-colors truncate pr-2 min-w-0 flex-1">
                    {client.name}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button 
                      onClick={() => openEditModal(client)}
                      className="p-1 text-[#9CA3AF] hover:text-[#10B981] transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteClient(client.id)}
                      className="text-[#9CA3AF] hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  #{client.id}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {client.phone && (
                  <div className="flex items-center gap-2 text-xs text-[#6B7280] font-medium">
                    <Phone size={14} className="text-[#9CA3AF]" />
                    {client.phone}
                  </div>
                )}
                {client.rooms && (
                  <div className="flex items-center gap-2 text-xs text-[#6B7280] font-medium">
                    <Home size={14} className="text-[#9CA3AF]" />
                    {client.rooms} {language === 'ru' ? 'комн.' : 'rooms'}
                  </div>
                )}
                {client.district && (
                  <div className="flex items-center gap-2 text-xs text-[#6B7280] font-medium">
                    <MapPin size={14} className="text-[#9CA3AF]" />
                    {client.city}, {client.district}
                  </div>
                )}
                {client.budget && (
                  <div className="flex items-center gap-2 text-xs text-[#10B981] font-bold">
                    <DollarSign size={14} />
                    ${client.budget.toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#F3F4F6]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[10px] font-bold">
                    <User size={12} />
                  </div>
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                    {t.assigned_to}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-[#6B7280] bg-[#F3F4F6] px-2 py-1 rounded-lg uppercase tracking-wider">
                  {client.status}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
