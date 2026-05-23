import React from "react";
import { useStore, Message } from "../store";
import { translations } from "../translations";
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Plus, 
  Home, 
  Users,
  Loader2,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";

const searchPropertiesTool: any = {
  name: "searchProperties",
  description: "Search for properties in the database based on criteria.",
  parameters: {
    type: "OBJECT",
    properties: {
      city: { type: "STRING", description: "City name, e.g., Batumi, Tbilisi" },
      maxPrice: { type: "NUMBER", description: "Maximum price in USD" },
      minRooms: { type: "NUMBER", description: "Minimum number of rooms" },
      propertyType: { type: "STRING", description: "Type of property, e.g., Apartment, House, Commercial" }
    }
  }
};

const searchClientsTool: any = {
  name: "searchClients",
  description: "Search for clients in the database based on criteria.",
  parameters: {
    type: "OBJECT",
    properties: {
      city: { type: "STRING", description: "City name, e.g., Batumi, Tbilisi" },
      maxBudget: { type: "NUMBER", description: "Maximum budget in USD" },
      status: { type: "STRING", description: "Client status, e.g., New, Contacted, Qualified, Lost" }
    }
  }
};



export default function AIChat() {
  const { language, token, user, messages, setMessages, clearMessages } = useStore();
  const t = translations[language as keyof typeof translations] || translations.en;
  const currentCountry = user?.country || "Georgia";
  
  const SYSTEM_INSTRUCTION = `
    You are an AI assistant for a Real Estate CRM in ${currentCountry}.
    You help agents manage clients and properties in ${currentCountry}.
    You can extract data from messages to create clients, properties, or deals.
    You can also search for existing properties and clients using the provided tools.
    
    If the user wants to add a client, property, or deal, extract the fields and return a JSON block alongside your text response.
    IMPORTANT: The JSON block must be valid and complete.
    JSON format for client: {"type": "CREATE_CLIENT", "data": {"name": "...", "phone": "...", "budget": 0, "city": "...", "district": "...", "rooms": 0}}
    JSON format for property: {"type": "CREATE_PROPERTY", "data": {"title": "...", "price": 0, "city": "...", "district": "...", "rooms": 0, "area": 0, "address": "...", "property_type": "Apartment"}}
    JSON format for deal: {"type": "CREATE_DEAL", "data": {"lead_id": "...", "property_id": "...", "amount": 0, "status": "lead"}}
    
    IMPORTANT: When creating a deal, the "lead_id" and "property_id" are REQUIRED. You should find them from the search results mentioned earlier in the conversation.
    If there are multiple potential clients or properties and it's not clear which ones to use for the deal, you MUST ask the user for clarification before returning the CREATE_DEAL JSON.
    Example of clarification: "You mentioned two properties in Vake. Which one should we use for the deal with Arsen?"
    
    IMPORTANT: Extract numbers (price, budget, rooms, area, amount) correctly from the message. Do not leave them as 0 if they are mentioned.
    IMPORTANT: The "address" field for properties is MANDATORY. If the user doesn't provide it, DO NOT return a CREATE_PROPERTY JSON. Instead, ask the user for the address.
    IMPORTANT: The "rooms" field for clients is MANDATORY. If the user doesn't provide it, DO NOT return a CREATE_CLIENT JSON. Instead, ask the user for the number of rooms the client is looking for.
    If the user doesn't specify a city, set "city" to null in the JSON.
    Only return a JSON block if you have all required information and are ready to perform the action.
    When returning a JSON block, keep your text response brief and focused on the action being performed.
    If you are not sure about the address or city, ask for clarification instead of guessing.
    Always be professional and helpful. Support English, Russian, and local languages.
    When presenting search results to the user, format them nicely using Markdown lists.
  `;
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<{ code: string, message?: string, retryAfter?: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [retryCountdown, setRetryCountdown] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let timer: any;
    if (retryCountdown !== null && retryCountdown > 0) {
      timer = setTimeout(() => setRetryCountdown(retryCountdown - 1), 1000);
    } else if (retryCountdown === 0) {
      setRetryCountdown(null);
      setError(null);
    }
    return () => clearTimeout(timer);
  }, [retryCountdown]);

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

      if (city === "Tbilisi") {
        const metroRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=subway+station+near+${lat},${lng}&limit=3`, {
          headers: { 'User-Agent': 'VistaRealCRM/1.0' }
        });
        const metroData = await metroRes.json();
        
        if (metroData && metroData.length > 0) {
          const station = metroData[0];
          const mLat = station.lat;
          const mLng = station.lon;
          const mName = station.display_name.split(',')[0].replace("метро ", "").replace("Metro ", "");
          
          const walkRes = await fetch(`https://router.project-osrm.org/route/v1/walking/${lng},${lat};${mLng},${mLat}?overview=false`);
          const walkData = await walkRes.json();
          
          if (walkData.routes && walkData.routes[0]) {
            const route = walkData.routes[0];
            const km = (route.distance / 1000).toFixed(1);
            const mins = Math.round(route.duration / 60);
            
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

  const generateDescription = async (prop: any) => {
    const currentCountry = user?.country || "Georgia";
    try {
      let distanceText = "";
      if (prop.lat && prop.lng) {
        distanceText = await getDistanceInfo(Number(prop.lat), Number(prop.lng), prop.city || (currentCountry === "Armenia" ? "Yerevan" : currentCountry === "Kazakhstan" ? "Astana" : "Tbilisi"));
      }

      const prompt = `
        Generate a professional real estate description for a property in ${user?.country || "Georgia"}.
        Details:
        - Title: ${prop.title}
        - Type: ${prop.property_type || "Apartment"}
        - Price: $${prop.price}
        - City: ${prop.city}
        - District: ${prop.district}
        - Address: ${prop.address}
        - Rooms: ${prop.rooms}
        - Area: ${prop.area} m²
        
        Location Context (IMPORTANT: Include these distances in the description):
        ${distanceText || "No distance data available, focus on general location."}
        
        The description should be attractive for potential buyers/tenants. 
        Write it in ${language === 'en' ? 'English' : language === 'ru' ? 'Russian' : (language === 'ka' ? 'Georgian' : language === 'hy' ? 'Armenian' : 'Kazakh')}.
        Keep it concise but informative (around 2-3 paragraphs).
        Include the distance information naturally in the text.
        Do not include any placeholders.
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

      return data.text?.trim() || "";
    } catch (err) {
      console.error("AI Generation error:", err);
      return "";
    }
  };

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", parts: [{ text: input }] };
    let newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    setError(null);
    try {
      let currentHistory = newMessages.map(m => ({ role: m.role, parts: m.parts }));
      
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          history: currentHistory.slice(0, -1),
          message: input,
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [searchPropertiesTool, searchClientsTool] }]
        })
      });

      let data = await res.json();
      if (res.status === 429) {
        const retrySecs = data.retryAfter ? parseInt(data.retryAfter) : 30;
        setError({ code: "QUOTA_EXCEEDED", retryAfter: retrySecs });
        setRetryCountdown(retrySecs);
        throw new Error(data.error || "AI limit reached");
      }
      if (data.error) throw new Error(data.error);

      while (data.candidates?.[0]?.content?.parts?.some((p: any) => p.functionCall)) {
        const parts = data.candidates[0].content.parts;
        const modelCallMsg: Message = {
          role: "model",
          parts: parts,
          isHidden: true
        };
        newMessages.push(modelCallMsg);
        currentHistory.push({ role: "model", parts: parts });

        const functionResponses = [];
        const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

        for (const call of functionCalls) {
          if (call.name === "searchProperties") {
            const args = call.args as any;
            const apiRes = await fetch("/api/properties", { headers: { Authorization: `Bearer ${token}` } });
            let props = await apiRes.json().catch(() => []);
            if (args.city) props = props.filter((p: any) => p.city?.toLowerCase() === args.city.toLowerCase());
            if (args.maxPrice) props = props.filter((p: any) => p.price <= args.maxPrice);
            if (args.minRooms) props = props.filter((p: any) => p.rooms >= args.minRooms);
            
            functionResponses.push({
              functionResponse: { name: call.name, response: { properties: props.slice(0, 5) } }
            });
          } else if (call.name === "searchClients") {
            const args = call.args as any;
            const apiRes = await fetch("/api/leads", { headers: { Authorization: `Bearer ${token}` } });
            let clients = await apiRes.json().catch(() => []);
            if (args.city) clients = clients.filter((l: any) => l.city?.toLowerCase() === args.city.toLowerCase());
            if (args.maxBudget) clients = clients.filter((l: any) => l.budget <= args.maxBudget);

            functionResponses.push({
              functionResponse: { name: call.name, response: { clients: clients.slice(0, 5) } }
            });
          }
        }

        const userResponseMsg: Message = { role: "user", parts: functionResponses, isHidden: true };
        newMessages.push(userResponseMsg);
        currentHistory.push({ role: "user", parts: functionResponses });

        const nextRes = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            history: currentHistory.slice(0, -1),
            message: functionResponses, // Actually the chat expects the last message as a string or parts
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: [searchPropertiesTool, searchClientsTool] }]
          })
        });
        data = await nextRes.json();
      }

      let aiText = data.text || "";
      let action: any = null;
      
      const jsonStartMatch = aiText.match(/\{\s*"type":\s*"(CREATE_CLIENT|CREATE_PROPERTY|CREATE_DEAL)"/);
      
      if (jsonStartMatch) {
        try {
          // Find the full JSON object by tracking braces
          const startIndex = jsonStartMatch.index!;
          let braceCount = 0;
          let endIndex = -1;
          
          for (let i = startIndex; i < aiText.length; i++) {
            if (aiText[i] === "{") braceCount++;
            else if (aiText[i] === "}") braceCount--;
            
            if (braceCount === 0) {
              endIndex = i + 1;
              break;
            }
          }
          
          if (endIndex !== -1) {
            const jsonStr = aiText.substring(startIndex, endIndex);
            action = JSON.parse(jsonStr);
            aiText = (aiText.substring(0, startIndex) + aiText.substring(endIndex)).trim();
            
            // Normalize numeric fields
            if (action.data) {
              if (action.data.price) action.data.price = Number(action.data.price);
              if (action.data.budget) action.data.budget = Number(action.data.budget);
              if (action.data.rooms) action.data.rooms = Number(action.data.rooms);
              if (action.data.area) action.data.area = Number(action.data.area);
              if (action.data.amount) action.data.amount = Number(action.data.amount);
            }

            // Validate rooms if it's a client
            if (action.type === "CREATE_CLIENT") {
              if (!action.data.rooms || action.data.rooms === 0) {
                aiText = (language === 'ru' ? "К сожалению, я не знаю сколько комнат ищет клиент. Пожалуйста, укажите количество комнат." : 
                          language === 'ka' ? "სამწუხაროდ, მე არ ვიცი რამდენი ოთახია კლიენტი ეძებს. გთხოვთ მიუთითოთ ოთახების რაოდენობა." :
                          "Sorry, I don't know how many rooms the client is looking for. Please provide the number of rooms.");
                action = null;
              }
            }

            // Validate address if it's a property
            if (action.type === "CREATE_PROPERTY") {
              if (!action.data.address) {
                aiText = (language === 'ru' ? "К сожалению, я не смог найти адрес в вашем сообщении. Пожалуйста, укажите точный адрес объекта." : 
                          language === 'ka' ? "სამწუხაროდ, თქვენს შეტყობინებაში მისამართი ვერ ვიპოვე. გთხოვთ, მიუთითოთ ობიექტის ზუსტი მისამართი." :
                          "Sorry, I couldn't find the address in your message. Please provide the exact address of the property.");
                action = null; // Cancel creation
              } else {
                // Geocode address
                try {
                  const countryCodeMap: Record<string, string> = { "Georgia": "ge", "Armenia": "am", "Kazakhstan": "kz" };
                  const currentCountry = user?.country || "Georgia";
                  const currentCode = countryCodeMap[currentCountry] || "ge";
                  
                  const city = action.data.city;
                  const query = `${action.data.address}, ${action.data.district ? action.data.district + ', ' : ''}${city ? city + ', ' : ''}${currentCountry}`;
                  const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=${currentCode}&limit=10&addressdetails=1`, {
                    headers: { 'User-Agent': 'VistaRealCRM/1.0' }
                  });
                  const geoData = await geoRes.json();
                  
                  if (geoData && geoData.length > 0) {
                    if (!city) {
                      // No city specified, check for multiple cities in results
                      const citiesFound = new Set<string>();
                      const cityResults: any[] = [];
                      
                      geoData.forEach((item: any) => {
                        const cityName = item.address.city || item.address.town || item.address.village || item.address.city_district || item.address.municipality || item.address.suburb;
                        if (cityName && !citiesFound.has(cityName)) {
                          citiesFound.add(cityName);
                          cityResults.push({ name: cityName, item });
                        }
                      });

                      if (cityResults.length > 1) {
                        // Multiple cities found, ask for clarification
                        const options = cityResults.map(c => `- ${c.name}, ${action.data.address}`).join('\n');
                        aiText = (language === 'ru' ? `Я нашел этот адрес в нескольких городах. Какой из них вы имели в виду?\n\n${options}` : 
                                  language === 'ka' ? `ეს მისამართი რამდენიმე ქალაქში ვიპოვე. რომელს გულისხმობდით?\n\n${options}` :
                                  `I found this address in multiple cities. Which one did you mean?\n\n${options}`);
                        action = null;
                      } else if (cityResults.length === 1) {
                        // Only one city found, proceed with it
                        const result = cityResults[0].item;
                        action.data.city = cityResults[0].name;
                        action.data.lat = result.lat;
                        action.data.lng = result.lon;
                        const description = await generateDescription(action.data);
                        action.data.description = description;
                      } else {
                        // No clear city found in results
                        aiText = (language === 'ru' ? `Я нашел адрес "${action.data.address}", но не смог определить город. Пожалуйста, уточните город.` : 
                                  language === 'ka' ? `მისამართი "${action.data.address}" ვიპოვე, მაგრამ ქალაქი ვერ დავადგინე. გთხოვთ, დააზუსტოთ ქალაქი.` :
                                  `I found the address "${action.data.address}", but couldn't determine the city. Please specify the city.`);
                        action = null;
                      }
                    } else {
                      // City was specified, use existing filtering logic
                      const cityLower = city.toLowerCase();
                      const filteredResults = geoData.filter((item: any) => 
                        item.display_name.toLowerCase().includes(cityLower) || 
                        (item.address && (item.address.city?.toLowerCase() === cityLower || item.address.town?.toLowerCase() === cityLower))
                      );

                      const result = filteredResults.length > 0 ? filteredResults[0] : geoData[0];
                      
                      if (!result.display_name.toLowerCase().includes(cityLower)) {
                        aiText = (language === 'ru' ? `Адрес найден, но он не в городе ${city}. Пожалуйста, уточните адрес.` : 
                                  language === 'ka' ? `მისამართი მოიძებნა, მაგრამ ის არ არის ქალაქში ${city}. გთხოვთ, დააზუსტოთ მისამართი.` :
                                  `Address found but it doesn't seem to be in ${city}. Please clarify the address.`);
                        action = null;
                      } else {
                        action.data.lat = result.lat;
                        action.data.lng = result.lon;
                        const description = await generateDescription(action.data);
                        action.data.description = description;
                      }
                    }
                  } else {
                    aiText = (language === 'ru' ? `Я не смог найти адрес "${action.data.address}"${city ? ` в городе ${city}` : ''}. Пожалуйста, уточните адрес.` : 
                              language === 'ka' ? `მისამართი "${action.data.address}"${city ? ` ქალაქში ${city}` : ''} ვერ ვიპოვე. გთხოვთ, დააზუსტოთ მისამართი.` :
                              `I couldn't find the address "${action.data.address}"${city ? ` in ${city}` : ''}. Please clarify the address.`);
                    action = null; // Cancel creation
                  }
                } catch (err) {
                  console.error("Geocoding error in AI Chat:", err);
                  action = null;
                }
              }
            }
          }

          if (action) {
            // Execute action
            const endpoint = action.type === "CREATE_CLIENT" ? "/api/leads" : 
                            action.type === "CREATE_PROPERTY" ? "/api/properties" : 
                            "/api/deals";
            const apiRes = await fetch(endpoint, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}` 
              },
              body: JSON.stringify(action.data)
            });

            if (apiRes.status === 401) {
              useStore.getState().logout();
              return;
            }

            if (!apiRes.ok) {
              const errData = await apiRes.json().catch(() => ({}));
              if (apiRes.status === 403 && errData.error === "LIMIT_REACHED") {
                const demoMsg = translations[language as keyof typeof translations]?.demo_limit_reached || errData.message;
                aiText = demoMsg;
                action = null;
              } else {
                console.error("Failed to execute AI action", await apiRes.text());
              }
            } else {
              const createdData = await apiRes.json();
              if (createdData && createdData.id) {
                action.data.id = createdData.id;
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse or execute AI action", e);
        }
      }

      const modelMsg: Message = { 
        role: "model", 
        parts: [{ text: aiText }],
        type: action?.type,
        data: action?.data
      };
      newMessages.push(modelMsg);
      setMessages([...newMessages]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const { setActiveTab, setPendingEntity } = useStore();

  const handleActionClick = (msg: Message) => {
    if (!msg.type) return;
    
    let tab = "";
    let entityType = "";
    
    if (msg.type === "CREATE_CLIENT") {
      tab = "leads";
      entityType = "client";
    } else if (msg.type === "CREATE_PROPERTY") {
      tab = "properties";
      entityType = "property";
    } else if (msg.type === "CREATE_DEAL") {
      tab = "deals";
      entityType = "deal";
    }
    
    if (tab) {
      // Set pending entity if ID exists
      if (msg.data?.id) {
        setPendingEntity({ type: entityType, id: msg.data.id });
      }
      // Always switch tab so user sees something happened
      setActiveTab(tab);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
      <div className="p-4 border-b border-[#E5E7EB] bg-[#F9FAFB] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#10B981] flex items-center justify-center text-white shadow-lg shadow-[#10B981]/20">
            <Bot size={24} />
          </div>
          <div>
            <div className="font-bold text-[#111827]">VistaReal AI</div>
            <div className="flex items-center gap-1.5 text-xs text-[#10B981] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Online
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Clear chat"
            >
              <Trash2 size={20} />
            </button>
          )}
          <button className="p-2 text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-lg transition-all">
            <Sparkles size={20} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-[#10B981] flex items-center justify-center mb-2">
              <Bot size={32} />
            </div>
            <h3 className="text-xl font-bold text-[#111827]">{t.ai_welcome}</h3>
            <p className="text-[#6B7280] text-sm leading-relaxed">
              {language === 'ru' ? 'Я могу помочь добавить клиентов, объекты и проанализировать данные вашей CRM. Просто скажите, что вам нужно!' : 'I can help you add clients, properties, and analyze your CRM data. Just tell me what you need!'}
            </p>
          </div>
        )}

        {messages.filter(m => !m.isHidden).map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              msg.role === "user" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"
            }`}>
              {msg.role === "user" ? <User size={18} /> : <Bot size={18} />}
            </div>
            <div className={`max-w-[80%] space-y-3 ${msg.role === "user" ? "items-end" : ""}`}>
              <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === "user" 
                  ? "bg-[#111827] text-white rounded-tr-none" 
                  : "bg-[#F3F4F6] text-[#111827] rounded-tl-none"
              }`}>
                {msg.role === "user" ? (
                  msg.parts[0].text
                ) : (
                  <div className="prose prose-sm prose-emerald max-w-none">
                    <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
                  </div>
                )}
              </div>

              {msg.type && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => handleActionClick(msg)}
                  whileHover={{ scale: 1.01, backgroundColor: "rgb(240, 253, 244)" }}
                  whileTap={{ scale: 0.98 }}
                  className="p-4 bg-white border border-[#10B981] rounded-2xl shadow-lg shadow-emerald-100/50 flex items-center gap-4 cursor-pointer transition-colors"
                >
                  <div className={`p-3 rounded-xl ${msg.type === "CREATE_CLIENT" ? "bg-blue-50 text-blue-600" : msg.type === "CREATE_DEAL" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                    {msg.type === "CREATE_CLIENT" ? <Users size={20} /> : msg.type === "CREATE_DEAL" ? <Sparkles size={20} /> : <Home size={20} />}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-[#10B981] uppercase tracking-wider mb-0.5">
                      {msg.type === "CREATE_CLIENT" ? (language === 'ru' ? "Клиент создан" : "Client Created") : 
                       msg.type === "CREATE_DEAL" ? (language === 'ru' ? "Сделка создана" : "Deal Created") :
                       (language === 'ru' ? "Объект создан" : "Property Created")}
                    </div>
                    <div className="text-sm font-bold text-[#111827]">
                      {msg.data?.name || msg.data?.title || (language === 'ru' ? `Сумма: $${msg.data?.amount?.toLocaleString()}` : `Amount: $${msg.data?.amount?.toLocaleString()}`)}
                    </div>
                  </div>
                  {msg.data?.city && (
                    <div className="text-xs font-bold text-[#6B7280] bg-[#F3F4F6] px-2 py-1 rounded-lg">
                      {msg.data?.city}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}

        {loading && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <Bot size={18} />
            </div>
            <div className="bg-[#F3F4F6] px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-[#10B981]" />
              <span className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">{t.ai_thinking}</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-[#E5E7EB]">
        {error?.code === "QUOTA_EXCEEDED" && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 shadow-sm"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                <Sparkles size={16} className="text-amber-500" />
                {language === 'ru' ? 'Лимит ИИ исчерпан.' : 'AI limit exceeded.'}
                {retryCountdown !== null && (
                  <span className="text-[#6B7280] font-normal">
                    {language === 'ru' ? `Попробуйте снова через ${retryCountdown}с` : `Retry in ${retryCountdown}s`}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-amber-700 font-medium">
                {language === 'ru' ? 'Используйте свой API ключ для безлимитного доступа.' : 'Use your own API key for unlimited access.'}
              </div>
            </div>
            <button 
              onClick={() => {
                // Agent will explain how to add API key
                console.log("User wants to upgrade AI");
                setError({ code: "UPGRADE_REQUESTED" });
              }}
              className="px-3 py-2 bg-amber-500 text-white rounded-lg text-[10px] font-bold hover:bg-amber-600 transition-colors uppercase tracking-wider shrink-0"
            >
              {language === 'ru' ? 'Улучшить' : 'Upgrade'}
            </button>
          </motion.div>
        )}
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={t.ai_placeholder}
            className="w-full bg-[#F9FAFB] border-[#E5E7EB] rounded-2xl pl-6 pr-14 py-4 text-sm font-medium focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="absolute right-2 p-3 bg-[#10B981] text-white rounded-xl shadow-lg shadow-[#10B981]/20 hover:bg-[#059669] disabled:opacity-50 disabled:shadow-none transition-all"
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
              <h3 className="text-xl font-bold text-[#111827] mb-2">
                {language === 'ru' ? 'Очистить историю?' : 'Clear History?'}
              </h3>
              <p className="text-[#6B7280] mb-8 font-medium">
                {language === 'ru' 
                  ? 'Вы уверены, что хотите удалить все сообщения из этого чата? Это действие нельзя отменить.' 
                  : 'Are you sure you want to delete all messages from this chat? This action cannot be undone.'}
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-6 py-3 border border-[#E5E7EB] text-[#374151] rounded-xl font-bold hover:bg-[#F9FAFB] transition-all"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={() => {
                    clearMessages();
                    setShowDeleteConfirm(false);
                  }}
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
