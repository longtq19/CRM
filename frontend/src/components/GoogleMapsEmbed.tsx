import React, { useMemo, useState } from 'react';
import { MapPin, Users, TrendingUp, ExternalLink, AlertTriangle } from 'lucide-react';
import { administrativeTitleCase, matchAdministrativeNameKey } from '../utils/addressDisplayFormat';

interface ProvinceData {
  province: string;
  customer_count: number;
  total_revenue: number;
}

interface GoogleMapsEmbedProps {
  data: ProvinceData[];
  apiKey?: string;
  maxMarkers?: number;
}

// Tọa độ trung tâm các tỉnh thành Việt Nam
const PROVINCE_COORDINATES: Record<string, { lat: number; lng: number }> = {
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
  'Đắk Lắk': { lat: 12.7100, lng: 108.2378 },
  'Đắk Nông': { lat: 12.0033, lng: 107.6876 },
  'Gia Lai': { lat: 13.9833, lng: 108.0000 },
  'Kon Tum': { lat: 14.3500, lng: 108.0000 },
  'Lâm Đồng': { lat: 11.9404, lng: 108.4583 },
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

const formatCurrency = (value: number) => {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} tỷ`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(0)} tr`;
  return value.toLocaleString('vi-VN') + ' đ';
};

const GoogleMapsEmbed: React.FC<GoogleMapsEmbedProps> = ({ 
  data, 
  apiKey = '', 
  maxMarkers = 50 
}) => {
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);

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

  const totalCustomers = useMemo(() => data.reduce((sum, item) => sum + item.customer_count, 0), [data]);
  const totalProvinces = useMemo(() => data.filter(d => d.customer_count > 0).length, [data]);
  const totalRevenue = useMemo(() => data.reduce((sum, item) => sum + item.total_revenue, 0), [data]);

  const top5 = markers.slice(0, 5);

  // Google Maps Embed URL với region=VN để hiển thị đúng chủ quyền Việt Nam
  const mapUrl = useMemo(() => {
    if (!apiKey) return null;
    
    // Sử dụng chế độ view với center ở Việt Nam
    const baseUrl = 'https://www.google.com/maps/embed/v1/view';
    const params = new URLSearchParams({
      key: apiKey,
      center: '16.0,106.0', // Trung tâm Việt Nam
      zoom: '6',
      maptype: 'roadmap',
      language: 'vi',
      region: 'VN' // Quan trọng: Hiển thị đường viền theo quan điểm Việt Nam
    });
    
    return `${baseUrl}?${params.toString()}`;
  }, [apiKey]);

  // Nếu không có API key, hiển thị bản đồ tĩnh với thống kê
  if (!apiKey) {
    return (
      <div className="relative w-full h-full min-h-[500px] bg-gradient-to-br from-blue-50 via-cyan-50 to-green-50 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-b border-gray-200 p-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <MapPin className="text-green-600" size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Phân bố khách hàng Việt Nam</h3>
                <p className="text-sm text-gray-500">Dữ liệu theo tỉnh/thành phố</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertTriangle size={16} />
              <span>Cần API Key để hiển thị Google Maps</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="pt-24 px-4 pb-4 h-full overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Users size={18} />
                <span className="text-sm font-medium">Tổng khách hàng</span>
              </div>
              <div className="text-2xl font-bold text-gray-800">{totalCustomers.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <MapPin size={18} />
                <span className="text-sm font-medium">Số tỉnh/thành</span>
              </div>
              <div className="text-2xl font-bold text-gray-800">{totalProvinces}</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <TrendingUp size={18} />
                <span className="text-sm font-medium">Tổng doanh thu</span>
              </div>
              <div className="text-xl font-bold text-gray-800">{formatCurrency(totalRevenue)}</div>
            </div>
          </div>

          {/* Top 5 Provinces */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              🏆 Top 5 tỉnh/thành phố
            </h4>
            <div className="space-y-3">
              {top5.map((item, index) => (
                <div 
                  key={item.province}
                  className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedProvince(selectedProvince === item.province ? null : item.province)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                      index === 0 ? 'bg-yellow-500' : 
                      index === 1 ? 'bg-gray-400' : 
                      index === 2 ? 'bg-amber-600' : 'bg-blue-500'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">{item.displayProvince}</div>
                      <div className="text-xs text-gray-500">
                        {item.coords.lat.toFixed(4)}°N, {item.coords.lng.toFixed(4)}°E
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">{item.customer_count} KH</div>
                    <div className="text-xs text-blue-600">{formatCurrency(item.total_revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* All Provinces List */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h4 className="font-semibold text-gray-800 mb-3">Tất cả tỉnh/thành ({markers.length})</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {markers.slice(5).map((item) => (
                <div 
                  key={item.province}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                >
                  <span className="text-gray-700 truncate">{item.province}</span>
                  <span className="font-medium text-green-600 ml-2">{item.customer_count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sovereignty Note */}
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
            <span className="text-2xl">🇻🇳</span>
            <div>
              <div className="font-semibold text-green-800">Chủ quyền Việt Nam</div>
              <div className="text-sm text-green-700">Hoàng Sa và Trường Sa là của Việt Nam</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Với API key, hiển thị Google Maps Embed
  return (
    <div className="relative w-full h-full min-h-[500px] rounded-xl overflow-hidden">
      {/* Google Maps iframe */}
      <iframe
        width="100%"
        height="100%"
        style={{ border: 0, minHeight: '500px' }}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        src={mapUrl || ''}
        title="Google Maps Việt Nam"
      />

      {/* Overlay Stats */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm z-10">
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

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm z-10">
        <div className="flex items-center gap-2 mb-2">
          <img src="/plainLogo.png" alt="" className="w-5 h-5" />
          <span className="font-semibold text-gray-800">Kagri Bio CRM</span>
        </div>
        <div className="text-xs text-gray-600">
          Bản đồ Google Maps (region=VN)
        </div>
      </div>

      {/* Top Provinces Panel */}
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm z-10 max-w-[200px]">
        <div className="font-semibold text-gray-800 mb-2">🏆 Top 5 tỉnh/thành</div>
        <div className="space-y-1.5">
          {top5.map((item, index) => (
            <div key={item.province} className="flex items-center justify-between text-xs">
              <span className="text-gray-700 truncate">{index + 1}. {item.displayProvince}</span>
              <span className="font-medium text-green-600 ml-2">{item.customer_count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sovereignty Badge */}
      <div className="absolute bottom-4 right-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800 z-10">
        <div className="font-semibold">🇻🇳 Chủ quyền Việt Nam</div>
        <div>Hoàng Sa & Trường Sa</div>
      </div>
    </div>
  );
};

export default GoogleMapsEmbed;
