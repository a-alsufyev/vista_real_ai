import React from "react";
import { useStore } from "../store";
import { translations } from "../translations";
import { 
  Users, 
  Home, 
  Handshake, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { motion } from "motion/react";

export default function Dashboard() {
  const { language, token } = useStore();
  const t = translations[language];
  const [activities, setActivities] = React.useState<any[]>([]);
  const [counts, setCounts] = React.useState({ clients: 0, properties: 0, deals: 0 });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!token || token === "null" || token === "undefined") return;
    
    const fetchData = async () => {
      try {
        const [leadsRes, propsRes, dealsRes] = await Promise.all([
          fetch("/api/leads", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/properties", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/deals", { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (leadsRes.status === 401 || propsRes.status === 401 || dealsRes.status === 401) {
          useStore.getState().logout();
          return;
        }

        const leads = await leadsRes.json().catch(() => []);
        const properties = await propsRes.json().catch(() => []);
        const deals = await dealsRes.json().catch(() => []);

        // Ensure we have arrays to avoid .map or .length errors
        const safeLeads = Array.isArray(leads) ? leads : [];
        const safeProperties = Array.isArray(properties) ? properties : [];
        const safeDeals = Array.isArray(deals) ? deals : [];

        setCounts({
          clients: safeLeads.length,
          properties: safeProperties.length,
          deals: safeDeals.length
        });

        // Combine activities
        const allActivities: any[] = [
          ...safeLeads.map((l: any) => ({
            id: `client-${l.id}`,
            type: "client",
            message: language === 'ru' ? `Новый клиент ${l.name} добавлен (${l.city || "н/д"})` : `New client ${l.name} added from ${l.city || "Unknown"}`,
            time: l.created_at,
            icon: Users,
            rawDate: new Date(l.created_at)
          })),
          ...safeProperties.map((p: any) => ({
            id: `prop-${p.id}`,
            type: "property",
            message: `New property listed: ${p.title} in ${p.city}`,
            time: p.created_at,
            icon: Home,
            rawDate: new Date(p.created_at)
          })),
          ...safeDeals.map((d: any) => ({
            id: `deal-${d.id}`,
            type: "deal",
            message: `Deal stage updated: ${d.property_title} (${d.stage})`,
            time: d.created_at,
            icon: Handshake,
            rawDate: new Date(d.created_at)
          }))
        ];

        // Sort by date
        allActivities.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
        setActivities(allActivities.slice(0, 5));
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const stats = [
    { label: t.new_leads, value: (counts.clients ?? 0).toString(), change: "+12%", positive: true, icon: Users, color: "bg-blue-50 text-blue-600" },
    { label: t.active_deals, value: (counts.deals ?? 0).toString(), change: "+5%", positive: true, icon: Handshake, color: "bg-emerald-50 text-emerald-600" },
    { label: t.total_properties, value: (counts.properties ?? 0).toString(), change: "-2%", positive: false, icon: Home, color: "bg-violet-50 text-violet-600" },
    { label: t.agent_performance, value: "92%", change: "+8%", positive: true, icon: TrendingUp, color: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-[#E5E7EB] hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.color}`}>
                <stat.icon size={24} />
              </div>
              <div className={`flex items-center gap-1 text-sm font-bold ${stat.positive ? "text-emerald-600" : "text-rose-600"}`}>
                {stat.change}
                {stat.positive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              </div>
            </div>
            <div className="text-3xl font-bold mb-1">{stat.value}</div>
            <div className="text-sm text-[#6B7280] font-medium">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold">Revenue Overview</h2>
            <select className="bg-[#F3F4F6] border-none rounded-lg px-3 py-1.5 text-sm font-medium">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-64 flex items-end justify-between gap-2">
            {[40, 60, 45, 90, 65, 80, 55].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  className="w-full bg-[#10B981] rounded-t-lg opacity-80 group-hover:opacity-100 transition-opacity"
                />
                <span className="text-xs text-[#9CA3AF] font-medium">Day {i+1}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8">
          <h2 className="text-xl font-bold mb-8">Recent Activity</h2>
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-[#10B981]" size={24} />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8 text-[#9CA3AF] text-sm">No recent activity</div>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] shrink-0">
                    <activity.icon size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-medium leading-snug">{activity.message}</div>
                    <div className="text-xs text-[#9CA3AF] mt-1">{formatTime(activity.time)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <button className="w-full mt-8 py-3 text-sm font-bold text-[#10B981] hover:bg-[#F0FDF4] rounded-xl transition-colors">
            View All Activity
          </button>
        </div>
      </div>
    </div>
  );
}
