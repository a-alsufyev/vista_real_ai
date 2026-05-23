import React from "react";
import { Map, Placemark } from "@pbe/react-yandex-maps";
import { useStore } from "../store";

interface Property {
  id: number;
  title: string;
  price: number;
  lat: number;
  lng: number;
  city: string;
  district: string;
  address: string;
}

interface PropertyMapProps {
  properties: Property[];
}

export default function PropertyMap({ properties }: PropertyMapProps) {
  const { user } = useStore();
  
  // Default centers for countries
  const countryCenters: Record<string, number[]> = {
    "Georgia": [41.7151, 44.8271], // Tbilisi
    "Armenia": [40.1776, 44.5126], // Yerevan
    "Kazakhstan": [51.1283, 71.4305] // Astana
  };

  const defaultCenter = countryCenters[user?.country || "Georgia"] || [41.7151, 44.8271];
  
  // Find first valid coordinate to center on
  const firstValid = properties.find(p => {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
  });
  
  const center = firstValid ? [Number(firstValid.lat), Number(firstValid.lng)] : defaultCenter;

  // Group properties by coordinates
  const groupedProperties = properties.reduce((acc, prop) => {
    const lat = Number(prop.lat);
    const lng = Number(prop.lng);
    if (!lat || !lng) return acc;
    
    const key = `${lat},${lng}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(prop);
    return acc;
  }, {} as Record<string, Property[]>);

  return (
    <div className="w-full h-[600px] rounded-2xl overflow-hidden border border-[#E5E7EB] shadow-sm">
      <Map 
        key={center.join(',')}
        defaultState={{ center, zoom: 12 }} 
        width="100%" 
        height="100%"
      >
        {Object.entries(groupedProperties).map(([coords, props]) => {
          const [lat, lng] = coords.split(',').map(Number);
          const isMultiple = props.length > 1;
          const mainProp = props[0];
          
          const balloonContentBody = isMultiple 
            ? `
              <div style="font-family: sans-serif; padding: 5px; max-height: 200px; overflow-y: auto;">
                <p style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px;">
                  ${props.length} objects at this address
                </p>
                ${props.map(p => `
                  <div style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #F3F4F6;">
                    <p style="font-weight: bold; font-size: 14px; margin-bottom: 2px;">${p.title}</p>
                    <p style="font-weight: bold; color: #10B981; font-size: 14px; margin-bottom: 2px;">$${p.price?.toLocaleString()}</p>
                    <p style="font-size: 11px; color: #6B7280;">${p.district || p.city}</p>
                  </div>
                `).join('')}
              </div>
            `
            : `
              <div style="font-family: sans-serif; padding: 5px;">
                <p style="font-weight: bold; color: #10B981; font-size: 16px; margin-bottom: 4px;">$${mainProp.price?.toLocaleString()}</p>
                <p style="font-size: 12px; color: #6B7280; margin-bottom: 2px;">${mainProp.city}${mainProp.district ? ', ' + mainProp.district : ''}</p>
                <p style="font-size: 12px; color: #374151;">${mainProp.address || ''}</p>
              </div>
            `;

          return (
            <Placemark
              key={coords}
              geometry={[lat, lng]}
              properties={{
                balloonContentHeader: isMultiple ? "Multiple Objects" : mainProp.title,
                balloonContentBody: balloonContentBody,
                hintContent: isMultiple ? `${props.length} objects` : mainProp.title,
                iconContent: isMultiple ? props.length.toString() : undefined,
              }}
              options={{
                preset: isMultiple ? "islands#greenStretchyIcon" : "islands#greenDotIcon",
              }}
              modules={["geoObject.addon.balloon", "geoObject.addon.hint"]}
            />
          );
        })}
      </Map>
    </div>
  );
}
