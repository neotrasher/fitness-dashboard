import { useEffect, useRef } from 'react';
import L from 'leaflet';
import polyline from 'polyline-encoded';

interface Props {
  encodedPolyline: string;
}

export function ActivityMap({ encodedPolyline }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || !encodedPolyline) return;

    // Decodificar el polyline
    const coordinates = polyline.decode(encodedPolyline);
    
    if (coordinates.length === 0) return;

    // Si ya existe un mapa, destruirlo
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    // Crear el mapa
    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    });

    mapInstanceRef.current = map;

    // Agregar tiles (mapa base oscuro)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Crear la línea de la ruta
    const routeLine = L.polyline(coordinates as L.LatLngExpression[], {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.9,
    }).addTo(map);

    // Marcador de inicio (verde)
    const startIcon = L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: #22c55e; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
      iconSize: [12, 12],
    });
    L.marker(coordinates[0] as L.LatLngExpression, { icon: startIcon }).addTo(map);

    // Marcador de fin (rojo)
    const endIcon = L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: #ef4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
      iconSize: [12, 12],
    });
    L.marker(coordinates[coordinates.length - 1] as L.LatLngExpression, { icon: endIcon }).addTo(map);

    // Ajustar vista a la ruta
    map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [encodedPolyline]);

  return (
    <div 
      ref={mapRef} 
      className="h-64 w-full rounded-lg overflow-hidden"
      style={{ background: '#1f2937' }}
    />
  );
}

export default ActivityMap;
