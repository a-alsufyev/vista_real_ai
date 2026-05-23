import React from "react";
import { useStore } from "../store";
import { translations } from "../translations";
import { 
  Handshake, 
  Search, 
  Filter, 
  ArrowRight,
  DollarSign,
  Calendar,
  User,
  Building2,
  Plus,
  X,
  Edit2,
  Trash2,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function DealsPipeline() {
  const { language, token, setActiveTab, pendingEntity, setPendingEntity } = useStore();
  const t = translations[language as keyof typeof translations] || translations.en;
  
  const [deals, setDeals] = React.useState<any[]>([]);
  const [clients, setClients] = React.useState<any[]>([]);
  const [properties, setProperties] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [dealToDelete, setDealToDelete] = React.useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = React.useState<any>(null);
  const [viewingDeal, setViewingDeal] = React.useState<any | null>(null);
  const [newDeal, setNewDeal] = React.useState({
    client_id: "",
    property_id: "",
    amount: "",
    status: "prospect"
  });
  const [warnings, setWarnings] = React.useState<string[]>([]);

  // Effect to validate deal and set warnings
  React.useEffect(() => {
    if (showModal && newDeal.client_id && newDeal.property_id) {
      const client = clients.find(c => String(c.id) === String(newDeal.client_id));
      const property = properties.find(p => String(p.id) === String(newDeal.property_id));
      
      if (client && property) {
        const newWarnings: string[] = [];
        
        // Price check
        if (Number(newDeal.amount) > Number(client.budget)) {
          newWarnings.push(language === 'ru' 
            ? `Цена ($${Number(newDeal.amount).toLocaleString()}) выше бюджета клиента ($${Number(client.budget).toLocaleString()})`
            : `Price ($${Number(newDeal.amount).toLocaleString()}) is higher than client budget ($${Number(client.budget).toLocaleString()})`
          );
        }
        
        // City check
        if (client.city && property.city && client.city.toLowerCase() !== property.city.toLowerCase()) {
          newWarnings.push(language === 'ru'
            ? `Город объекта (${property.city}) не совпадает с предпочтениями клиента (${client.city})`
            : `Property city (${property.city}) does not match client preference (${client.city})`
          );
        }
        
        // Rooms check
        if (client.rooms && property.rooms && String(client.rooms) !== String(property.rooms)) {
          newWarnings.push(language === 'ru'
            ? `Кол-во комнат (${property.rooms}) не совпадает с предпочтениями клиента (${client.rooms})`
            : `Property rooms (${property.rooms}) does not match client preference (${client.rooms})`
          );
        }
        
        setWarnings(newWarnings);
      } else {
        setWarnings([]);
      }
    } else {
      setWarnings([]);
    }
  }, [newDeal.client_id, newDeal.property_id, newDeal.amount, showModal, clients, properties, language]);

  const fetchDeals = React.useCallback(() => {
    if (!token || token === "null" || token === "undefined") return;
    setLoading(true);
    fetch("/api/deals", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(async res => {
      if (res.status === 401) {
        useStore.getState().logout();
        return;
      }
      return res.json();
    })
    .then(data => {
      setDeals(Array.isArray(data) ? data : []);
      setLoading(false);
    })
    .catch(err => {
      console.error("Failed to fetch deals:", err);
      setLoading(false);
    });
  }, [token]);

  const fetchClientsAndProperties = React.useCallback(() => {
    if (!token || token === "null" || token === "undefined") return;
    
    // Fetch Clients
    fetch("/api/leads", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setClients(Array.isArray(data) ? data : []));

    // Fetch Properties
    fetch("/api/properties", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setProperties(Array.isArray(data) ? data : []));
  }, [token]);

  React.useEffect(() => {
    fetchDeals();
    fetchClientsAndProperties();
  }, [fetchDeals, fetchClientsAndProperties]);

  React.useEffect(() => {
    if (pendingEntity?.type === "deal" && deals.length > 0) {
      const deal = deals.find(d => d.id === pendingEntity.id || d.id?.toString() === pendingEntity.id?.toString());
      if (deal) {
        setViewingDeal(deal);
        setPendingEntity(null);
      }
    }
  }, [pendingEntity, deals, setPendingEntity]);

  const [error, setError] = React.useState<string | null>(null);

  const handleAddDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          lead_id: newDeal.client_id,
          property_id: newDeal.property_id,
          amount: Number(newDeal.amount),
          status: newDeal.status
        })
      });

      if (res.status === 401) {
        useStore.getState().logout();
        return;
      }
      
      if (res.ok) {
        setShowModal(false);
        setNewDeal({ client_id: "", property_id: "", amount: "", status: "prospect" });
        fetchDeals();
      } else {
        const err = await res.json();
        if (res.status === 403 && err.error === "LIMIT_REACHED") {
          setError(t.demo_limit_reached || err.message);
        } else {
          setError(err.error || "Failed to create deal");
        }
      }
    } catch (err) {
      console.error("Failed to create deal:", err);
      setError("Network error. Please try again.");
    }
  };

  const openEditModal = (deal: any) => {
    setSelectedDeal({
      ...deal,
      status: deal.status || deal.stage // Ensure status exists for the edit form
    });
    setShowEditModal(true);
  };

  const handleUpdateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/deals/${selectedDeal.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          status: selectedDeal.status,
          amount: Number(selectedDeal.amount)
        })
      });
      
      if (res.ok) {
        setShowEditModal(false);
        fetchDeals();
      }
    } catch (err) {
      console.error("Failed to update deal:", err);
    }
  };

  const handleDeleteDeal = async (id: string) => {
    setDealToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!dealToDelete) return;
    try {
      const res = await fetch(`/api/deals/${dealToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setShowDeleteConfirm(false);
        setDealToDelete(null);
        fetchDeals();
      }
    } catch (err) {
      console.error("Failed to delete deal:", err);
    }
  };

  const stages = ["lead", "viewing", "offer", "negotiation", "closed"];

  const handleOpenAddModal = () => {
    if (deals.length >= 3) {
      setError(t.demo_limit_reached);
      return;
    }
    setError(null);
    setNewDeal({ client_id: "", property_id: "", amount: "", status: "prospect" });
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{t.deals}</h1>
          <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 shadow-sm">
            <Search size={18} className="text-[#9CA3AF]" />
            <input 
              type="text" 
              placeholder={t.search} 
              className="bg-transparent border-none focus:ring-0 text-sm font-medium w-48"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-white border border-[#E5E7EB] text-[#374151] px-4 py-2.5 rounded-xl font-bold hover:bg-[#F9FAFB] transition-all">
            <Filter size={20} />
            Filter
          </button>
          <button 
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 bg-[#10B981] text-white px-4 py-2.5 rounded-xl font-bold hover:bg-[#059669] transition-all shadow-lg shadow-emerald-100"
          >
            <Plus size={20} />
            {t.add_deal || "Add Deal"}
          </button>
        </div>
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

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
              <th className="px-6 py-4 text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">Property & Client</th>
              <th className="px-6 py-4 text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">Price</th>
              <th className="px-6 py-4 text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">Stage</th>
              <th className="px-6 py-4 text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">Created</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {deals.map((deal, i) => (
              <motion.tr 
                key={deal.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="hover:bg-[#F9FAFB] transition-colors group cursor-pointer"
                onClick={(e) => {
                  // Don't trigger if a button was clicked
                  if ((e.target as HTMLElement).closest('button')) return;
                  setViewingDeal(deal);
                }}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <div className="font-bold text-[#111827]">{deal.property_title || "Unknown Property"}</div>
                      <div className="flex items-center gap-1 text-xs text-[#6B7280] font-medium mt-0.5">
                        <User size={12} />
                        {deal.lead_name || "Unknown Client"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 font-bold text-[#111827]">
                    <DollarSign size={16} />
                    {deal.price?.toLocaleString() || deal.amount?.toLocaleString()}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {stages.map((s, idx) => (
                        <div 
                          key={s} 
                          className={`w-2 h-2 rounded-full ${stages.indexOf(deal.stage?.toLowerCase() || "lead") >= idx ? "bg-[#10B981]" : "bg-[#E5E7EB]"}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-bold text-[#374151] uppercase tracking-wider">{deal.stage || "Prospect"}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600">
                    {deal.stage}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-xs text-[#6B7280] font-medium">
                    <Calendar size={14} className="text-[#9CA3AF]" />
                    {new Date(deal.createdAt).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDeal(deal.id);
                      }}
                      className="p-2 text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(deal);
                      }}
                      className="p-2 text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-lg transition-all"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        
        {deals.length === 0 && !loading && (
          <div className="py-20 text-center">
            <Handshake size={48} className="mx-auto text-[#E5E7EB] mb-4" />
            <p className="text-[#6B7280] font-medium">{t.no_deals}</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-[#111827]/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-[#F3F4F6] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#111827]">{t.add_deal || "Add Deal"}</h2>
                <button 
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-[#F3F4F6] rounded-xl transition-colors"
                >
                  <X size={20} className="text-[#9CA3AF]" />
                </button>
              </div>

              <form onSubmit={handleAddDeal} className="p-8 space-y-6">
                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-medium">
                    {error}
                  </div>
                )}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.leads}</label>
                    <select 
                      required
                      value={newDeal.client_id}
                      onChange={e => setNewDeal({...newDeal, client_id: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent outline-none transition-all"
                    >
                      <option value="">{language === 'ru' ? 'Выберите клиента' : 'Select a Client'}</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>{client.name} ({client.email || client.phone})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.properties}</label>
                    <select 
                      required
                      value={newDeal.property_id}
                      onChange={e => {
                        const propId = e.target.value;
                        const property = properties.find(p => String(p.id) === String(propId));
                        setNewDeal(prev => ({
                          ...prev, 
                          property_id: propId,
                          amount: property ? String(property.price) : prev.amount
                        }));
                      }}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent outline-none transition-all"
                    >
                      <option value="">{language === 'ru' ? 'Выберите объект' : 'Select a Property'}</option>
                      {properties.map(prop => (
                        <option key={prop.id} value={prop.id}>{prop.title} - ${prop.price?.toLocaleString()}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.price}</label>
                    <div className="relative">
                      <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                      <input 
                        type="number" 
                        placeholder="0.00"
                        value={newDeal.amount}
                        onChange={e => setNewDeal({...newDeal, amount: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent outline-none transition-all"
                      />
                    </div>
                  </div>

                  {warnings.length > 0 && (
                    <div className="space-y-2">
                      {warnings.map((warning, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-xl text-xs font-bold border border-amber-100"
                        >
                          <AlertCircle size={14} className="shrink-0" />
                          {warning}
                        </motion.div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.status}</label>
                    <select 
                      value={newDeal.status}
                      onChange={e => setNewDeal({...newDeal, status: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent outline-none transition-all"
                    >
                      {stages.map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-6 py-3 border border-[#E5E7EB] text-[#374151] rounded-xl font-bold hover:bg-[#F9FAFB] transition-all"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-[#10B981] text-white rounded-xl font-bold hover:bg-[#059669] transition-all shadow-lg shadow-emerald-100"
                  >
                    {t.create}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {viewingDeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingDeal(null)}
              className="absolute inset-0 bg-[#111827]/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-[#F3F4F6] flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                    <Handshake size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#111827]">{viewingDeal.property_title || "Deal Details"}</h2>
                    <p className="text-sm text-[#6B7280] font-medium">{viewingDeal.lead_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      openEditModal(viewingDeal);
                      setViewingDeal(null);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F3F4F6] text-[#374151] rounded-xl font-bold hover:bg-[#E5E7EB] transition-all"
                  >
                    <Edit2 size={18} />
                    {t.edit}
                  </button>
                  <button 
                    onClick={() => setViewingDeal(null)}
                    className="p-2 hover:bg-[#F3F4F6] rounded-xl transition-colors"
                  >
                    <X size={20} className="text-[#9CA3AF]" />
                  </button>
                </div>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#F3F4F6]">
                    <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">{language === 'ru' ? 'Статус' : 'Status'}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#10B981]" />
                      <span className="font-bold text-[#374151] uppercase tracking-wider">{viewingDeal.stage}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#F3F4F6]">
                    <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">{t.price}</div>
                    <div className="flex items-center gap-1 font-bold text-[#111827]">
                      <DollarSign size={16} />
                      {(viewingDeal.amount || viewingDeal.price)?.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-2">
                    <Building2 size={14} className="text-emerald-500" />
                    Property Info
                  </h3>
                  <button 
                    onClick={() => {
                      setPendingEntity({ type: 'property', id: viewingDeal.property_id });
                      setActiveTab('properties');
                      setViewingDeal(null);
                    }}
                    className="w-full text-left bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center justify-between hover:border-[#10B981] hover:shadow-md transition-all group"
                  >
                    <div>
                      <div className="text-sm font-bold text-[#111827] group-hover:text-[#10B981] transition-colors">{viewingDeal.property_title}</div>
                      <div className="text-xs text-[#6B7280]">{viewingDeal.property_address}</div>
                    </div>
                    <ArrowRight size={18} className="text-[#9CA3AF] group-hover:text-[#10B981] transition-colors" />
                  </button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-2">
                    <User size={14} className="text-blue-500" />
                    Client Info
                  </h3>
                  <button 
                    onClick={() => {
                      setPendingEntity({ type: 'lead', id: viewingDeal.lead_id });
                      setActiveTab('leads');
                      setViewingDeal(null);
                    }}
                    className="w-full text-left bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center justify-between hover:border-blue-500 hover:shadow-md transition-all group"
                  >
                    <div>
                      <div className="text-sm font-bold text-[#111827] group-hover:text-blue-500 transition-colors">{viewingDeal.lead_name}</div>
                      <div className="text-xs text-[#6B7280]">{viewingDeal.lead_email || viewingDeal.lead_phone}</div>
                    </div>
                    <ArrowRight size={18} className="text-[#9CA3AF] group-hover:text-blue-500 transition-colors" />
                  </button>
                </div>

                <div className="pt-4 border-t border-[#F3F4F6] flex items-center justify-between text-xs text-[#9CA3AF]">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    Created: {new Date(viewingDeal.createdAt).toLocaleDateString()}
                  </div>
                  <div className="font-medium">ID: {viewingDeal.id}</div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showEditModal && selectedDeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="absolute inset-0 bg-[#111827]/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-[#F3F4F6] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#111827]">{t.edit_deal || "Edit Deal"}</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      handleDeleteDeal(selectedDeal.id);
                      setShowEditModal(false);
                    }}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button 
                    onClick={() => setShowEditModal(false)}
                    className="p-2 hover:bg-[#F3F4F6] rounded-xl transition-colors"
                  >
                    <X size={20} className="text-[#9CA3AF]" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleUpdateDeal} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="bg-[#F9FAFB] p-4 rounded-2xl border border-[#E5E7EB] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#6B7280]">Property</span>
                      <span className="font-bold">{selectedDeal.property_title}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#6B7280]">Client</span>
                      <span className="font-bold">{selectedDeal.lead_name}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.price}</label>
                    <div className="relative">
                      <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                      <input 
                        type="number" 
                        placeholder="0.00"
                        value={selectedDeal.amount}
                        onChange={e => setSelectedDeal({...selectedDeal, amount: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.status}</label>
                    <select 
                      value={selectedDeal.status}
                      onChange={e => setSelectedDeal({...selectedDeal, status: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent outline-none transition-all"
                    >
                      {stages.map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 px-6 py-3 border border-[#E5E7EB] text-[#374151] rounded-xl font-bold hover:bg-[#F9FAFB] transition-all"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-[#10B981] text-white rounded-xl font-bold hover:bg-[#059669] transition-all shadow-lg shadow-emerald-100"
                  >
                    {t.save}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-[#111827]/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-[#111827] mb-2">{language === 'ru' ? 'Удалить сделку?' : 'Delete Deal?'}</h3>
              <p className="text-[#6B7280] mb-8 font-medium">
                {language === 'ru' 
                  ? 'Вы уверены, что хотите удалить эту сделку? Это действие нельзя отменить.' 
                  : 'Are you sure you want to delete this deal? This action cannot be undone.'}
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-6 py-3 border border-[#E5E7EB] text-[#374151] rounded-xl font-bold hover:bg-[#F9FAFB] transition-all"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100"
                >
                  {t.delete}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
