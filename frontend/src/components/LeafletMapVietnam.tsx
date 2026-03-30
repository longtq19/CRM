import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { administrativeTitleCase, matchAdministrativeNameKey } from '../utils/addressDisplayFormat';

interface ProvinceData {
  province: string;
  customer_count: number;
  total_revenue: number;
}

interface LeafletMapVietnamProps {
  data: ProvinceData[];
  maxMarkers?: number;
}

// Tọa độ các tỉnh thành Việt Nam (lat, lng)
const PROVINCE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // Miền Bắc
  'Hà Nội': { lat: 21.0285, lng: 105.8542 },
  'Hải Phòng': { lat: 20.8449, lng: 106.6881 },
  'Quảng Ninh': { lat: 21.0064, lng: 107.2925 },
  'Bắc Giang': { lat: 21.2820, lng: 106.1975 },
  'Bắc Ninh': { lat: 21.1861, lng: 106.0763 },
  'Hà Nam': { lat: 20.5835, lng: 105.9230 },
  'Hải Dương': { lat: 20.9373, lng: 106.3146 },
  'Hưng Yên': { lat: 20.6464, lng: 106.0511 },
  'Nam Định': { lat: 20.4388, lng: 106.1621 },
  'Ninh Bình': { lat: 20.2506, lng: 105.9745 },
  'Phú Thọ': { lat: 21.4225, lng: 105.2297 },
  'Thái Bình': { lat: 20.4463, lng: 106.3365 },
  'Thái Nguyên': { lat: 21.5942, lng: 105.8482 },
  'Vĩnh Phúc': { lat: 21.3609, lng: 105.5474 },
  'Bắc Kạn': { lat: 22.1473, lng: 105.8348 },
  'Cao Bằng': { lat: 22.6666, lng: 106.2640 },
  'Điện Biên': { lat: 21.3860, lng: 103.0230 },
  'Hà Giang': { lat: 22.8233, lng: 104.9836 },
  'Hòa Bình': { lat: 20.8171, lng: 105.3382 },
  'Lai Châu': { lat: 22.3964, lng: 103.4703 },
  'Lạng Sơn': { lat: 21.8537, lng: 106.7615 },
  'Lào Cai': { lat: 22.4856, lng: 103.9707 },
  'Sơn La': { lat: 21.3269, lng: 103.9144 },
  'Tuyên Quang': { lat: 21.8237, lng: 105.2181 },
  'Yên Bái': { lat: 21.7168, lng: 104.8986 },
  
  // Miền Trung
  'Đà Nẵng': { lat: 16.0544, lng: 108.2022 },
  'Thanh Hóa': { lat: 19.8067, lng: 105.7852 },
  'Nghệ An': { lat: 18.6737, lng: 105.6922 },
  'Hà Tĩnh': { lat: 18.3559, lng: 105.8877 },
  'Quảng Bình': { lat: 17.4690, lng: 106.6222 },
  'Quảng Trị': { lat: 16.7943, lng: 107.0914 },
  'Thừa Thiên Huế': { lat: 16.4637, lng: 107.5909 },
  'Quảng Nam': { lat: 15.5394, lng: 108.0191 },
  'Quảng Ngãi': { lat: 15.1214, lng: 108.8044 },
  'Bình Định': { lat: 13.7765, lng: 109.2237 },
  'Phú Yên': { lat: 13.0882, lng: 109.0929 },
  'Khánh Hòa': { lat: 12.2388, lng: 109.1967 },
  'Ninh Thuận': { lat: 11.5752, lng: 108.9829 },
  'Bình Thuận': { lat: 10.9280, lng: 108.1021 },
  
  // Tây Nguyên
  'Đắk Lắk': { lat: 12.7100, lng: 108.2378 },
  'Đắk Nông': { lat: 12.0033, lng: 107.6876 },
  'Gia Lai': { lat: 13.9833, lng: 108.0000 },
  'Kon Tum': { lat: 14.3500, lng: 108.0000 },
  'Lâm Đồng': { lat: 11.9404, lng: 108.4583 },
  
  // Miền Nam
  'TP. Hồ Chí Minh': { lat: 10.8231, lng: 106.6297 },
  'Hồ Chí Minh': { lat: 10.8231, lng: 106.6297 },
  'Cần Thơ': { lat: 10.0452, lng: 105.7469 },
  'An Giang': { lat: 10.5216, lng: 105.1259 },
  'Bà Rịa - Vũng Tàu': { lat: 10.5417, lng: 107.2430 },
  'Bạc Liêu': { lat: 9.2940, lng: 105.7216 },
  'Bến Tre': { lat: 10.2434, lng: 106.3756 },
  'Bình Dương': { lat: 11.1671, lng: 106.6320 },
  'Bình Phước': { lat: 11.7512, lng: 106.7235 },
  'Cà Mau': { lat: 9.1527, lng: 105.1961 },
  'Đồng Nai': { lat: 10.9453, lng: 106.8243 },
  'Đồng Tháp': { lat: 10.4938, lng: 105.6882 },
  'Hậu Giang': { lat: 9.7579, lng: 105.6413 },
  'Kiên Giang': { lat: 10.0125, lng: 105.0809 },
  'Long An': { lat: 10.6956, lng: 106.2431 },
  'Sóc Trăng': { lat: 9.6025, lng: 105.9739 },
  'Tây Ninh': { lat: 11.3352, lng: 106.0980 },
  'Tiền Giang': { lat: 10.4493, lng: 106.3420 },
  'Trà Vinh': { lat: 9.8127, lng: 106.2993 },
  'Vĩnh Long': { lat: 10.2397, lng: 105.9572 }
};

