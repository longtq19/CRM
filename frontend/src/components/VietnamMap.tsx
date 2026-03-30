import React, { useMemo } from 'react';
import { administrativeTitleCase, matchAdministrativeNameKey } from '../utils/addressDisplayFormat';

// Tọa độ các tỉnh thành Việt Nam (đã chuẩn hóa cho SVG viewBox 0-100)
const PROVINCE_COORDINATES: Record<string, { x: number; y: number; region: string }> = {
  // Miền Bắc
  'Hà Nội': { x: 48, y: 22, region: 'north' },
  'Hải Phòng': { x: 54, y: 23, region: 'north' },
  'Quảng Ninh': { x: 58, y: 20, region: 'north' },
  'Bắc Giang': { x: 52, y: 19, region: 'north' },
  'Bắc Ninh': { x: 50, y: 21, region: 'north' },
  'Hà Nam': { x: 47, y: 24, region: 'north' },
  'Hải Dương': { x: 52, y: 22, region: 'north' },
  'Hưng Yên': { x: 50, y: 23, region: 'north' },
  'Nam Định': { x: 49, y: 25, region: 'north' },
  'Ninh Bình': { x: 47, y: 26, region: 'north' },
  'Phú Thọ': { x: 44, y: 19, region: 'north' },
  'Thái Bình': { x: 52, y: 24, region: 'north' },
  'Thái Nguyên': { x: 48, y: 17, region: 'north' },
  'Vĩnh Phúc': { x: 46, y: 20, region: 'north' },
  'Bắc Kạn': { x: 48, y: 14, region: 'north' },
  'Cao Bằng': { x: 52, y: 12, region: 'north' },
  'Điện Biên': { x: 32, y: 14, region: 'north' },
  'Hà Giang': { x: 44, y: 10, region: 'north' },
  'Hòa Bình': { x: 43, y: 22, region: 'north' },
  'Lai Châu': { x: 34, y: 12, region: 'north' },
  'Lạng Sơn': { x: 54, y: 15, region: 'north' },
  'Lào Cai': { x: 38, y: 12, region: 'north' },
  'Sơn La': { x: 36, y: 17, region: 'north' },
  'Tuyên Quang': { x: 44, y: 15, region: 'north' },
  'Yên Bái': { x: 40, y: 15, region: 'north' },
  
  // Miền Trung
  'Đà Nẵng': { x: 52, y: 42, region: 'central' },
  'Thanh Hóa': { x: 44, y: 28, region: 'central' },
  'Nghệ An': { x: 44, y: 31, region: 'central' },
  'Hà Tĩnh': { x: 46, y: 34, region: 'central' },
  'Quảng Bình': { x: 48, y: 36, region: 'central' },
  'Quảng Trị': { x: 50, y: 38, region: 'central' },
  'Thừa Thiên Huế': { x: 51, y: 40, region: 'central' },
  'Quảng Nam': { x: 52, y: 44, region: 'central' },
  'Quảng Ngãi': { x: 54, y: 46, region: 'central' },
  'Bình Định': { x: 56, y: 48, region: 'central' },
  'Phú Yên': { x: 58, y: 50, region: 'central' },
  'Khánh Hòa': { x: 60, y: 53, region: 'central' },
  'Ninh Thuận': { x: 60, y: 56, region: 'central' },
  'Bình Thuận': { x: 58, y: 59, region: 'central' },
  
  // Tây Nguyên
  'Đắk Lắk': { x: 54, y: 54, region: 'highland' },
  'Đắk Nông': { x: 52, y: 56, region: 'highland' },
  'Gia Lai': { x: 54, y: 50, region: 'highland' },
  'Kon Tum': { x: 52, y: 47, region: 'highland' },
  'Lâm Đồng': { x: 54, y: 58, region: 'highland' },
  
  // Miền Nam
  'TP. Hồ Chí Minh': { x: 52, y: 66, region: 'south' },
  'Cần Thơ': { x: 46, y: 72, region: 'south' },
  'An Giang': { x: 42, y: 70, region: 'south' },
  'Bà Rịa - Vũng Tàu': { x: 56, y: 66, region: 'south' },
  'Bạc Liêu': { x: 46, y: 76, region: 'south' },
  'Bến Tre': { x: 50, y: 70, region: 'south' },
  'Bình Dương': { x: 52, y: 64, region: 'south' },
  'Bình Phước': { x: 52, y: 60, region: 'south' },
  'Cà Mau': { x: 44, y: 80, region: 'south' },
  'Đồng Nai': { x: 54, y: 64, region: 'south' },
  'Đồng Tháp': { x: 46, y: 70, region: 'south' },
  'Hậu Giang': { x: 46, y: 74, region: 'south' },
  'Kiên Giang': { x: 40, y: 74, region: 'south' },
  'Long An': { x: 48, y: 68, region: 'south' },
  'Sóc Trăng': { x: 48, y: 76, region: 'south' },
  'Tây Ninh': { x: 48, y: 62, region: 'south' },
  'Tiền Giang': { x: 50, y: 70, region: 'south' },
  'Trà Vinh': { x: 50, y: 74, region: 'south' },
  'Vĩnh Long': { x: 48, y: 72, region: 'south' }
};

