
import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area
} from 'recharts';
import { ScanningData } from '../types';
import { PROCESS_FLOW } from '../constants';

interface ProductionChartProps {
  data: ScanningData[];
}

const ProductionChart: React.FC<ProductionChartProps> = ({ data }) => {
  const processFlowData = useMemo(() => {
    return PROCESS_FLOW.map(processName => {
      const total = data
        .filter(item => item.process === processName)
        .reduce((sum, curr) => sum + curr.qty, 0);
      
      // Create a cleaner display name for the X-axis
      let displayName = processName;
      if (processName === 'Cutting Done') displayName = 'Cut';
      else if (processName === 'Sewing Input') displayName = 'Sew In';
      else if (processName === 'Sewing Output') displayName = 'Sew Out';
      else if (processName === 'Wash Input') displayName = 'Wash In';
      else if (processName === 'Wash Output') displayName = 'Wash Out';
      else if (processName === 'Finishing Input') displayName = 'Fin In';
      else if (processName === 'Finishing Output') displayName = 'Fin Out';

      return {
        name: displayName,
        fullName: processName,
        total: total
      };
    });
  }, [data]);

  const hourlyTrendData = useMemo(() => {
    const hoursMap: Record<string, number> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStr = d.getHours() + ":00";
      hoursMap[hourStr] = 0;
    }

    data.forEach(item => {
      const date = new Date(item.scan_time);
      const hourStr = date.getHours() + ":00";
      if (hoursMap[hourStr] !== undefined) {
        hoursMap[hourStr] += item.qty;
      }
    });

    return Object.entries(hoursMap).map(([hour, qty]) => ({
      hour,
      qty
    }));
  }, [data]);

  // Distinct colors for each stage, alternating shades for In/Out pairs
  const CHART_COLORS = [
    '#3b82f6', // Cut (Blue)
    '#f43f5e', // Sew In (Rose 500)
    '#e11d48', // Sew Out (Rose 600)
    '#f59e0b', // Wash In (Amber 500)
    '#d97706', // Wash Out (Amber 600)
    '#10b981', // Fin In (Emerald 500)
    '#059669'  // Fin Out (Emerald 600)
  ];

  return (
    <div className="space-y-12 pb-12 font-sans">
      {/* Chart 1: Production Process Graph */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 px-10 py-8">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">Production Process Graph</h3>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Real-time status across all production stages</p>
        </div>
        <div className="p-10 h-[450px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processFlowData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#1e293b', fontSize: 10, fontWeight: 900}} 
                interval={0}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
              <Tooltip 
                cursor={{fill: '#f8fafc'}}
                contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', padding: '20px' }}
                itemStyle={{ fontSize: '14px', fontWeight: 900, color: '#1e293b' }}
                labelStyle={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                formatter={(value) => [`${value.toLocaleString()} Pcs`, 'Output']}
              />
              <Bar dataKey="total" radius={[12, 12, 0, 0]} barSize={45}>
                {processFlowData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Shift Scanning Trend */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-indigo-600 px-10 py-8">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">Shift Scanning Trend</h3>
          <p className="text-[11px] font-bold text-indigo-200 uppercase tracking-[0.2em] mt-2">Hourly output intensity (Last 12 Hours)</p>
        </div>
        <div className="p-10 h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyTrendData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="hour" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}}
              />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
              <Tooltip 
                contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', padding: '20px' }}
                itemStyle={{ fontSize: '14px', fontWeight: 900, color: '#4f46e5' }}
                labelStyle={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
              />
              <Area 
                type="monotone" 
                dataKey="qty" 
                stroke="#6366f1" 
                strokeWidth={6} 
                fillOpacity={1} 
                fill="url(#colorTrend)" 
                dot={{r: 6, fill: '#6366f1', strokeWidth: 4, stroke: '#fff'}}
                activeDot={{r: 10, strokeWidth: 0}}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ProductionChart;
