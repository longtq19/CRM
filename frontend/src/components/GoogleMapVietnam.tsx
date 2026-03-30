import React, { useEffect, useRef, useState, useMemo } from 'react';
import { administrativeTitleCase, matchAdministrativeNameKey } from '../utils/addressDisplayFormat';

interface ProvinceData {
  province: string;
  customer_count: number;
  total_revenue: number;
}

interface GoogleMapVietnamProps {
  data: ProvinceData[];
  maxMarkers?: number;
}

// Tọa độ các tỉnh thành Việt Nam
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

const formatCurrency = (value: number) => {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} tỷ`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(0)} tr`;
  return value.toLocaleString('vi-VN') + ' đ';
};

declare global {
  interface Window {
    google: any;
    initGoogleMap: () => void;
  }
}

const GoogleMapVietnam: React.FC<GoogleMapVietnamProps> = ({ data, maxMarkers = 50 }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);

  const markers = useMemo(() => {
    return data
      .filter(item => {
        const coords = PROVINCE_COORDINATES[item.province];
        return coords && item.customer_count > 0;
      })
      .map(item => ({
        ...item,
        coords: PROVINCE_COORDINATES[item.province]
      }))
      .sort((a, b) => b.customer_count - a.customer_count)
      .slice(0, maxMarkers);
  }, [data, maxMarkers]);

  const maxCount = useMemo(() => Math.max(...markers.map(m => m.customer_count), 1), [markers]);
  const totalCustomers = useMemo(() => data.reduce((sum, item) => sum + item.customer_count, 0), [data]);
  const totalProvinces = useMemo(() => data.filter(d => d.customer_count > 0).length, [data]);

  // Load Google Maps script
  useEffect(() => {
    if (window.google && window.google.maps) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=&region=VN&language=vi&callback=initGoogleMap`;
    script.async = true;
    script.defer = true;

    window.initGoogleMap = () => {
      setIsLoaded(true);
    };

    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || map) return;

    const googleMap = new window.google.maps.Map(mapRef.current, {
      center: { lat: 16.0, lng: 106.0 },
      zoom: 6,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        {
          featureType: 'administrative.country',
          elementType: 'geometry.stroke',
          stylers: [{ color: '#1a73e8' }, { weight: 2 }]
        },
        {
          featureType: 'water',
          elementType: 'geometry.fill',
          stylers: [{ color: '#e3f2fd' }]
        },
        {
          featureType: 'landscape',
          elementType: 'geometry.fill',
          stylers: [{ color: '#f5f5f5' }]
        }
      ],
      restriction: {
        latLngBounds: {
          north: 24,
          south: 8,
          west: 102,
          east: 115
        },
        strictBounds: false
      }
    });

    setMap(googleMap);
    infoWindowRef.current = new window.google.maps.InfoWindow();
  }, [isLoaded, map]);

  // Add markers
  useEffect(() => {
    if (!map || !isLoaded) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();

    markers.forEach((item, index) => {
      const isTop5 = index < 5;
      const size = 32 + (item.customer_count / maxCount) * 16;

      const markerIcon = {
        url: '/plainLogo.png',
        scaledSize: new window.google.maps.Size(size, size),
        anchor: new window.google.maps.Point(size / 2, size / 2)
      };

      const marker = new window.google.maps.Marker({
        position: { lat: item.coords.lat, lng: item.coords.lng },
        map: map,
        icon: markerIcon,
        title: item.displayProvince,
        animation: isTop5 ? window.google.maps.Animation.BOUNCE : null,
        label: {
          text: item.customer_count > 99 ? '99+' : String(item.customer_count),
          color: 'white',
          fontSize: '10px',
          fontWeight: 'bold',
          className: 'marker-label'
        }
      });

      // Stop bounce animation after 2 seconds for top 5
      if (isTop5) {
        setTimeout(() => {
          marker.setAnimation(null);
        }, 2000);
      }

      marker.addListener('click', () => {
        const content = `
          <div style="padding: 12px; min-width: 200px; font-family: system-ui, -apple-system, sans-serif;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;">
              <img src="/plainLogo.png" alt="" style="width: 24px; height: 24px;" />
              <span style="font-weight: 700; color: #1f2937; font-size: 16px;">${item.displayProvince.replace(/</g, '&lt;').replace(/"/g, '&quot;')}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #6b7280; font-size: 14px;">Số khách hàng:</span>
                <span style="font-weight: 700; color: #16a34a; font-size: 18px;">${item.customer_count}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #6b7280; font-size: 14px;">Doanh thu:</span>
                <span style="font-weight: 700; color: #2563eb;">${formatCurrency(item.total_revenue)}</span>
              </div>
              ${isTop5 ? `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                  <span style="display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: 500; background: #fef3c7; color: #92400e;">
                    🏆 Top ${index + 1} tỉnh/thành
                  </span>
                </div>
              ` : ''}
            </div>
          </div>
        `;

        infoWindowRef.current.setContent(content);
        infoWindowRef.current.open(map, marker);
      });

      bounds.extend({ lat: item.coords.lat, lng: item.coords.lng });
      markersRef.current.push(marker);
    });

    if (markers.length > 0) {
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [map, markers, maxCount, isLoaded]);

  if (!isLoaded) {
    return (
      <div className="relative w-full h-full min-h-[400px] bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải bản đồ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <style>{`
        .marker-label {
          background: #EF4444;
          border-radius: 50%;
          padding: 2px 6px;
          margin-top: -40px;
          margin-left: 20px;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .gm-style-iw-c {
          border-radius: 12px !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.15) !important;
        }
        .gm-style-iw-d {
          overflow: hidden !important;
        }
      `}</style>

      <div ref={mapRef} className="w-full h-full min-h-[400px] rounded-lg" />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm z-10">
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
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg text-sm z-10">
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

export default GoogleMapVietnam;
