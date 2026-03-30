import React, { useState, useMemo } from 'react';
import { MapPin, Users, TrendingUp } from 'lucide-react';
import { administrativeTitleCase, matchAdministrativeNameKey } from '../utils/addressDisplayFormat';

interface ProvinceData {
  province: string;
  customer_count: number;
  total_revenue: number;
}

interface VietnamMapSVGProps {
  data: ProvinceData[];
  maxMarkers?: number;
}

// Tọa độ SVG cho các tỉnh thành (đã scale cho viewBox 0 0 400 600)
const PROVINCE_POSITIONS: Record<string, { x: number; y: number }> = {
  // Miền Bắc
  'Hà Nội': { x: 195, y: 115 },
  'Hải Phòng': { x: 220, y: 125 },
  'Quảng Ninh': { x: 245, y: 100 },
  'Bắc Giang': { x: 215, y: 100 },
  'Bắc Ninh': { x: 205, y: 108 },
  'Hà Nam': { x: 190, y: 130 },
  'Hải Dương': { x: 210, y: 118 },
  'Hưng Yên': { x: 200, y: 122 },
  'Nam Định': { x: 195, y: 140 },
  'Ninh Bình': { x: 185, y: 145 },
  'Phú Thọ': { x: 170, y: 95 },
  'Thái Bình': { x: 210, y: 135 },
  'Thái Nguyên': { x: 195, y: 85 },
  'Vĩnh Phúc': { x: 185, y: 100 },
  'Bắc Kạn': { x: 195, y: 65 },
  'Cao Bằng': { x: 220, y: 50 },
  'Điện Biên': { x: 105, y: 75 },
  'Hà Giang': { x: 170, y: 40 },
  'Hòa Bình': { x: 165, y: 115 },
  'Lai Châu': { x: 115, y: 55 },
  'Lạng Sơn': { x: 230, y: 70 },
  'Lào Cai': { x: 140, y: 50 },
  'Sơn La': { x: 130, y: 95 },
  'Tuyên Quang': { x: 170, y: 70 },
  'Yên Bái': { x: 150, y: 70 },
  
  // Miền Trung
  'Đà Nẵng': { x: 230, y: 290 },
  'Thanh Hóa': { x: 180, y: 165 },
  'Nghệ An': { x: 175, y: 195 },
  'Hà Tĩnh': { x: 185, y: 220 },
  'Quảng Bình': { x: 200, y: 245 },
  'Quảng Trị': { x: 210, y: 265 },
  'Thừa Thiên Huế': { x: 220, y: 275 },
  'Quảng Nam': { x: 225, y: 305 },
  'Quảng Ngãi': { x: 235, y: 325 },
  'Bình Định': { x: 250, y: 350 },
  'Phú Yên': { x: 260, y: 370 },
  'Khánh Hòa': { x: 270, y: 395 },
  'Ninh Thuận': { x: 265, y: 420 },
  'Bình Thuận': { x: 250, y: 445 },
  
  // Tây Nguyên
  'Đắk Lắk': { x: 240, y: 385 },
  'Đắk Nông': { x: 225, y: 410 },
  'Gia Lai': { x: 235, y: 355 },
  'Kon Tum': { x: 220, y: 330 },
  'Lâm Đồng': { x: 230, y: 430 },
  
  // Miền Nam
  'TP. Hồ Chí Minh': { x: 200, y: 480 },
  'Hồ Chí Minh': { x: 200, y: 480 },
  'Cần Thơ': { x: 165, y: 520 },
  'An Giang': { x: 145, y: 505 },
  'Bà Rịa - Vũng Tàu': { x: 230, y: 485 },
  'Bạc Liêu': { x: 160, y: 550 },
  'Bến Tre': { x: 190, y: 510 },
  'Bình Dương': { x: 200, y: 465 },
  'Bình Phước': { x: 210, y: 445 },
  'Cà Mau': { x: 145, y: 570 },
  'Đồng Nai': { x: 220, y: 470 },
  'Đồng Tháp': { x: 160, y: 505 },
  'Hậu Giang': { x: 165, y: 535 },
  'Kiên Giang': { x: 130, y: 520 },
  'Long An': { x: 175, y: 490 },
  'Sóc Trăng': { x: 175, y: 545 },
  'Tây Ninh': { x: 185, y: 455 },
  'Tiền Giang': { x: 180, y: 505 },
  'Trà Vinh': { x: 190, y: 530 },
  'Vĩnh Long': { x: 175, y: 520 }
};

