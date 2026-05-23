import React from "react";
import { useStore } from "../store";
import { translations, countryConfig } from "../translations";
import { 
  Plus, 
  X,
  Search, 
  MapPin, 
  BedDouble, 
  Maximize2, 
  DollarSign,
  Tag,
  MoreHorizontal,
  Edit2,
  Trash2,
  Home,
  Map as MapIcon,
  List,
  Sparkles,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import PropertyMap from "./PropertyMap";
import { Map, Placemark } from "@pbe/react-yandex-maps";
import ReactMarkdown from "react-markdown";

const CITY_ALIASES: Record<string, string[]> = {
  "Almaty": ["almaty", "alma-ata", "алматы", "алма-ата"],
  "Astana": ["astana", "nur-sultan", "астана", "нур-султан", "nur sultan"],
  "Tbilisi": ["tbilisi", "тбилиси", "თბილისი"],
  "Batumi": ["batumi", "батуми", "ბათუმის"],
  "Yerevan": ["yerevan", "ереван", "երևան"],
  "Gyumri": ["gyumri", "гюмри", "գյումրի"]
};

export default function PropertiesList() {
  const { language, token, user } = useStore();
  const t = translations[language as keyof typeof translations] || translations.en;
  
  const config = countryConfig[user?.country || "Georgia"];
  const availableCities = config?.cities || ["Tbilisi", "Batumi"];
  
  const [properties, setProperties] = React.useState<any[]>([]);
  const { pendingEntity, setPendingEntity } = useStore();
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [addressMessage, setAddressMessage] = React.useState<{ text: string, type: 'error' | 'success' } | null>(null);
  const [showModal, setShowModal] = React.useState(false);
  const [viewingProperty, setViewingProperty] = React.useState<any | null>(null);
  const [viewingLang, setViewingLang] = React.useState<string>("en");
  const [translationsCache, setTranslationsCache] = React.useState<Record<number, Record<string, string>>>({});
  const [translating, setTranslating] = React.useState(false);
  const [aiError, setAiError] = React.useState<{ code: string, retryAfter?: number } | null>(null);
  const [descriptionRetryCountdown, setDescriptionRetryCountdown] = React.useState<number | null>(null);
  const [editingPropertyId, setEditingPropertyId] = React.useState<number | null>(null);
  const [geocoding, setGeocoding] = React.useState(false);
  const [generatingAI, setGeneratingAI] = React.useState(false);
  const [calculatingDistances, setCalculatingDistances] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"list" | "map">("list");

  React.useEffect(() => {
    let timer: any;
    if (descriptionRetryCountdown !== null && descriptionRetryCountdown > 0) {
      timer = setTimeout(() => setDescriptionRetryCountdown(descriptionRetryCountdown - 1), 1000);
    } else if (descriptionRetryCountdown === 0) {
      setDescriptionRetryCountdown(null);
      setAiError(null);
      setError(null);
    }
    return () => clearTimeout(timer);
  }, [descriptionRetryCountdown]);

  const [newProp, setNewProp] = React.useState({
    title: "",
    description: "",
    price: "",
    city: availableCities[0],
    district: "",
    rooms: "",
    area: "",
    property_type: "Apartment",
    address: "",
    lat: "",
    lng: ""
  });

  // Update city when available cities change or user changes
  React.useEffect(() => {
    if (availableCities.length > 0 && !availableCities.includes(newProp.city)) {
      setNewProp(prev => ({ ...prev, city: availableCities[0] }));
    }
  }, [availableCities, user?.country]);

  // Handle case where user loads after mount
  const prevCountry = React.useRef(user?.country);
  React.useEffect(() => {
    if (user?.country && user.country !== prevCountry.current) {
      prevCountry.current = user.country;
      const config = countryConfig[user.country];
      if (config) {
        setNewProp(prev => ({ ...prev, city: config.cities[0] }));
      }
    }
  }, [user?.country]);

  const isReadyForAI = !!(
    newProp.title && 
    newProp.price && 
    newProp.city && 
    newProp.rooms && 
    newProp.area && 
    newProp.property_type && 
    newProp.address && 
    newProp.lat && 
    newProp.lng
  );

  const fetchProperties = React.useCallback(() => {
    if (!token || token === "null" || token === "undefined") return;
    
    fetch("/api/properties", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(async res => {
      if (res.status === 401) {
        const data = await res.json().catch(() => ({ error: "Unauthorized" }));
        console.error("Auth error fetching properties:", data.error);
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
      setProperties(Array.isArray(data) ? data : []);
      setLoading(false);
    })
    .catch(err => {
      console.error("Failed to fetch properties:", err);
      setLoading(false);
    });
  }, [token]);

  React.useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  React.useEffect(() => {
    if (pendingEntity?.type === "property" && properties.length > 0) {
      const prop = properties.find(p => p.id === pendingEntity.id || p.id?.toString() === pendingEntity.id?.toString());
      if (prop) {
        setViewingProperty(prop);
        setPendingEntity(null);
      }
    }
  }, [pendingEntity, properties, setPendingEntity]);

  React.useEffect(() => {
    if (viewingProperty) {
      const targetLang = language;
      setViewingLang(targetLang);
      
      const propertyId = viewingProperty.id;
      if (targetLang !== 'en' && !translationsCache[propertyId]?.[targetLang] && viewingProperty.description) {
        handleTranslate(targetLang);
      }
    }
  }, [viewingProperty?.id, language]);

  const handleTranslate = async (targetLang: string) => {
    if (!viewingProperty || !viewingProperty.description) {
      setViewingLang(targetLang);
      return;
    }
    
    const propertyId = viewingProperty.id;
    
    // If it's the same as current viewing lang, do nothing
    if (viewingLang === targetLang) return;

    // If already cached, just switch
    if (translationsCache[propertyId]?.[targetLang]) {
      setViewingLang(targetLang);
      return;
    }

    // If we don't have it, we might need to translate
    // But wait, how do we know if the original IS that language?
    // For simplicity, we'll always translate if it's not the "original" 
    // unless the user clicks the language they are already seeing.
    
    setTranslating(true);
    try {
      const availableLangs = config?.languages || ["en", "ru", "ka"];
      const langNames: Record<string, string> = { en: "English", ru: "Russian", ka: "Georgian", hy: "Armenian", kk: "Kazakh" };
      const langName = langNames[targetLang] || "English";
      
      const prompt = `Translate the following real estate description into ${langName}. 
      Keep the tone professional and attractive. 
      Only return the translated text, no extra comments.
      Do not use markdown formatting (like **bold** or # headings). Use plain text only.
      
      Description: ${viewingProperty.description}`;
      
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt })
      });
      
      const data = await res.json();
      if (res.status === 429) {
        console.warn("AI Quota exceeded");
        const retrySecs = data.retryAfter ? parseInt(data.retryAfter) : 30;
        setAiError({ code: "QUOTA_EXCEEDED", retryAfter: retrySecs });
        setDescriptionRetryCountdown(retrySecs);
        setViewingLang(targetLang); // Switch anyway but it won't be translated
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to translate");

      const translatedText = data.text;
      if (translatedText) {
        setTranslationsCache(prev => ({
          ...prev,
          [propertyId]: {
            ...(prev[propertyId] || {}),
            [targetLang]: translatedText.trim()
          }
        }));
        setViewingLang(targetLang);
      }
    } catch (err) {
      console.error("Translation error:", err);
      // Fallback to just switching lang if error (though it won't show translated text)
      setViewingLang(targetLang);
    } finally {
      setTranslating(false);
    }
  };

  const handleGeocode = async () => {
    if (!newProp.address) {
      setAddressMessage({ text: "Please enter an address first", type: 'error' });
      return;
    }
    setGeocoding(true);
    setAddressMessage(null);
    try {
      const countryCodeMap: Record<string, string> = { "Georgia": "ge", "Armenia": "am", "Kazakhstan": "kz" };
      const currentCountry = user?.country || "Georgia";
      const currentCode = countryCodeMap[currentCountry] || "ge";
      
      let cleanAddress = newProp.address.trim();
      const query = `${cleanAddress}, ${newProp.district ? newProp.district + ', ' : ''}${newProp.city}, ${currentCountry}`;
      
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=${currentCode}&limit=5&addressdetails=1`, {
        headers: {
          'User-Agent': 'VistaRealCRM/1.0'
        }
      });
      const data = await res.json();
      
      if (data && data.length > 0) {
        const cityLower = newProp.city.toLowerCase();
        const aliases = CITY_ALIASES[newProp.city] || [cityLower];
        
        const filteredResults = data.filter((item: any) => {
          const displayName = item.display_name.toLowerCase();
          const address = item.address || {};
          const cityInAddr = (address.city || address.town || address.village || address.municipality || address.suburb || address.state || "").toLowerCase();
          
          return aliases.some(alias => 
            displayName.includes(alias.toLowerCase()) || 
            (cityInAddr && cityInAddr.includes(alias.toLowerCase()))
          );
        });

        const result = filteredResults.length > 0 ? filteredResults[0] : data[0];
        
        const foundDisplayName = result.display_name.toLowerCase();
        const address = result.address || {};
        const foundCityAddr = (address.city || address.town || address.village || address.municipality || address.suburb || address.state || "").toLowerCase();
                              
        const isMatch = aliases.some(alias => 
          foundDisplayName.includes(alias.toLowerCase()) || 
          (foundCityAddr && foundCityAddr.includes(alias.toLowerCase()))
        );

        if (!isMatch) {
          setAddressMessage({ 
            text: `Address "${newProp.address}" found but it doesn't seem to be in ${newProp.city}. Found: ${result.display_name}`,
            type: 'error'
          });
          return;
        }

        setNewProp({
          ...newProp,
          lat: result.lat,
          lng: result.lon
        });
        setAddressMessage({ text: "Address validated: " + result.display_name, type: 'success' });
      } else {
        setAddressMessage({ text: `Address not found in ${newProp.city}, ${currentCountry}.`, type: 'error' });
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setAddressMessage({ text: "Failed to validate address. Please try again later.", type: 'error' });
    } finally {
      setGeocoding(false);
    }
  };

  const getDistanceInfo = async (lat: number, lng: number, city: string) => {
    const landmarks: any = {
      Tbilisi: {
        center: { name: "Freedom Square (City Center)", coords: [41.6934, 44.8015], profile: "driving" },
        airport: { name: "Tbilisi International Airport", coords: [41.6691, 44.9547], profile: "driving" },
        station: { name: "Tbilisi Central Railway Station", coords: [41.7208, 44.7986], profile: "driving" },
      },
      Batumi: {
        center: { name: "Europe Square (City Center)", coords: [41.6511, 41.6363], profile: "driving" },
        airport: { name: "Batumi International Airport", coords: [41.5996, 41.5941], profile: "driving" },
        station: { name: "Batumi Central Railway Station", coords: [41.6588, 41.6775], profile: "driving" },
        sea: { name: "the Black Sea Coast", coords: [41.649, 41.625], profile: "walking" }
      },
      Yerevan: {
        center: { name: "Republic Square (City Center)", coords: [40.1776, 44.5126], profile: "driving" },
        airport: { name: "Zvartnots International Airport", coords: [40.1473, 44.3959], profile: "driving" },
        station: { name: "Yerevan Railway Station", coords: [40.1553, 44.5085], profile: "driving" },
      },
      Gyumri: {
        center: { name: "Vardanants Square (City Center)", coords: [40.7853, 43.8419], profile: "driving" },
        airport: { name: "Shirak International Airport", coords: [40.7517, 43.8583], profile: "driving" },
      },
      Astana: {
        center: { name: "Bayterek Tower (City Center)", coords: [51.1283, 71.4305], profile: "driving" },
        airport: { name: "Nursultan Nazarbayev International Airport", coords: [51.0222, 71.4669], profile: "driving" },
        station: { name: "Nur-Sultan-1 Railway Station", coords: [51.1969, 71.3995], profile: "driving" },
      },
      Almaty: {
        center: { name: "Republic Square (City Center)", coords: [43.2384, 76.9455], profile: "driving" },
        airport: { name: "Almaty International Airport", coords: [43.3448, 77.0142], profile: "driving" },
        station: { name: "Almaty-2 Railway Station", coords: [43.2737, 76.9392], profile: "driving" },
      }
    };

    const cityLandmarks = landmarks[city] || landmarks.Tbilisi;
    const results: string[] = [];

    try {
      for (const [key, landmark] of Object.entries(cityLandmarks) as [string, any][]) {
        const [tLat, tLng] = landmark.coords;
        const profile = landmark.profile || "driving";
        
        const res = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${lng},${lat};${tLng},${tLat}?overview=false`);
        const data = await res.json();
        
        if (data.routes && data.routes[0]) {
          const route = data.routes[0];
          const km = (route.distance / 1000).toFixed(1);
          const mins = Math.round(route.duration / 60);
          const transportMode = profile === "driving" ? "by car" : "walking";
          results.push(`- Distance to ${landmark.name}: ${km} km (~${mins} mins ${transportMode})`);
        }
      }

      // For Tbilisi, try to find nearest metro
      if (city === "Tbilisi") {
        // Search for subway stations specifically
        const metroRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=subway+station+near+${lat},${lng}&limit=3`, {
          headers: { 'User-Agent': 'VistaRealCRM/1.0' }
        });
        const metroData = await metroRes.json();
        
        if (metroData && metroData.length > 0) {
          // Find the one that is actually closest by straight line first to avoid weird results
          const station = metroData[0];
          const mLat = station.lat;
          const mLng = station.lon;
          // Clean up station name - often it's "Station Name (Line Name)"
          const mName = station.display_name.split(',')[0].replace("метро ", "").replace("Metro ", "");
          
          // Try walking first
          const walkRes = await fetch(`https://router.project-osrm.org/route/v1/walking/${lng},${lat};${mLng},${mLat}?overview=false`);
          const walkData = await walkRes.json();
          
          if (walkData.routes && walkData.routes[0]) {
            const route = walkData.routes[0];
            const km = (route.distance / 1000).toFixed(1);
            const mins = Math.round(route.duration / 60);
            
            // If it's more than 2km, walking is less likely, so also check driving
            if (Number(km) > 2.0) {
              const driveRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${mLng},${mLat}?overview=false`);
              const driveData = await driveRes.json();
              if (driveData.routes && driveData.routes[0]) {
                const dKm = (driveData.routes[0].distance / 1000).toFixed(1);
                const dMins = Math.round(driveData.routes[0].duration / 60);
                results.push(`- Nearest Metro Station "${mName}": ${dKm} km (~${dMins} mins by car/transport)`);
              }
            } else {
              results.push(`- Nearest Metro Station "${mName}": ${km} km (~${mins} mins walking)`);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error fetching distances:", err);
    }

    return results.join('\n');
  };

  const handleGenerateDescription = async (silent = false) => {
    if (!newProp.title) {
      if (!silent) setError("Please enter a title first to generate a description");
      return null;
    }

    setGeneratingAI(true);
    if (!silent) setError(null);

    try {
      let distanceText = "";
      if (newProp.lat && newProp.lng) {
        setCalculatingDistances(true);
        distanceText = await getDistanceInfo(Number(newProp.lat), Number(newProp.lng), newProp.city);
        setCalculatingDistances(false);
      }

      const currentCountry = user?.country || "Georgia";
      const prompt = `
        Generate a professional real estate description for a property in ${currentCountry}.
        Details:
        - Title: ${newProp.title}
        - Type: ${newProp.property_type}
        - Price: $${newProp.price || "N/A"}
        - City: ${newProp.city || "N/A"}
        - District: ${newProp.district || "N/A"}
        - Address: ${newProp.address || "N/A"}
        - Rooms: ${newProp.rooms || "N/A"}
        - Area: ${newProp.area ? newProp.area + ' m²' : "N/A"}
        
        Location Context:
        ${distanceText || "Focus on general location advantages."}
        
        The description should be professional and attractive. 
        Write it in ${language === 'en' ? 'English' : language === 'ru' ? 'Russian' : (language === 'ka' ? 'Georgian' : language === 'hy' ? 'Armenian' : 'Kazakh')}.
        Keep it concise (2-3 paragraphs).
        If distance information is available, include it naturally.
        Do not use markdown formatting. Use plain text only.
      `;

      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt })
      });
      
      const data = await response.json();
      if (response.status === 429) {
        const retrySecs = data.retryAfter ? parseInt(data.retryAfter) : 30;
        setDescriptionRetryCountdown(retrySecs);
        if (!silent) setError(language === 'ru' ? `Лимит ИИ исчерпан. Попробуйте снова через ${retrySecs}с.` : `AI limit exceeded. Please retry in ${retrySecs}s.`);
        return null;
      }
      if (!response.ok) throw new Error(data.error || "Failed to generate");

      const text = data.text;
      if (text) {
        const trimmed = text.trim();
        setNewProp(prev => ({ ...prev, description: trimmed }));
        return trimmed;
      }
      return null;
    } catch (err: any) {
      console.error("AI Generation error:", err);
      if (!silent) setError("Failed to generate description. Please try again.");
      return null;
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newProp.address) {
      setAddressMessage({ text: "Address is required.", type: 'error' });
      return;
    }

    if (!newProp.lat || !newProp.lng) {
      setAddressMessage({ text: "Please validate the address first.", type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      let finalDescription = newProp.description;
      
      // Auto-generate description if missing but all other fields are ready
      if (!finalDescription && isReadyForAI) {
        const generated = await handleGenerateDescription(true);
        if (generated) {
          finalDescription = generated;
        }
      }

      const method = editingPropertyId ? "PUT" : "POST";
      const url = editingPropertyId ? `/api/properties/${editingPropertyId}` : "/api/properties";
      
      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          ...newProp,
          description: finalDescription,
          price: Number(newProp.price) || 0,
          rooms: Number(newProp.rooms) || 0,
          area: Number(newProp.area) || 0,
          lat: newProp.lat ? Number(newProp.lat) : null,
          lng: newProp.lng ? Number(newProp.lng) : null
        })
      });
      
      console.log("Response status:", res.status);
      if (res.status === 401) {
        useStore.getState().logout();
        return;
      }
      
      const data = await res.json();
      console.log("Response data:", data);
      
      if (res.ok) {
        console.log("Property saved successfully");
        setShowModal(false);
        setEditingPropertyId(null);
        setNewProp({ 
          title: "", 
          description: "",
          price: "", 
          city: availableCities[0], 
          district: "", 
          rooms: "", 
          area: "", 
          property_type: "Apartment", 
          address: "", 
          lat: "", 
          lng: "" 
        });
        fetchProperties();
      } else {
        const err = await res.json();
        console.error("Server error:", err.error);
        if (res.status === 403 && err.error === "LIMIT_REACHED") {
          setError(t.demo_limit_reached || err.message);
        } else {
          setError(err.error || "Failed to save property");
        }
      }
    } catch (err: any) {
      console.error("Save property error:", err);
      setError(err.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProperty = async (id: number) => {
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchProperties();
      } else {
        const err = await res.json();
        console.error(`Error: ${err.error || "Failed to delete property"}`);
      }
    } catch (err) {
      console.error("Delete property error:", err);
    }
  };

  const openEditModal = (prop: any) => {
    setError(null);
    setAddressMessage(null);
    setEditingPropertyId(prop.id);
    setNewProp({
      title: prop.title || "",
      description: prop.description || "",
      price: prop.price?.toString() || "",
      city: prop.city || availableCities[0],
      district: prop.district || "",
      rooms: prop.rooms?.toString() || "",
      area: prop.area?.toString() || "",
      property_type: prop.property_type || "Apartment",
      address: prop.address || "",
      lat: prop.lat?.toString() || "",
      lng: prop.lng?.toString() || ""
    });
    setShowModal(true);
  };

  const handleOpenAddModal = () => {
    if (properties.length >= 3) {
      setError(t.demo_limit_reached);
      return;
    }
    setError(null);
    setAddressMessage(null);
    setEditingPropertyId(null);
    setNewProp({ title: "", description: "", price: "", city: availableCities[0], district: "", rooms: "", area: "", property_type: "Apartment", address: "", lat: "", lng: "" });
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{t.properties}</h1>
          <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 shadow-sm">
            <Search size={18} className="text-[#9CA3AF]" />
            <input 
              type="text" 
              placeholder={t.search} 
              className="bg-transparent border-none focus:ring-0 text-sm font-medium w-48"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl p-1 shadow-sm">
          <button 
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-[#10B981] text-white shadow-md" : "text-[#6B7280] hover:bg-[#F3F4F6]"}`}
            title={t.list_view}
          >
            <List size={20} />
          </button>
          <button 
            onClick={() => setViewMode("map")}
            className={`p-2 rounded-lg transition-all ${viewMode === "map" ? "bg-[#10B981] text-white shadow-md" : "text-[#6B7280] hover:bg-[#F3F4F6]"}`}
            title={t.map_view}
          >
            <MapIcon size={20} />
          </button>
        </div>
        <button 
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-[#10B981] text-white px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-[#10B981]/20 hover:bg-[#059669] transition-all"
        >
          <Plus size={20} />
          {t.add_property}
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
        {viewingProperty && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="overflow-y-auto flex-1">
                <div className="relative h-48 md:h-72 shrink-0">
                  <img 
                    src={`https://picsum.photos/seed/${viewingProperty.id}/1200/800`} 
                    alt={viewingProperty.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-6 right-6 flex gap-3">
                    <button 
                      onClick={() => {
                        const prop = viewingProperty;
                        setViewingProperty(null);
                        openEditModal(prop);
                      }}
                      className="p-3 bg-white/90 backdrop-blur rounded-xl shadow-lg hover:bg-white transition-all text-[#10B981] hover:scale-110"
                      title="Edit"
                    >
                      <Edit2 size={20} />
                    </button>
                    <button 
                      onClick={() => {
                        const id = viewingProperty.id;
                        setViewingProperty(null);
                        handleDeleteProperty(id);
                      }}
                      className="p-3 bg-white/90 backdrop-blur rounded-xl shadow-lg hover:bg-white transition-all text-red-500 hover:scale-110"
                      title="Delete"
                    >
                      <Trash2 size={20} />
                    </button>
                    <button 
                      onClick={() => setViewingProperty(null)}
                      className="p-3 bg-black/50 backdrop-blur rounded-xl shadow-lg hover:bg-black/70 transition-all text-white hover:scale-110"
                    >
                      <Plus size={24} className="rotate-45" />
                    </button>
                  </div>
                  <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider shadow-lg">
                    {viewingProperty.property_type} • {viewingProperty.status}
                  </div>
                </div>

                <div className="p-8 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-[#111827] mb-2">{viewingProperty.title}</h2>
                      <div className="flex items-center gap-2 text-[#6B7280]">
                        <MapPin size={18} />
                        <span className="text-lg">
                          {viewingProperty.city}{viewingProperty.district ? `, ${viewingProperty.district}` : ''}{viewingProperty.address ? `, ${viewingProperty.address}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-4xl font-black text-[#10B981] flex items-center">
                      <DollarSign size={32} />
                      {viewingProperty.price?.toLocaleString()}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-[#F9FAFB] rounded-2xl border border-[#F3F4F6]">
                    <div className="flex flex-col items-center gap-1">
                      <BedDouble size={24} className="text-[#9CA3AF]" />
                      <span className="text-xs font-bold text-[#6B7280] uppercase">{t.rooms}</span>
                      <span className="text-lg font-bold">{viewingProperty.rooms}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Maximize2 size={24} className="text-[#9CA3AF]" />
                      <span className="text-xs font-bold text-[#6B7280] uppercase">{t.area}</span>
                      <span className="text-lg font-bold">{viewingProperty.area} m²</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Home size={24} className="text-[#9CA3AF]" />
                      <span className="text-xs font-bold text-[#6B7280] uppercase">{(t as any).type}</span>
                      <span className="text-lg font-bold">{viewingProperty.property_type}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <MapIcon size={24} className="text-[#9CA3AF]" />
                      <span className="text-xs font-bold text-[#6B7280] uppercase">{t.city}</span>
                      <span className="text-lg font-bold">{viewingProperty.city}</span>
                    </div>
                  </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-[#111827]">{(t as any).description}</h3>
                        <div className="flex bg-[#F3F4F6] p-1 rounded-lg gap-1">
                          {(config?.languages || ["en", "ru", "ka"]).map((langCode) => {
                            const labels: Record<string, string> = { en: "EN", ru: "RU", ka: "GE", hy: "AM", kk: "KZ" };
                            return (
                              <button
                                key={langCode}
                                onClick={() => handleTranslate(langCode)}
                                disabled={translating}
                                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                                  viewingLang === langCode 
                                    ? "bg-white text-[#10B981] shadow-sm" 
                                    : "text-[#6B7280] hover:bg-white/50"
                                }`}
                              >
                                {labels[langCode] || langCode.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {aiError?.code === "QUOTA_EXCEEDED" && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-amber-800 text-[10px] font-bold">
                              <Sparkles size={14} className="text-amber-500" />
                              {language === 'ru' ? 'Лимит ИИ исчерпан.' : 'AI limit exceeded.'}
                              {descriptionRetryCountdown !== null && (
                                <span className="text-[#6B7280] font-normal lowercase">
                                  {language === 'ru' ? `попробуйте снова через ${descriptionRetryCountdown}с` : `retry in ${descriptionRetryCountdown}s`}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-amber-700 font-medium opacity-80">
                              {language === 'ru' ? 'Показано описание на английском.' : 'Showing description in English.'}
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              console.log("Upgrade requested");
                              setAiError(null);
                            }}
                            className="px-2 py-1 bg-amber-500 text-white rounded-lg text-[10px] font-bold hover:bg-amber-600 transition-colors uppercase tracking-wider shrink-0"
                          >
                            {language === 'ru' ? 'Улучшить' : 'Upgrade'}
                          </button>
                        </div>
                      )}
                      <div className="prose prose-sm max-w-none text-[#4B5563] leading-relaxed whitespace-pre-wrap relative min-h-[100px]">
                        {translating && (
                          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl">
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 size={24} className="animate-spin text-[#10B981]" />
                              <span className="text-[10px] font-bold text-[#10B981] animate-pulse uppercase tracking-widest">Translating...</span>
                            </div>
                          </div>
                        )}
                        <ReactMarkdown>
                          {translationsCache[viewingProperty.id]?.[viewingLang] || viewingProperty.description || "No description available."}
                        </ReactMarkdown>
                      </div>
                  </div>

                  {viewingProperty.lat && viewingProperty.lng && (
                    <div className="space-y-3">
                      <h3 className="text-xl font-bold text-[#111827]">{(t as any).location}</h3>
                      <div className="w-full h-64 rounded-2xl overflow-hidden border border-[#E5E7EB] shadow-sm">
                        <Map 
                          defaultState={{ 
                            center: [Number(viewingProperty.lat), Number(viewingProperty.lng)], 
                            zoom: 15 
                          }} 
                          width="100%" 
                          height="100%"
                        >
                          <Placemark 
                            geometry={[Number(viewingProperty.lat), Number(viewingProperty.lng)]}
                            properties={{
                              balloonContent: viewingProperty.title,
                              hintContent: viewingProperty.address
                            }}
                            options={{
                              preset: "islands#greenDotIcon"
                            }}
                          />
                        </Map>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
            >
              <form onSubmit={handleAddProperty} className="flex flex-col overflow-hidden h-full">
                <div className="p-6 border-b border-[#F3F4F6] flex items-center justify-between shrink-0">
                  <h2 className="text-xl font-bold text-[#111827]">{editingPropertyId ? "Edit Property" : t.add_property}</h2>
                  <button type="button" onClick={() => setShowModal(false)} className="text-[#9CA3AF] hover:text-[#111827]">
                    <Plus size={24} className="rotate-45" />
                  </button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                  {error && (
                    <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
                      {error}
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Title</label>
                    <input 
                      required
                      type="text" 
                      value={newProp.title}
                      onChange={e => setNewProp({...newProp, title: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Description</label>
                      <button
                        type="button"
                        onClick={() => handleGenerateDescription(false)}
                        disabled={generatingAI || !isReadyForAI}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-[#10B981] hover:text-[#059669] transition-all disabled:opacity-50 disabled:grayscale"
                      >
                        {generatingAI || calculatingDistances ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Sparkles size={12} />
                        )}
                        {calculatingDistances ? "Calculating distances..." : "Generate with AI"}
                      </button>
                    </div>
                    <textarea 
                      value={newProp.description}
                      onChange={e => setNewProp({...newProp, description: e.target.value})}
                      className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent min-h-[120px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">City</label>
                      <select 
                        value={newProp.city}
                        onChange={e => setNewProp({...newProp, city: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      >
                        {availableCities.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">District</label>
                      <input 
                        type="text" 
                        value={newProp.district}
                        onChange={e => setNewProp({...newProp, district: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Address</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="e.g. Rustaveli Ave 1, Tbilisi"
                        value={newProp.address}
                        onChange={e => {
                          setNewProp({...newProp, address: e.target.value});
                          if (addressMessage) setAddressMessage(null);
                        }}
                        className="flex-1 bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={handleGeocode}
                        disabled={geocoding || !newProp.address}
                        className="px-4 py-2 bg-[#10B981] text-white rounded-xl text-xs font-bold hover:bg-[#059669] disabled:opacity-50 transition-all shadow-sm"
                      >
                        {geocoding ? "..." : "Validate"}
                      </button>
                    </div>
                    {addressMessage && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className={`text-[10px] font-bold px-1 mt-1 ${addressMessage.type === 'success' ? 'text-[#10B981]' : 'text-red-500'}`}
                      >
                        {addressMessage.type === 'success' && "✓ "}{addressMessage.text}
                      </motion.div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Price ($)</label>
                      <input 
                        required
                        type="number" 
                        value={newProp.price}
                        onChange={e => setNewProp({...newProp, price: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Type</label>
                      <select 
                        value={newProp.property_type}
                        onChange={e => setNewProp({...newProp, property_type: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      >
                        <option value="Apartment">Apartment</option>
                        <option value="House">House</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Land">Land</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Rooms</label>
                      <input 
                        type="number" 
                        value={newProp.rooms}
                        onChange={e => setNewProp({...newProp, rooms: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Area (m²)</label>
                      <input 
                        type="number" 
                        value={newProp.area}
                        onChange={e => setNewProp({...newProp, area: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.latitude || "Latitude"}</label>
                      <input 
                        type="number" 
                        step="any"
                        placeholder="41.7151"
                        value={newProp.lat}
                        onChange={e => setNewProp({...newProp, lat: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.longitude || "Longitude"}</label>
                      <input 
                        type="number" 
                        step="any"
                        placeholder="44.8271"
                        value={newProp.lng}
                        onChange={e => setNewProp({...newProp, lng: e.target.value})}
                        className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-[#F3F4F6] shrink-0">
                  <button 
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[#10B981] text-white py-3 rounded-xl font-bold shadow-lg shadow-[#10B981]/20 hover:bg-[#059669] transition-all disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : (editingPropertyId ? "Update Property" : t.add_property)}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {viewMode === "map" ? (
        <PropertyMap properties={properties} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((prop, i) => (
            <motion.div
              key={prop.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden group hover:shadow-xl transition-all duration-300"
            >
              <div className="relative h-48 bg-[#F3F4F6] cursor-pointer" onClick={() => setViewingProperty(prop)}>
                <img 
                  src={`https://picsum.photos/seed/${prop.id}/600/400`} 
                  alt={prop.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm">
                  {prop.status}
                </div>
                <div className="absolute top-4 right-4 flex gap-2">
                  <button 
                    onClick={() => openEditModal(prop)}
                    className="p-2 bg-white/90 backdrop-blur rounded-lg shadow-sm hover:bg-white transition-colors text-[#6B7280] hover:text-[#10B981]"
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDeleteProperty(prop.id)}
                    className="p-2 bg-white/90 backdrop-blur rounded-lg shadow-sm hover:bg-white transition-colors text-[#6B7280] hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-1 text-[#10B981] font-bold text-xl mb-1">
                  <DollarSign size={20} />
                  {prop.price?.toLocaleString()}
                </div>
                <h3 
                  className="font-bold text-lg mb-2 line-clamp-1 group-hover:text-[#10B981] transition-colors cursor-pointer"
                  onClick={() => setViewingProperty(prop)}
                >
                  {prop.title}
                </h3>
                
                <div className="flex items-center gap-2 text-[#6B7280] text-sm mb-4">
                  <MapPin size={16} className="text-[#9CA3AF]" />
                  <span className="line-clamp-1">
                    {prop.city}{prop.district ? `, ${prop.district}` : ''}{prop.address ? `, ${prop.address}` : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#F3F4F6]">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-[#374151]">
                      <BedDouble size={18} className="text-[#9CA3AF]" />
                      {prop.rooms}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-[#374151]">
                      <Maximize2 size={18} className="text-[#9CA3AF]" />
                      {prop.area} m²
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">
                    <Tag size={14} />
                    {prop.property_type}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {properties.length === 0 && !loading && (
            <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-[#E5E7EB]">
              <Home size={48} className="mx-auto text-[#E5E7EB] mb-4" />
              <p className="text-[#6B7280] font-medium">{t.no_properties}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
