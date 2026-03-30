import { useState, useEffect } from 'react';
import { useDataStore } from '../context/useDataStore';
import { Search, Activity, Battery, Signal } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

const PointManager = () => {
  const { devices, farms, sensorReadings, fetchSensorReadings, initSensorData } = useDataStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);

  // Fetch data when point is selected
  useEffect(() => {
    if (selectedPoint) {
      initSensorData(selectedPoint).then(() => {
        fetchSensorReadings(selectedPoint);
      });
    }
  }, [selectedPoint, initSensorData, fetchSensorReadings]);

  // Filter only sensor devices as "Points"
  const points = devices.filter(d => d.type === 'sensor');
  
  const filteredPoints = points.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.serial.includes(searchTerm)
  );

  const getFarmName = (farmId?: string) => {
    return farms.find(f => f.id === farmId)?.name || 'Chưa gán';
  };

  // Get current readings
  const readings = selectedPoint ? (sensorReadings[selectedPoint] || []) : [];
  const sortedReadings = [...readings].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Latest reading
  const currentReading = sortedReadings.length > 0 ? sortedReadings[sortedReadings.length - 1] : { temp: 0, humidity: 0, soil: 0 };

  // Chart data
  const chartData = sortedReadings.map(r => ({
    time: new Date(r.timestamp).getHours() + ':00',
    temp: r.temp,
    humidity: r.humidity,
    soil: r.soil
  })).slice(-24); // Last 24 readings

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quản lý điểm đo</h2>
          <p className="text-gray-500 text-sm">Tổng số: {points.length} điểm đo cảm biến</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="card space-y-4 h-[calc(100vh-12rem)] flex flex-col">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Tìm điểm đo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {filteredPoints.map(point => (
              <div 
                key={point.id}
                onClick={() => setSelectedPoint(point.id)}
                className={clsx(
                  "p-3 rounded-lg border transition-all cursor-pointer",
                  selectedPoint === point.id 
                    ? "border-primary bg-primary/5" 
                    : "border-gray-200 hover:border-primary/50 hover:bg-gray-50"
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-gray-900">{point.name}</h4>
                  <span className={clsx(
                    "w-2 h-2 rounded-full",
                    point.status === 'online' ? "bg-green-500" : "bg-red-500"
                  )} />
                </div>
                <p className="text-xs text-gray-500 mb-2">{getFarmName(point.farmId)}</p>
                <div className="flex gap-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><Battery size={12} /> 85%</span>
                  <span className="flex items-center gap-1"><Signal size={12} /> Tốt</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail & Chart */}
        <div className="lg:col-span-2 space-y-6">
          {selectedPoint ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4 flex flex-col items-center justify-center bg-blue-50 border-none">
                  <span className="text-gray-500 text-xs uppercase mb-1">Nhiệt độ</span>
                  <span className="text-2xl font-bold text-blue-600">{currentReading.temp.toFixed(1)}°C</span>
                </div>
                <div className="card p-4 flex flex-col items-center justify-center bg-green-50 border-none">
                  <span className="text-gray-500 text-xs uppercase mb-1">Độ ẩm KK</span>
                  <span className="text-2xl font-bold text-green-600">{currentReading.humidity.toFixed(1)}%</span>
                </div>
                <div className="card p-4 flex flex-col items-center justify-center bg-orange-50 border-none">
                  <span className="text-gray-500 text-xs uppercase mb-1">Độ ẩm đất</span>
                  <span className="text-2xl font-bold text-orange-600">{currentReading.soil.toFixed(1)}%</span>
                </div>
                <div className="card p-4 flex flex-col items-center justify-center bg-purple-50 border-none">
                  <span className="text-gray-500 text-xs uppercase mb-1">Trạng thái</span>
                  <span className="text-2xl font-bold text-purple-600">Tốt</span>
                </div>
              </div>

              <div className="card h-[400px]">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Activity size={20} className="text-primary" />
                  Biểu đồ giám sát (24h qua)
                </h3>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="temp" stroke="#3B82F6" strokeWidth={2} dot={false} name="Nhiệt độ" />
                    <Line type="monotone" dataKey="humidity" stroke="#10B981" strokeWidth={2} dot={false} name="Độ ẩm" />
                    <Line type="monotone" dataKey="soil" stroke="#F59E0B" strokeWidth={2} dot={false} name="Đất" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
              <Activity size={48} className="mb-4 opacity-50" />
              <p>Chọn một điểm đo để xem chi tiết</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PointManager;