const formatCurrency = (value: number) => {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} tỷ`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(0)} tr`;
  return value.toLocaleString('vi-VN') + ' đ';
};

const VietnamMapSVG: React.FC<VietnamMapSVGProps> = ({ data, maxMarkers = 50 }) => {
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const markers = useMemo(() => {
    return data
      .filter((item) => {
        const key = matchAdministrativeNameKey(item.province, PROVINCE_POSITIONS);
        return key ? PROVINCE_POSITIONS[key] && item.customer_count > 0 : false;
      })
      .map((item) => {
        const key = matchAdministrativeNameKey(item.province, PROVINCE_POSITIONS)!;
        return {
          ...item,
          pos: PROVINCE_POSITIONS[key],
          displayProvince: administrativeTitleCase(item.province),
        };
      })
      .sort((a, b) => b.customer_count - a.customer_count)
      .slice(0, maxMarkers);
  }, [data, maxMarkers]);

  const maxCount = useMemo(() => Math.max(...markers.map(m => m.customer_count), 1), [markers]);
  const totalCustomers = useMemo(() => data.reduce((sum, item) => sum + item.customer_count, 0), [data]);
  const totalProvinces = useMemo(() => data.filter(d => d.customer_count > 0).length, [data]);

  const hoveredData = useMemo(() => {
    if (!hoveredProvince) return null;
    return markers.find(m => m.province === hoveredProvince);
  }, [hoveredProvince, markers]);

  const handleMouseMove = (e: React.MouseEvent, province: string) => {
    const rect = e.currentTarget.closest('svg')?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
    setHoveredProvince(province);
  };

  return (
    <div className="relative w-full h-full min-h-[500px] bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-30">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#94a3b8" strokeWidth="0.5" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <svg viewBox="0 0 400 620" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Vietnam outline - simplified */}
        <defs>
          <linearGradient id="landGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#dcfce7" />
            <stop offset="100%" stopColor="#bbf7d0" />
          </linearGradient>
          <linearGradient id="seaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#bae6fd" />
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.2" />
          </filter>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sea background */}
        <rect x="0" y="0" width="400" height="620" fill="url(#seaGradient)" />

        {/* Vietnam mainland - simplified path */}
        <path
          d="M 170 30 
             C 200 25, 230 40, 250 60
             L 260 80 L 250 100 L 240 120
             L 230 140 L 220 150 L 215 160
             L 200 180 L 190 200 L 195 220
             L 210 240 L 225 260 L 235 280
             L 245 300 L 255 320 L 265 340
             L 275 360 L 280 380 L 275 400
             L 265 420 L 250 440 L 230 460
             L 215 475 L 235 480 L 245 490
             L 235 500 L 220 510 L 200 520
             L 180 530 L 160 540 L 145 555
             L 130 570 L 140 580 L 155 575
             L 175 560 L 190 545 L 200 530
             L 185 525 L 170 515 L 155 505
             L 140 495 L 125 505 L 115 520
             L 105 510 L 120 490 L 140 475
             L 160 465 L 175 455 L 165 440
             L 150 430 L 140 415 L 135 395
             L 145 375 L 155 355 L 150 335
             L 140 315 L 130 295 L 120 275
             L 110 255 L 100 235 L 95 215
             L 100 195 L 110 175 L 125 155
             L 140 135 L 150 115 L 145 95
             L 130 80 L 115 65 L 105 50
             L 120 40 L 140 35 L 160 30 Z"
          fill="url(#landGradient)"
          stroke="#16a34a"
          strokeWidth="2"
          filter="url(#shadow)"
        />

        {/* Hoàng Sa (Paracel Islands) - Chủ quyền Việt Nam */}
        <g className="animate-pulse">
          <circle cx="310" cy="280" r="8" fill="#22c55e" opacity="0.3" />
          <circle cx="310" cy="280" r="4" fill="#22c55e" />
          <text x="310" y="300" textAnchor="middle" fontSize="8" fill="#166534" fontWeight="bold">Hoàng Sa</text>
          <text x="310" y="310" textAnchor="middle" fontSize="6" fill="#166534">(Việt Nam)</text>
        </g>

        {/* Trường Sa (Spratly Islands) - Chủ quyền Việt Nam */}
        <g className="animate-pulse">
          <circle cx="340" cy="450" r="8" fill="#22c55e" opacity="0.3" />
          <circle cx="340" cy="450" r="4" fill="#22c55e" />
          <text x="340" y="470" textAnchor="middle" fontSize="8" fill="#166534" fontWeight="bold">Trường Sa</text>
          <text x="340" y="480" textAnchor="middle" fontSize="6" fill="#166534">(Việt Nam)</text>
        </g>

        {/* Province markers */}
        {markers.map((item, index) => {
          const isTop5 = index < 5;
          const size = 8 + (item.customer_count / maxCount) * 8;
          
          return (
            <g
              key={item.province}
              onMouseMove={(e) => handleMouseMove(e, item.province)}
              onMouseLeave={() => setHoveredProvince(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Pulse animation for top 5 */}
              {isTop5 && (
                <circle
                  cx={item.pos.x}
                  cy={item.pos.y}
                  r={size + 6}
                  fill="#22c55e"
                  opacity="0.3"
                  className="animate-ping"
                />
              )}
              
              {/* Marker background */}
              <circle
                cx={item.pos.x}
                cy={item.pos.y}
                r={size + 2}
                fill={isTop5 ? '#22c55e' : '#3b82f6'}
                opacity="0.2"
              />
              
              {/* Logo circle */}
              <circle
                cx={item.pos.x}
                cy={item.pos.y}
                r={size}
                fill="white"
                stroke={isTop5 ? '#22c55e' : '#3b82f6'}
                strokeWidth="2"
                filter={hoveredProvince === item.province ? 'url(#glow)' : undefined}
              />
              
              {/* Logo image */}
              <image
                href="/plainLogo.png"
                x={item.pos.x - size * 0.6}
                y={item.pos.y - size * 0.6}
                width={size * 1.2}
                height={size * 1.2}
              />
              
              {/* Count badge */}
              <circle
                cx={item.pos.x + size * 0.7}
                cy={item.pos.y - size * 0.7}
                r="8"
                fill="#ef4444"
                stroke="white"
                strokeWidth="1.5"
              />
              <text
                x={item.pos.x + size * 0.7}
                y={item.pos.y - size * 0.7 + 3}
                textAnchor="middle"
                fontSize="7"
                fill="white"
                fontWeight="bold"
              >
                {item.customer_count > 99 ? '99+' : item.customer_count}
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {hoveredData && (
          <g transform={`translate(${Math.min(tooltipPos.x + 10, 280)}, ${Math.min(tooltipPos.y - 10, 550)})`}>
            <rect
              x="0"
              y="0"
              width="120"
              height="70"
              rx="8"
              fill="white"
              stroke="#e5e7eb"
              strokeWidth="1"
              filter="url(#shadow)"
            />
            <text x="10" y="18" fontSize="11" fontWeight="bold" fill="#1f2937">
              {hoveredData.displayProvince}
            </text>
            <line x1="10" y1="25" x2="110" y2="25" stroke="#e5e7eb" strokeWidth="1" />
            <text x="10" y="40" fontSize="9" fill="#6b7280">Khách hàng:</text>
            <text x="110" y="40" fontSize="10" fontWeight="bold" fill="#16a34a" textAnchor="end">
              {hoveredData.customer_count}
            </text>
            <text x="10" y="55" fontSize="9" fill="#6b7280">Doanh thu:</text>
            <text x="110" y="55" fontSize="9" fontWeight="bold" fill="#2563eb" textAnchor="end">
              {formatCurrency(hoveredData.total_revenue)}
            </text>
          </g>
        )}

        {/* Title */}
        <text x="200" y="20" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1f2937">
          BẢN ĐỒ VIỆT NAM
        </text>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm">
        <div className="flex items-center gap-2 mb-2">
          <img src="/plainLogo.png" alt="" className="w-5 h-5" />
          <span className="font-semibold text-gray-800">Phân bố khách hàng</span>
        </div>
        <div className="flex flex-col gap-1.5 text-gray-600 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[8px] font-bold">N</span>
            <span>Số lượng khách hàng</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-300"></div>
            <span>Top 5 tỉnh/thành</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-blue-300"></div>
            <span>Các tỉnh khác</span>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm">
        <div className="text-gray-500 text-xs mb-1">Tổng quan</div>
        <div className="font-bold text-green-600 text-lg flex items-center gap-1">
          <Users size={16} />
          {totalCustomers.toLocaleString()} khách hàng
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <MapPin size={12} />
          tại {totalProvinces} tỉnh/thành phố
        </div>
      </div>

      {/* Sovereignty note */}
      <div className="absolute bottom-4 right-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
        <div className="font-semibold">🇻🇳 Chủ quyền Việt Nam</div>
        <div>Hoàng Sa & Trường Sa</div>
      </div>
    </div>
  );
};

export default VietnamMapSVG;
