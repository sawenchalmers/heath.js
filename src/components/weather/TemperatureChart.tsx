import React, { useState, useMemo } from 'react';

interface HourlyDataPoint {
  dryBulbTemp: number;
  hour: number;
  day: number;
  month: number;
}

interface TemperatureChartProps {
  monthlyTemperatures: number[];
  minTemp: number;
  maxTemp: number;
  avgTemp: number;
  hourlyData?: HourlyDataPoint[];
}

// Constants, kept outside the component so its memoised calculations never see a new copy.
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Days in each month (non-leap year)
const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Comfort ranges - Updated for Swedish building standards
const comfortRanges = {
  coldRisk: { min: -40, max: 18, color: '#1E40AF', label: '❄️ Cold Risk' },
  slightlyCool: { min: 18, max: 20, color: '#3B82F6', label: '😬 Slightly Cool' },
  comfortable: { min: 20, max: 26, color: '#10B981', label: '✅ Comfort Zone' },
  warmDiscomfort: { min: 26, max: 28, color: '#F59E0B', label: '😓 Warm Discomfort' },
  overheating: { min: 28, max: 50, color: '#EF4444', label: '🔥 Overheating' }
};

export const TemperatureChart: React.FC<TemperatureChartProps> = ({
  monthlyTemperatures,
  minTemp,
  maxTemp,
  avgTemp,
  hourlyData = []
}) => {
  const [viewMode, setViewMode] = useState<'dryBulb' | 'comfort'>('dryBulb');
  const [timeResolution, setTimeResolution] = useState<'monthly' | 'hourly'>('monthly');
  
  
  const totalDays = 365;

  // Create temperature matrix for heatmap - either [month][hour] or [day][hour]
  const temperatureMatrix = useMemo(() => {
    if (timeResolution === 'monthly') {
      // Monthly view: 12 months × 24 hours (much faster)
      if (!hourlyData || hourlyData.length === 0) {
        // Fallback to synthetic data based on monthly averages
        return months.map((_, monthIndex) => {
          const monthTemp = monthlyTemperatures[monthIndex] || avgTemp;
          return Array.from({length: 24}, (_, hour) => {
            // Simulate daily temperature variation
            const dailyVariation = 8 * Math.sin((hour - 6) * Math.PI / 12); // Peak at 2 PM
            return monthTemp + dailyVariation;
          });
        });
      }

      // Process real hourly data into monthly averages
      const matrix = Array(12).fill(null).map(() => Array(24).fill(0));
      const counts = Array(12).fill(null).map(() => Array(24).fill(0));
      
      hourlyData.forEach(point => {
        const monthIndex = point.month - 1; // Convert to 0-based
        const hourIndex = point.hour;
        
        if (monthIndex >= 0 && monthIndex < 12 && hourIndex >= 0 && hourIndex < 24) {
          matrix[monthIndex][hourIndex] += point.dryBulbTemp;
          counts[monthIndex][hourIndex] += 1;
        }
      });
      
      // Calculate averages
      return matrix.map((monthData, monthIndex) => 
        monthData.map((tempSum, hourIndex) => 
          counts[monthIndex][hourIndex] > 0 
            ? tempSum / counts[monthIndex][hourIndex] 
            : monthlyTemperatures[monthIndex] || avgTemp
        )
      );
    } else {
      // Hourly view: 365 days × 24 hours - optimized for performance
      if (!hourlyData || hourlyData.length === 0) {
        // Fallback to synthetic data based on monthly averages
        const matrix = [];
        
        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
          const monthTemp = monthlyTemperatures[monthIndex] || avgTemp;
          const daysThisMonth = daysInMonth[monthIndex];
          
          for (let dayInMonth = 0; dayInMonth < daysThisMonth; dayInMonth++) {
            const dayArray = [];
            for (let hour = 0; hour < 24; hour++) {
              // Simulate daily temperature variation
              const dailyVariation = 8 * Math.sin((hour - 6) * Math.PI / 12); // Peak at 2 PM
              // Add some seasonal variation within the month
              const seasonalVariation = 2 * Math.sin((dayInMonth / daysThisMonth) * Math.PI);
              dayArray.push(monthTemp + dailyVariation + seasonalVariation);
            }
            matrix.push(dayArray);
          }
        }
        return matrix;
      }

      // Process real hourly data into daily matrix [day][hour]
      const matrix = Array(totalDays).fill(null).map(() => Array(24).fill(0));
      const counts = Array(totalDays).fill(null).map(() => Array(24).fill(0));
      
      hourlyData.forEach(point => {
        // Calculate day of year from month and day
        let dayOfYear = 0;
        for (let m = 0; m < point.month - 1; m++) {
          dayOfYear += daysInMonth[m];
        }
        dayOfYear += point.day - 1; // Convert to 0-based
        
        const hourIndex = point.hour;
        
        if (dayOfYear >= 0 && dayOfYear < totalDays && hourIndex >= 0 && hourIndex < 24) {
          matrix[dayOfYear][hourIndex] += point.dryBulbTemp;
          counts[dayOfYear][hourIndex] += 1;
        }
      });
      
      // Calculate averages, fallback to monthly average if no data
      return matrix.map((dayData, dayIndex) => {
        // Find which month this day belongs to
        let monthIndex = 0;
        let dayCount = 0;
        for (let m = 0; m < 12; m++) {
          if (dayIndex < dayCount + daysInMonth[m]) {
            monthIndex = m;
            break;
          }
          dayCount += daysInMonth[m];
        }
        
        return dayData.map((tempSum, hourIndex) => 
          counts[dayIndex][hourIndex] > 0 
            ? tempSum / counts[dayIndex][hourIndex] 
            : monthlyTemperatures[monthIndex] || avgTemp
        );
      });
    }
  }, [hourlyData, monthlyTemperatures, avgTemp, totalDays, timeResolution]);

  // Memoized color calculation function for performance
  const getTemperatureColor = useMemo(() => {
    // Pre-calculate color cache for better performance
    const colorCache = new Map();
    
    return (temp: number) => {
      // Round temperature for caching
      const roundedTemp = Math.round(temp * 2) / 2; // 0.5°C precision
      
      if (colorCache.has(roundedTemp)) {
        return colorCache.get(roundedTemp);
      }
      
      // Use a color scale similar to d3.interpolateTurbo
      const normalizedTemp = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));
      
      let color: string;
      
      if (viewMode === 'comfort') {
        // Color based on comfort zones (Swedish building standards)
        if (temp < comfortRanges.coldRisk.max) color = comfortRanges.coldRisk.color;
        else if (temp < comfortRanges.slightlyCool.max) color = comfortRanges.slightlyCool.color;
        else if (temp <= comfortRanges.comfortable.max) color = comfortRanges.comfortable.color;
        else if (temp <= comfortRanges.warmDiscomfort.max) color = comfortRanges.warmDiscomfort.color;
        else color = comfortRanges.overheating.color;
      } else {
        // Temperature gradient: blue (cold) -> green -> yellow -> red (hot)
        if (normalizedTemp < 0.25) {
          const t = normalizedTemp * 4;
          color = `rgb(${Math.round(0 + 100 * t)}, ${Math.round(100 + 155 * t)}, 255)`;
        } else if (normalizedTemp < 0.5) {
          const t = (normalizedTemp - 0.25) * 4;
          color = `rgb(${Math.round(100 + 155 * t)}, 255, ${Math.round(255 - 255 * t)})`;
        } else if (normalizedTemp < 0.75) {
          const t = (normalizedTemp - 0.5) * 4;
          color = `rgb(255, ${Math.round(255 - 100 * t)}, 0)`;
        } else {
          const t = (normalizedTemp - 0.75) * 4;
          color = `rgb(255, ${Math.round(155 - 155 * t)}, 0)`;
        }
      }
      
      colorCache.set(roundedTemp, color);
      return color;
    };
  }, [minTemp, maxTemp, viewMode]);

  const getComfortZoneStats = () => {
    let totalHours = 0;
    let comfortableHours = 0;
    let coldRiskHours = 0;
    let slightlyCoolHours = 0;
    let warmDiscomfortHours = 0;
    let overheatingHours = 0;

    temperatureMatrix.forEach(periodData => {
      periodData.forEach(temp => {
        totalHours++;
        if (temp < 18) coldRiskHours++;
        else if (temp < 20) slightlyCoolHours++;
        else if (temp <= 26) comfortableHours++;
        else if (temp <= 28) warmDiscomfortHours++;
        else overheatingHours++;
      });
    });

    return {
      comfortable: Math.round((comfortableHours / totalHours) * 100),
      coldRisk: Math.round((coldRiskHours / totalHours) * 100),
      slightlyCool: Math.round((slightlyCoolHours / totalHours) * 100),
      warmDiscomfort: Math.round((warmDiscomfortHours / totalHours) * 100),
      overheating: Math.round((overheatingHours / totalHours) * 100)
    };
  };

  const comfortStats = getComfortZoneStats();
  
  return (
    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-6 border border-gray-600/30 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <span className="text-2xl">🌡️</span>
          Thermal Experience - Annual Hourly Heatmap
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
              className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
                timeResolution === 'hourly'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Hourly
              <span className="ml-1 text-xs opacity-75">(High-Perf)</span>
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('dryBulb')}
              className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
                viewMode === 'dryBulb'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Temperature
            </button>
            <button
              onClick={() => setViewMode('comfort')}
              className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
                viewMode === 'comfort'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Comfort Zones
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        <div className="text-center p-2 bg-blue-900/30 rounded-lg border border-blue-700/30">
          <div className="text-blue-400 font-bold text-sm">{comfortStats.coldRisk}%</div>
          <div className="text-blue-300 text-xs font-medium">❄️ Cold Risk</div>
          <div className="text-blue-200 text-xs">&lt; 18°C</div>
        </div>
        <div className="text-center p-2 bg-blue-700/30 rounded-lg border border-blue-600/30">
          <div className="text-blue-300 font-bold text-sm">{comfortStats.slightlyCool}%</div>
          <div className="text-blue-200 text-xs font-medium">😬 Slightly Cool</div>
          <div className="text-blue-100 text-xs">18-20°C</div>
        </div>
        <div className="text-center p-2 bg-green-900/30 rounded-lg border border-green-700/30">
          <div className="text-green-400 font-bold text-sm">{comfortStats.comfortable}%</div>
          <div className="text-green-300 text-xs font-medium">✅ Comfort Zone</div>
          <div className="text-green-200 text-xs">20-26°C</div>
        </div>
        <div className="text-center p-2 bg-orange-900/30 rounded-lg border border-orange-700/30">
          <div className="text-orange-400 font-bold text-sm">{comfortStats.warmDiscomfort}%</div>
          <div className="text-orange-300 text-xs font-medium">😓 Warm Discomfort</div>
          <div className="text-orange-200 text-xs">26-28°C</div>
        </div>
        <div className="text-center p-2 bg-red-900/30 rounded-lg border border-red-700/30">
          <div className="text-red-400 font-bold text-sm">{comfortStats.overheating}%</div>
          <div className="text-red-300 text-xs font-medium">🔥 Overheating</div>
          <div className="text-red-200 text-xs">&gt; 28°C</div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-gray-900/50 rounded-lg border border-gray-600/30 p-4">
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
            {timeResolution === 'monthly' ? (
              months.map((month) => (
                <span key={month} className="transform -translate-x-1/2">
                  {month}
                </span>
              ))
            ) : (
              months.map((month) => (
                <span key={month} className="transform -translate-x-1/2">
                  {month}
                </span>
              ))
            )}
          </div>

          {/* Heatmap Grid */}
          <div className="ml-8 mt-8 overflow-x-auto">
            {timeResolution === 'monthly' ? (
              /* Monthly View: 12 months × 24 hours */
              <div className="grid grid-cols-12 gap-1">
                {temperatureMatrix.map((monthData, monthIndex) => (
                  <div key={monthIndex} className="space-y-1">
                    {/* Hour cells */}
                    <div className="grid grid-rows-24 gap-px">
                      {monthData.map((temp, hourIndex) => (
                        <div
                          key={`${monthIndex}-${hourIndex}`}
                          className="group relative cursor-pointer transition-all duration-200 hover:scale-110 hover:z-10"
                          style={{
                            backgroundColor: getTemperatureColor(temp),
                            width: '100%',
                            height: '8px',
                            borderRadius: '1px'
                          }}
                          title={`${months[monthIndex]} ${hourIndex}:00 - ${temp.toFixed(1)}°C`}
                        >
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20">
                            <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600 whitespace-nowrap">
                              <div className="font-medium">{months[monthIndex]} {hourIndex}:00</div>
                              <div>{temp.toFixed(1)}°C</div>
                              {viewMode === 'comfort' && (
                                <div className="text-xs opacity-75">
                                  {temp < 18 ? '❄️ Cold Risk' : 
                                   temp < 20 ? '😬 Slightly Cool' :
                                   temp <= 26 ? '✅ Comfort Zone' : 
                                   temp <= 28 ? '😓 Warm Discomfort' : '🔥 Overheating'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Hourly View: 365 days × 24 hours - Performance Optimized with Transparent Grid Lines */
              <div className="flex gap-px min-w-max" style={{ width: '730px', height: '192px' }}>
                {temperatureMatrix.map((dayData, dayIndex) => (
                  <div key={dayIndex} className="flex flex-col gap-px" style={{ width: '2px' }}>
                    {dayData.map((temp, hourIndex) => (
                      <div
                        key={`${dayIndex}-${hourIndex}`}
                        style={{
                          backgroundColor: getTemperatureColor(temp),
                          width: '2px',
                          height: '8px'
                        }}
                        // No hover interactions or tooltips for maximum performance
                        // Transparent grid lines for proper month alignment
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-gray-600/30">
          {viewMode === 'dryBulb' ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Temperature Scale</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-400">{minTemp.toFixed(1)}°C</span>
                <div className="w-32 h-3 rounded bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500"></div>
                <span className="text-xs text-red-400">{maxTemp.toFixed(1)}°C</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-6">
              {Object.entries(comfortRanges).map(([key, range]) => (
                <div key={key} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: range.color }}
                  ></div>
                  <span className="text-xs text-gray-300">{range.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pedagogical Information */}
      <div className="mt-4 bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
        <h4 className="text-blue-200 font-semibold mb-2 flex items-center gap-2">
          <span>🎓</span>
          Understanding Annual Thermal Patterns
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-100">
          <div>
            <p className="mb-2">
              <strong>Performance & Resolution:</strong> Monthly view (288 cells) includes interactive tooltips and hover effects. 
              Hourly view (8,760 cells) is optimized for performance with simplified rendering.
            </p>
            <p className="mb-2">
              <strong>{timeResolution === 'monthly' ? 'Monthly View' : 'Hourly View'}:</strong> {
                timeResolution === 'monthly' 
                  ? 'Each column shows the average hourly temperature for that month. Interactive tooltips show detailed values.'
                  : 'Each thin column represents one specific day (365 total). Optimized for smooth performance with all 8,760 hourly data points.'
              }
            </p>
            <p>
              <strong>Daily Cycles:</strong> The vertical patterns show daily temperature rhythms - 
              cooler at the top (night) and warmer in the middle (afternoon).
            </p>
          </div>
          <div>
            <p className="mb-2">
              <strong>Seasonal Progression:</strong> Notice the smooth transition from winter cold (left) 
              to summer warmth (center) and back to winter (right).
            </p>
            <p className="mb-2">
              <strong>View Modes:</strong> Temperature mode shows actual values with color gradients, 
              while Comfort Zones highlight thermal stress periods for building design.
            </p>
            <p>
              <strong>Design Applications:</strong> Use monthly view for interactive analysis and hourly view 
              to identify weather patterns, peak loads, and opportunities for natural ventilation strategies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