interface ProvinceData {
  province: string;
  customer_count: number;
  total_revenue: number;
}

interface VietnamMapProps {
  data: ProvinceData[];
  maxMarkers?: number;
}

const VietnamMap: React.FC<VietnamMapProps> = ({ data, maxMarkers = 50 }) => {
  const markers = useMemo(() => {
    const result: { x: number; y: number; count: number; province: string; displayProvince: string; revenue: number }[] = [];
    
    data.forEach((item) => {
      const key = matchAdministrativeNameKey(item.province, PROVINCE_COORDINATES);
      const coords = key ? PROVINCE_COORDINATES[key] : undefined;
      if (coords && item.customer_count > 0) {
        result.push({
          x: coords.x,
          y: coords.y,
          count: Number(item.customer_count),
          province: item.province,
          displayProvince: administrativeTitleCase(item.province),
          revenue: Number(item.total_revenue)
        });
      }
    });
    
    return result.sort((a, b) => b.count - a.count).slice(0, maxMarkers);
  }, [data, maxMarkers]);

  const maxCount = Math.max(...markers.map(m => m.count), 1);

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} tỷ`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(0)} tr`;
    return value.toLocaleString('vi-VN');
  };

  return (
    <div className="relative w-full" style={{ aspectRatio: '3/4' }}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        style={{ background: 'linear-gradient(180deg, #E0F2FE 0%, #DBEAFE 100%)' }}
      >
        {/* Vietnam outline - simplified */}
        <path
          d="M44 8 L52 6 L58 10 L60 16 L56 20 L58 24 L54 28 L50 26 L46 28 L44 32 L46 36 L50 38 L52 42 L54 46 L58 50 L62 54 L64 58 L60 62 L56 66 L52 70 L48 74 L44 78 L40 82 L36 78 L38 74 L42 70 L40 66 L44 62 L48 58 L46 54 L50 50 L48 46 L44 42 L42 38 L44 34 L42 30 L38 26 L36 22 L38 18 L42 14 L44 8"
          fill="#86EFAC"
          stroke="#22C55E"
          strokeWidth="0.5"
          opacity="0.6"
        />
        
        {/* Sea */}
        <text x="75" y="40" fontSize="3" fill="#60A5FA" opacity="0.6">Biển Đông</text>
        
        {/* Region labels */}
        <text x="45" y="15" fontSize="2.5" fill="#DC2626" fontWeight="bold" opacity="0.7">Miền Bắc</text>
        <text x="48" y="38" fontSize="2.5" fill="#2563EB" fontWeight="bold" opacity="0.7">Miền Trung</text>
        <text x="50" y="52" fontSize="2.5" fill="#7C3AED" fontWeight="bold" opacity="0.7">Tây Nguyên</text>
        <text x="42" y="68" fontSize="2.5" fill="#059669" fontWeight="bold" opacity="0.7">Miền Nam</text>
        
        {/* Markers */}
        {markers.map((marker, index) => {
          const size = 2 + (marker.count / maxCount) * 3;
          return (
            <g key={index} className="cursor-pointer group">
              {/* Pulse animation for top provinces */}
              {index < 5 && (
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={size + 1}
                  fill="#22C55E"
                  opacity="0.3"
                  className="animate-ping"
                />
              )}
              
              {/* Logo marker */}
              <image
                href="/plainLogo.png"
                x={marker.x - size}
                y={marker.y - size}
                width={size * 2}
                height={size * 2}
                className="drop-shadow-md"
              />
              
              {/* Count badge */}
              <circle
                cx={marker.x + size * 0.7}
                cy={marker.y - size * 0.7}
                r={1.5}
                fill="#EF4444"
              />
              <text
                x={marker.x + size * 0.7}
                y={marker.y - size * 0.7 + 0.5}
                fontSize="1.2"
                fill="white"
                textAnchor="middle"
                fontWeight="bold"
              >
                {marker.count > 99 ? '99+' : marker.count}
              </text>
              
              {/* Tooltip */}
              <g className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ pointerEvents: 'none' }}>
                <rect
                  x={marker.x - 12}
                  y={marker.y + size + 1}
                  width="24"
                  height="8"
                  rx="1"
                  fill="white"
                  stroke="#E5E7EB"
                  strokeWidth="0.3"
                />
                <text
                  x={marker.x}
                  y={marker.y + size + 4}
                  fontSize="1.8"
                  fill="#1F2937"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {marker.displayProvince}
                </text>
                <text
                  x={marker.x}
                  y={marker.y + size + 7}
                  fontSize="1.4"
                  fill="#059669"
                  textAnchor="middle"
                >
                  {marker.count} KH • {formatCurrency(marker.revenue)}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      
      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-white/90 rounded-lg p-2 text-xs shadow">
        <div className="flex items-center gap-1 mb-1">
          <img src="/plainLogo.png" alt="" className="w-4 h-4" />
          <span className="font-medium">Vị trí khách hàng</span>
        </div>
        <div className="flex gap-2 text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            Số KH
          </span>
        </div>
      </div>
    </div>
  );
};

export default VietnamMap;