// Custom icon creator
const createCustomIcon = (count: number, maxCount: number, isTop5: boolean) => {
  const size = 28 + (count / maxCount) * 20;
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position: relative; width: ${size}px; height: ${size}px;">
        ${isTop5 ? `<div style="position: absolute; inset: -4px; border-radius: 50%; background: rgba(34, 197, 94, 0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
        <img src="/plainLogo.png" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));" />
        <div style="position: absolute; top: -8px; right: -8px; min-width: 20px; height: 20px; background: #EF4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
          ${count > 99 ? '99+' : count}
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

const formatCurrency = (value: number) => {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} tỷ`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(0)} tr`;
  return value.toLocaleString('vi-VN') + ' đ';
};

// Component to fit bounds
const FitBounds: React.FC<{ markers: { lat: number; lng: number }[] }> = ({ markers }) => {
  const map = useMap();
  
  React.useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [markers, map]);
  
  return null;
};

const LeafletMapVietnam: React.FC<LeafletMapVietnamProps> = ({ data, maxMarkers = 50 }) => {
  const markers = useMemo(() => {
    return data
      .filter((item) => {
        const key = matchAdministrativeNameKey(item.province, PROVINCE_COORDINATES);
        return key ? PROVINCE_COORDINATES[key] && item.customer_count > 0 : false;
      })
      .map((item) => {
        const key = matchAdministrativeNameKey(item.province, PROVINCE_COORDINATES)!;
        return {
          ...item,
          coords: PROVINCE_COORDINATES[key],
          displayProvince: administrativeTitleCase(item.province),
        };
      })
      .sort((a, b) => b.customer_count - a.customer_count)
      .slice(0, maxMarkers);
  }, [data, maxMarkers]);

  const maxCount = useMemo(() => Math.max(...markers.map(m => m.customer_count), 1), [markers]);

  const totalCustomers = useMemo(() => data.reduce((sum, item) => sum + item.customer_count, 0), [data]);
  const totalProvinces = useMemo(() => data.filter(d => d.customer_count > 0).length, [data]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        }
        .leaflet-popup-content {
          margin: 0;
        }
        .custom-marker {
          background: transparent;
          border: none;
        }
      `}</style>
      
      <MapContainer
        center={[16.0, 106.0]}
        zoom={6}
        style={{ width: '100%', height: '100%', minHeight: '400px', borderRadius: '0.5rem' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <FitBounds markers={markers.map(m => m.coords)} />
        
        {markers.map((item, index) => (
          <Marker
            key={item.province}
            position={[item.coords.lat, item.coords.lng]}
            icon={createCustomIcon(item.customer_count, maxCount, index < 5)}
          >
            <Popup>
              <div className="p-3 min-w-[200px]">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                  <img src="/plainLogo.png" alt="" className="w-6 h-6" />
                  <span className="font-bold text-gray-800 text-base">{item.displayProvince}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Số khách hàng:</span>
                    <span className="font-bold text-green-600 text-lg">{item.customer_count}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Doanh thu:</span>
                    <span className="font-bold text-blue-600">{formatCurrency(item.total_revenue)}</span>
                  </div>
                  {index < 5 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        🏆 Top {index + 1} tỉnh/thành
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm z-[1000]">
        <div className="flex items-center gap-2 mb-2">
          <img src="/plainLogo.png" alt="" className="w-5 h-5" />
          <span className="font-semibold text-gray-800">Phân bố khách hàng</span>
        </div>
        <div className="flex flex-col gap-1 text-gray-600 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[8px] font-bold">N</span>
            <span>Số lượng khách hàng</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500/30 animate-pulse"></div>
            <span>Top 5 tỉnh/thành</span>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm z-[1000]">
        <div className="text-gray-500 text-xs mb-1">Tổng quan</div>
        <div className="font-bold text-green-600 text-lg">
          {totalCustomers.toLocaleString()} khách hàng
        </div>
        <div className="text-xs text-gray-500">
          tại {totalProvinces} tỉnh/thành phố
        </div>
      </div>
    </div>
  );
};

export default LeafletMapVietnam;
