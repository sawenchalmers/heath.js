import React, { useState, useMemo } from 'react';

interface HourlyDataPoint {
  relativeHumidity: number;
  hour: number;
  day: number;
  month: number;
}

interface HumidityChartProps {
  monthlyHumidity: number[];
  avgHumidity: number;
  hourlyData?: HourlyDataPoint[];
}

// Constants, kept outside the component so its memoised calculations never see a new copy.
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Days in each month (non-leap year)
const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Boverket-based humidity thresholds
const humidityRanges = {
  tooDry: { min: 0, max: 30, color: '#2563EB', label: 'Too Dry' },
  comfortable: { min: 30, max: 60, color: '#059669', label: 'Comfort Range' },
  warning: { min: 60, max: 75, color: '#D97706', label: 'Humid – Warning' },
  highRisk: { min: 75, max: 100, color: '#DC2626', label: 'High Risk Zone' }
};

export const HumidityChart: React.FC<HumidityChartProps> = ({
  monthlyHumidity,
  avgHumidity,
  hourlyData = []
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'heatmap'>('chart');
  const [timeResolution, setTimeResolution] = useState<'monthly' | 'hourly'>('monthly');
  
  
  const totalDays = 365;

  // Create humidity matrix for heatmap - either [month][hour] or [day][hour]
  const humidityMatrix = useMemo(() => {
    if (timeResolution === 'monthly') {
      // Monthly view: 12 months × 24 hours
      if (!hourlyData || hourlyData.length === 0) {
        // Fallback to synthetic data based on monthly averages
        return months.map((_, monthIndex) => {
          const monthHumidity = monthlyHumidity[monthIndex] || avgHumidity;
          return Array.from({length: 24}, (_, hour) => {
            // Simulate daily humidity variation (inverse of temperature)
            const dailyVariation = -5 * Math.sin((hour - 6) * Math.PI / 12); // Lower at 2 PM
            return Math.max(0, Math.min(100, monthHumidity + dailyVariation));
          });
        });
      }

      // Process real hourly data into monthly averages
      const matrix = Array(12).fill(null).map(() => Array(24).fill(0));
      const counts = Array(12).fill(null).map(() => Array(24).fill(0));
      
      hourlyData.forEach(point => {
        const monthIndex = point.month - 1;
        const hourIndex = point.hour;
        
        if (monthIndex >= 0 && monthIndex < 12 && hourIndex >= 0 && hourIndex < 24) {
          matrix[monthIndex][hourIndex] += point.relativeHumidity;
          counts[monthIndex][hourIndex] += 1;
        }
      });
      
      return matrix.map((monthData, monthIndex) => 
        monthData.map((humiditySum, hourIndex) => 
          counts[monthIndex][hourIndex] > 0 
            ? humiditySum / counts[monthIndex][hourIndex] 
            : monthlyHumidity[monthIndex] || avgHumidity
        )
      );
    } else {
      // Hourly view: 365 days × 24 hours - optimized for performance
      if (!hourlyData || hourlyData.length === 0) {
        // Fallback to synthetic data
        const matrix = [];
        
        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
          const monthHumidity = monthlyHumidity[monthIndex] || avgHumidity;
          const daysThisMonth = daysInMonth[monthIndex];
          
          for (let dayInMonth = 0; dayInMonth < daysThisMonth; dayInMonth++) {
            const dayArray = [];
            for (let hour = 0; hour < 24; hour++) {
              const dailyVariation = -5 * Math.sin((hour - 6) * Math.PI / 12);
              const seasonalVariation = 3 * Math.sin((dayInMonth / daysThisMonth) * Math.PI);
              dayArray.push(Math.max(0, Math.min(100, monthHumidity + dailyVariation + seasonalVariation)));
            }
            matrix.push(dayArray);
          }
        }
        return matrix;
      }

      // Process real hourly data into daily matrix
      const matrix = Array(totalDays).fill(null).map(() => Array(24).fill(0));
      const counts = Array(totalDays).fill(null).map(() => Array(24).fill(0));
      
      hourlyData.forEach(point => {
        let dayOfYear = 0;
        for (let m = 0; m < point.month - 1; m++) {
          dayOfYear += daysInMonth[m];
        }
        dayOfYear += point.day - 1;
        
        const hourIndex = point.hour;
        
        if (dayOfYear >= 0 && dayOfYear < totalDays && hourIndex >= 0 && hourIndex < 24) {
          matrix[dayOfYear][hourIndex] += point.relativeHumidity;
          counts[dayOfYear][hourIndex] += 1;
        }
      });
      
      return matrix.map((dayData, dayIndex) => {
        let monthIndex = 0;
        let dayCount = 0;
        for (let m = 0; m < 12; m++) {
          if (dayIndex < dayCount + daysInMonth[m]) {
            monthIndex = m;
            break;
          }
          dayCount += daysInMonth[m];
        }
        
        return dayData.map((humiditySum, hourIndex) => 
          counts[dayIndex][hourIndex] > 0 
            ? humiditySum / counts[dayIndex][hourIndex] 
            : monthlyHumidity[monthIndex] || avgHumidity
        );
      });
    }
  }, [hourlyData, monthlyHumidity, avgHumidity, totalDays, timeResolution]);

  // Memoized color calculation function
  const getHumidityColor = useMemo(() => {
    const colorCache = new Map();
    
    return (humidity: number) => {
      const roundedHumidity = Math.round(humidity);
      
      if (colorCache.has(roundedHumidity)) {
        return colorCache.get(roundedHumidity);
      }
      
      let color: string;
      
      if (humidity < humidityRanges.tooDry.max) color = humidityRanges.tooDry.color;
      else if (humidity < humidityRanges.comfortable.max) color = humidityRanges.comfortable.color;
      else if (humidity < humidityRanges.warning.max) color = humidityRanges.warning.color;
      else color = humidityRanges.highRisk.color;
      
      colorCache.set(roundedHumidity, color);
      return color;
    };
  }, []);

  const getHumidityStats = () => {
    let totalHours = 0;
    let tooDryHours = 0;
    let comfortableHours = 0;
    let warningHours = 0;
    let highRiskHours = 0;

    humidityMatrix.forEach(periodData => {
      periodData.forEach(humidity => {
        totalHours++;
        if (humidity < 30) tooDryHours++;
        else if (humidity < 60) comfortableHours++;
        else if (humidity < 75) warningHours++;
        else highRiskHours++;
      });
    });

    return {
      tooDry: Math.round((tooDryHours / totalHours) * 100),
      comfortable: Math.round((comfortableHours / totalHours) * 100),
      warning: Math.round((warningHours / totalHours) * 100),
      highRisk: Math.round((highRiskHours / totalHours) * 100)
    };
  };

  const humidityStats = getHumidityStats();

  return (
    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-6 border border-gray-600/30 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <span className="text-2xl">💧</span>
          Moisture Safety - Annual Humidity Analysis
        </h3>
        
        {/* Controls */}
        <div className="flex gap-4 items-center">
          {/* Time Resolution Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setTimeResolution('monthly')}
              className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
                timeResolution === 'monthly'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Monthly
              <span className="ml-1 text-xs opacity-75">(Interactive)</span>
            </button>
            <button
              onClick={() => setTimeResolution('hourly')}
              disabled={viewMode === 'chart'}
              className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
                timeResolution === 'hourly' && viewMode !== 'chart'
                  ? 'bg-purple-600 text-white'
                  : viewMode === 'chart'
                  ? 'bg-gray-600 text-gray-500 cursor-not-allowed opacity-50'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Hourly
              <span className="ml-1 text-xs opacity-75">
                {viewMode === 'chart' ? '(Heatmap Only)' : '(High-Perf)'}
              </span>
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setViewMode('chart');
                // Auto-switch to monthly when switching to bar chart
                if (timeResolution === 'hourly') {
                  setTimeResolution('monthly');
                }
              }}
              className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
                viewMode === 'chart'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Bar Chart
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
                viewMode === 'heatmap'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Heatmap
            </button>
          </div>
        </div>
      </div>

      {/* Boverket Humidity Risk Statistics */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="text-center p-3 bg-blue-900/30 rounded-lg border border-blue-700/30">
          <div className="text-blue-400 font-bold text-lg">{humidityStats.tooDry}%</div>
          <div className="text-blue-300 text-xs font-medium">🟦 Too Dry</div>
          <div className="text-blue-200 text-xs">&lt; 30% RH</div>
        </div>
        <div className="text-center p-3 bg-green-900/30 rounded-lg border border-green-700/30">
          <div className="text-green-400 font-bold text-lg">{humidityStats.comfortable}%</div>
          <div className="text-green-300 text-xs font-medium">🟩 Comfort Range</div>
          <div className="text-green-200 text-xs">30-60% RH</div>
        </div>
        <div className="text-center p-3 bg-orange-900/30 rounded-lg border border-orange-700/30">
          <div className="text-orange-400 font-bold text-lg">{humidityStats.warning}%</div>
          <div className="text-orange-300 text-xs font-medium">🟧 Warning</div>
          <div className="text-orange-200 text-xs">60-75% RH</div>
        </div>
        <div className="text-center p-3 bg-red-900/30 rounded-lg border border-red-700/30">
          <div className="text-red-400 font-bold text-lg">{humidityStats.highRisk}%</div>
          <div className="text-red-300 text-xs font-medium">🟥 High Risk</div>
          <div className="text-red-200 text-xs">&gt; 75% RH</div>
        </div>
      </div>

      {/* Visualization */}
      <div className="bg-gray-900/50 rounded-lg border border-gray-600/30 p-4">
        {viewMode === 'chart' ? (
          /* Traditional Bar Chart View */
          <div className="relative h-64">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-gray-400 pr-2">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>
            
            <div className="ml-8 h-full flex items-end justify-around pb-8">
              {monthlyHumidity.map((humidity, index) => (
                <div key={months[index]} className="flex flex-col items-center space-y-2 group">
                  <div className="relative">
                    <div
                      className="w-8 rounded-t transition-all duration-300 group-hover:w-10 min-h-[4px]"
                      style={{ 
                        height: `${Math.max((humidity / 100) * 200, 4)}px`, // Scale to 200px max height
                        backgroundColor: getHumidityColor(humidity)
                      }}
                      title={`${months[index]}: ${humidity.toFixed(1)}%`}
                    />
                    {/* Humidity value on hover */}
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                      <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600 whitespace-nowrap">
                        <div className="font-medium">{months[index]}: {humidity.toFixed(1)}%</div>
                        <div className="text-xs opacity-75">
                          {humidity < 30 ? '🟦 Too Dry' : 
                           humidity < 60 ? '🟩 Comfortable' : 
                           humidity < 75 ? '🟧 Warning' : '🟥 High Risk'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">
                    {months[index]}
                  </span>
                </div>
              ))}
            </div>

            {/* Boverket Reference Lines */}
            <div className="absolute ml-8 inset-x-0 pointer-events-none" style={{ bottom: `${8 + (30/100) * 200}px`, height: '2px' }}>
              <div className="w-full h-full bg-green-500/40 rounded"></div>
              <span className="absolute right-2 -top-5 text-xs text-green-400 font-medium">30% (Dry Limit)</span>
            </div>
            <div className="absolute ml-8 inset-x-0 pointer-events-none" style={{ bottom: `${8 + (60/100) * 200}px`, height: '2px' }}>
              <div className="w-full h-full bg-orange-500/40 rounded"></div>
              <span className="absolute right-2 -top-5 text-xs text-orange-400 font-medium">60% (Warning)</span>
            </div>
            <div className="absolute ml-8 inset-x-0 pointer-events-none" style={{ bottom: `${8 + (75/100) * 200}px`, height: '2px' }}>
              <div className="w-full h-full bg-red-500/40 rounded"></div>
              <span className="absolute right-2 -top-5 text-xs text-red-400 font-medium">75% (Mold Risk)</span>
            </div>

            {/* Grid lines */}
            <div className="absolute ml-8 inset-x-0 pointer-events-none">
              {[25, 50, 75, 100].map((percent) => (
                <div
                  key={percent}
                  className="absolute inset-x-0 border-t border-gray-600/20"
                  style={{ bottom: `${8 + (percent/100) * 200}px` }}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Annual Heatmap View */
          <div className="relative">
            {/* Y-axis labels (Hours) */}
            <div className="absolute -left-8 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-400 py-1">
              {[0, 6, 12, 18, 23].map(hour => (
                <span key={hour} className="transform -translate-y-1/2">
                  {hour}:00
                </span>
              ))}
            </div>

            {/* X-axis labels */}
            <div className="absolute -top-8 left-8 right-0 flex justify-between text-xs text-gray-400">
              {months.map((month) => (
                <span key={month} className="transform -translate-x-1/2">
                  {month}
                </span>
              ))}
            </div>

            {/* Heatmap Grid */}
            <div className="ml-8 mt-8 overflow-x-auto">
              {timeResolution === 'monthly' ? (
                /* Monthly View: 12 months × 24 hours */
                <div className="grid grid-cols-12 gap-1">
                  {humidityMatrix.map((monthData, monthIndex) => (
                    <div key={monthIndex} className="space-y-1">
                      <div className="grid grid-rows-24 gap-px">
                        {monthData.map((humidity, hourIndex) => (
                          <div
                            key={`${monthIndex}-${hourIndex}`}
                            className="group relative cursor-pointer transition-all duration-200 hover:scale-110 hover:z-10"
                            style={{
                              backgroundColor: getHumidityColor(humidity),
                              width: '100%',
                              height: '8px',
                              borderRadius: '1px'
                            }}
                            title={`${months[monthIndex]} ${hourIndex}:00 - ${humidity.toFixed(1)}%`}
                          >
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20">
                              <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600 whitespace-nowrap">
                                <div className="font-medium">{months[monthIndex]} {hourIndex}:00</div>
                                <div>{humidity.toFixed(1)}% RH</div>
                                <div className="text-xs opacity-75">
                                  {humidity < 30 ? '🟦 Too Dry' : 
                                   humidity < 60 ? '🟩 Comfortable' : 
                                   humidity < 75 ? '🟧 Warning' : '🟥 High Risk'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Hourly View: 365 days × 24 hours - Performance Optimized */
                <div className="flex gap-px min-w-max" style={{ width: '730px', height: '192px' }}>
                  {humidityMatrix.map((dayData, dayIndex) => (
                    <div key={dayIndex} className="flex flex-col gap-px" style={{ width: '2px' }}>
                      {dayData.map((humidity, hourIndex) => (
                        <div
                          key={`${dayIndex}-${hourIndex}`}
                          style={{
                            backgroundColor: getHumidityColor(humidity),
                            width: '2px',
                            height: '8px'
                          }}
                          // No hover interactions for performance
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-gray-600/30">
          <div className="flex items-center justify-center gap-6">
            {Object.entries(humidityRanges).map(([key, range]) => (
              <div key={key} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: range.color }}
                ></div>
                <span className="text-xs text-gray-300">{range.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pedagogical Information */}
      <div className="mt-4 bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
        <h4 className="text-blue-200 font-semibold mb-2 flex items-center gap-2">
          <span>🏛️</span>
          Boverket Moisture Safety Guidelines
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-100">
          <div>
            <p className="mb-2">
              <strong>Critical Thresholds:</strong> Surface relative humidity (RH) over <strong>75%</strong> creates risk for 
              mold, rot, and material degradation <a href="https://www.boverket.se/sv/byggande/forebygg-fel-brister-skador/risker/risker-fuktskador/" target="_blank" className="underline text-blue-300">(Boverket)</a>. 
              RH below <strong>30%</strong> can cause occupant discomfort due to dry air.
            </p>
            <p className="mb-2">
              <strong>Exterior Walls:</strong> High indoor humidity in cold periods can lead to condensation inside the wall. 
              Use vapor barriers on the warm side and avoid moisture-sensitive materials near cold surfaces. 
              <a href="https://www.boverket.se/sv/byggande/forebygg-fel-brister-skador/risker/risker-fuktskador/fuktrisker-yttervaggar/" target="_blank" className="underline text-blue-300">[Read more]</a>
            </p>
            <p>
              <strong>Foundations:</strong> Elevated RH and cold indoor surfaces in ground floors can cause condensation and mold. 
              Use capillary breaks and good insulation detailing.
              <a href="https://www.boverket.se/sv/byggande/forebygg-fel-brister-skador/risker/risker-fuktskador/fuktrisker-for-grund/" target="_blank" className="underline text-blue-300">[Read more]</a>
            </p>
          </div>
          <div>
            <p className="mb-2">
              <strong>Roof & Attic Design:</strong> During winter, rising moist air may condense in the roof or attic space if 
              not properly ventilated. Airtight ceilings and cold-roof ventilation reduce this risk.
              <a href="https://www.boverket.se/sv/byggande/forebygg-fel-brister-skador/risker/risker-fuktskador/fuktrisker-yttertak/" target="_blank" className="underline text-blue-300">[Read more]</a>
            </p>
            <p className="mb-2">
              <strong>Visualization Modes:</strong> Use the bar chart to identify monthly RH trends. 
              Switch to heatmap view to detect extreme daily fluctuations and long humid periods.
            </p>
            <p>
              <strong>Design Evaluation:</strong> Use the thresholds and distribution stats above to assess 
              how often RH levels fall outside of safe or comfortable ranges — and what that means for 
              your envelope detailing and ventilation strategy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
