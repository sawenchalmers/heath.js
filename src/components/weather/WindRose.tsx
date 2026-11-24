import React, { useState, useMemo } from 'react';
import { WindRoseData } from '../../services/EPWParser';

interface HourlyWindData {
  windSpeed: number;
  windDirection: number;
  hour: number;
  day: number;
  month: number;
}

interface WindRoseProps {
  windRoseData: WindRoseData;
  avgWindSpeed: number;
  predominantDirection: number;
  hourlyWindData?: HourlyWindData[];
  // ✅ FIXED: Now receiving actual EPW hourly data for true seasonal wind roses
  // Seasonal wind roses are calculated directly from the raw EPW data points
  // No more artificial scaling or approximations!
}

// Constants, kept outside the component so its memoised calculations never see a new copy.
// Process seasonal wind data
const seasons = ['Winter', 'Spring', 'Summer', 'Autumn'];

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const seasonalMonths = [
  [11, 0, 1], // Winter: Dec, Jan, Feb
  [2, 3, 4],  // Spring: Mar, Apr, May
  [5, 6, 7],  // Summer: Jun, Jul, Aug
  [8, 9, 10]  // Autumn: Sep, Oct, Nov
];

export const WindRose: React.FC<WindRoseProps> = ({
  windRoseData,
  avgWindSpeed,
  hourlyWindData = []
}) => {
  const { directions } = windRoseData;
  const [viewMode, setViewMode] = useState<'windRose' | 'heatmap'>('windRose');
  
  // Enhanced color scale for different speed ranges with better contrast
  const speedColors = [
    '#1E40AF', // 0-2 m/s - deep blue
    '#0EA5E9', // 2-4 m/s - sky blue
    '#10B981', // 4-6 m/s - emerald
    '#F59E0B', // 6-8 m/s - amber
    '#EF4444', // 8-10 m/s - red
    '#A855F7', // 10-15 m/s - purple
    '#EC4899'  // 15+ m/s - pink
  ];

  // Create wind speed heatmap matrix [month][hour]
  const windSpeedMatrix = useMemo(() => {
    if (!hourlyWindData || hourlyWindData.length === 0) {
      // Fallback to synthetic data based on average wind speed
      return months.map((_, monthIndex) => {
        return Array.from({length: 24}, (_, hour) => {
          // Simulate daily wind speed variation
          const dailyVariation = 2 * Math.sin((hour - 10) * Math.PI / 12); // Peak at 4 PM
          const seasonalVariation = avgWindSpeed * (0.2 * Math.sin((monthIndex - 1) * Math.PI / 6)); // Seasonal variation
          return Math.max(0, avgWindSpeed + dailyVariation + seasonalVariation);
        });
      });
    }

    // Process real hourly data into monthly averages
    const matrix = Array(12).fill(null).map(() => Array(24).fill(0));
    const counts = Array(12).fill(null).map(() => Array(24).fill(0));
    
    hourlyWindData.forEach(point => {
      const monthIndex = point.month - 1; // Convert to 0-based
      const hourIndex = point.hour;
      
      if (monthIndex >= 0 && monthIndex < 12 && hourIndex >= 0 && hourIndex < 24) {
        matrix[monthIndex][hourIndex] += point.windSpeed;
        counts[monthIndex][hourIndex] += 1;
      }
    });
    
    // Calculate averages
    return matrix.map((monthData, monthIndex) => 
      monthData.map((speedSum, hourIndex) => 
        counts[monthIndex][hourIndex] > 0 
          ? speedSum / counts[monthIndex][hourIndex] 
          : avgWindSpeed
      )
    );
  }, [hourlyWindData, avgWindSpeed]);

  // Calculate seasonal statistics
  const seasonalStats = useMemo(() => {
    return seasons.map((season, seasonIndex) => {
      const monthsInSeason = seasonalMonths[seasonIndex];
      let totalSpeed = 0;
      let count = 0;
      
      monthsInSeason.forEach(monthIndex => {
        windSpeedMatrix[monthIndex].forEach(speed => {
          totalSpeed += speed;
          count++;
        });
      });
      
      return {
        season,
        avgSpeed: count > 0 ? totalSpeed / count : avgWindSpeed,
        monthsInSeason
      };
    });
  }, [windSpeedMatrix, avgWindSpeed]);

  // Memoized color calculation function for wind speed
  const getWindSpeedColor = useMemo(() => {
    const colorCache = new Map();
    const maxSpeed = Math.max(...windSpeedMatrix.flat());
    
    return (speed: number) => {
      const roundedSpeed = Math.round(speed * 2) / 2;
      
      if (colorCache.has(roundedSpeed)) {
        return colorCache.get(roundedSpeed);
      }
      
      const normalizedSpeed = Math.max(0, Math.min(1, speed / maxSpeed));
      
      let color: string;
      // Wind speed gradient: light blue (calm) -> blue -> green -> yellow -> red (strong)
      if (normalizedSpeed < 0.25) {
        const t = normalizedSpeed * 4;
        color = `rgb(${Math.round(173 + 82 * t)}, ${Math.round(216 + 39 * t)}, 255)`;
      } else if (normalizedSpeed < 0.5) {
        const t = (normalizedSpeed - 0.25) * 4;
        color = `rgb(${Math.round(255 - 139 * t)}, ${Math.round(255 - 70 * t)}, ${Math.round(255 - 129 * t)})`;
      } else if (normalizedSpeed < 0.75) {
        const t = (normalizedSpeed - 0.5) * 4;
        color = `rgb(${Math.round(116 + 139 * t)}, ${Math.round(185 + 70 * t)}, ${Math.round(126 - 126 * t)})`;
      } else {
        const t = (normalizedSpeed - 0.75) * 4;
        color = `rgb(255, ${Math.round(255 - 116 * t)}, 0)`;
      }
      
      colorCache.set(roundedSpeed, color);
      return color;
    };
  }, [windSpeedMatrix]);

  // Create seasonal wind roses data
  const seasonalWindRoses = useMemo(() => {
    // Now we always have access to the actual EPW hourly data!
    // No more artificial scaling - we calculate true seasonal wind roses from real data
    
    if (!hourlyWindData || hourlyWindData.length === 0) {
      // Fallback: if somehow no data is provided, return empty patterns
      return seasons.map(season => ({
        season,
        directions,
        frequencies: directions.map(() => Array(7).fill(0))
      }));
    }

    // Calculate true seasonal wind roses from actual EPW data
    const allSeasonalData = seasons.map((season, seasonIndex) => {
      const monthsInSeason = seasonalMonths[seasonIndex];
      const seasonalData = hourlyWindData.filter(point => 
        monthsInSeason.includes(point.month - 1)
      );
      
      // Process wind data for this season
      const seasonalFrequencies = Array(16).fill(null).map(() => Array(7).fill(0));
      let totalCount = 0;
      
      seasonalData.forEach(point => {
        const dirIndex = Math.floor(((point.windDirection + 11.25) % 360) / 22.5);
        const speedIndex = Math.min(6, Math.floor(point.windSpeed / 2));
        
        if (dirIndex >= 0 && dirIndex < 16 && speedIndex >= 0 && speedIndex < 7) {
          seasonalFrequencies[dirIndex][speedIndex]++;
          totalCount++;
        }
      });
      
      // Convert to percentages
      const normalizedFrequencies = seasonalFrequencies.map(dirFreqs =>
        dirFreqs.map(count => totalCount > 0 ? (count / totalCount) * 100 : 0)
      );
      
      return {
        season,
        directions,
        frequencies: normalizedFrequencies
      };
    });
    
    return allSeasonalData;
  }, [hourlyWindData, directions]);

  // Calculate global maximum frequency across all seasons for consistent scaling
  const globalMaxFrequency = useMemo(() => {
    const maxFreq = Math.max(...seasonalWindRoses.map(seasonData => 
      Math.max(...seasonData.frequencies.flat())
    ));
    // Ensure we have a reasonable maximum to prevent overflow
    return Math.max(maxFreq, 1);
  }, [seasonalWindRoses]);

  return (
    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-6 border border-gray-600/30 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <span className="text-2xl">🌪️</span>
          Seasonal Wind Analysis
        </h3>
        
        {/* View Mode Controls */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('windRose')}
            className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
              viewMode === 'windRose'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Wind Rose
          </button>
          <button
            onClick={() => setViewMode('heatmap')}
            className={`px-3 py-1 text-sm rounded transition-all duration-200 ${
              viewMode === 'heatmap'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Speed Heatmap
          </button>
        </div>
      </div>
      
      {/* Enhanced Statistics Grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {seasonalStats.map((stat, index) => (
          <div key={stat.season} className={`text-center p-3 rounded-lg border transition-colors duration-200 ${
            index === 0 ? 'bg-blue-900/30 border-blue-700/30 hover:bg-blue-900/40' :
            index === 1 ? 'bg-green-900/30 border-green-700/30 hover:bg-green-900/40' :
            index === 2 ? 'bg-yellow-900/30 border-yellow-700/30 hover:bg-yellow-900/40' :
            'bg-orange-900/30 border-orange-700/30 hover:bg-orange-900/40'
          }`}>
            <div className={`font-bold text-lg ${
              index === 0 ? 'text-blue-400' :
              index === 1 ? 'text-green-400' :
              index === 2 ? 'text-yellow-400' :
              'text-orange-400'
            }`}>
              {stat.avgSpeed.toFixed(1)} m/s
            </div>
            <div className={`text-sm font-medium ${
              index === 0 ? 'text-blue-300' :
              index === 1 ? 'text-green-300' :
              index === 2 ? 'text-yellow-300' :
              'text-orange-300'
            }`}>
              {stat.season}
            </div>
            <div className={`text-xs ${
              index === 0 ? 'text-blue-200' :
              index === 1 ? 'text-green-200' :
              index === 2 ? 'text-yellow-200' :
              'text-orange-200'
            }`}>
              {stat.monthsInSeason.map(m => months[m]).join('-')}
            </div>
          </div>
        ))}
      </div>

      {/* Conditional Content Based on View Mode */}
      {viewMode === 'windRose' ? (
        // Seasonal Wind Rose Grid - 4 in a row for cleaner layout
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {seasonalWindRoses.map((seasonData, seasonIndex) => (
              <div key={seasonData.season} className="bg-gray-900/50 rounded-lg border border-gray-600/30 p-4">
                <h4 className={`text-lg font-semibold mb-3 text-center ${
                  seasonIndex === 0 ? 'text-blue-300' :
                  seasonIndex === 1 ? 'text-green-300' :
                  seasonIndex === 2 ? 'text-yellow-300' :
                  'text-orange-300'
                }`}>
                  {seasonData.season}
                </h4>
                <div className="relative w-full">
                  <div className="aspect-square bg-gray-900/60 rounded-lg border border-gray-600/40 p-3">
                    <svg viewBox="0 0 280 280" className="w-full h-full">
                      {/* Background circles - simplified */}
                      <g className="stroke-gray-500 fill-none stroke-width-1 opacity-50">
                        <circle cx="140" cy="140" r="25" strokeDasharray="2,2" />
                        <circle cx="140" cy="140" r="50" strokeDasharray="3,2" />
                        <circle cx="140" cy="140" r="75" strokeDasharray="4,2" />
                        <circle cx="140" cy="140" r="100" strokeWidth="1.5" />
                      </g>
                      
                      {/* Scale labels - simplified */}
                      <g className="fill-gray-400 text-xs font-medium">
                        <text x="145" y="120" className="text-xs" textAnchor="start">{(globalMaxFrequency * 0.25).toFixed(1)}%</text>
                        <text x="145" y="95" className="text-xs" textAnchor="start">{(globalMaxFrequency * 0.5).toFixed(1)}%</text>
                        <text x="145" y="70" className="text-xs" textAnchor="start">{(globalMaxFrequency * 0.75).toFixed(1)}%</text>
                        <text x="145" y="45" className="text-xs font-bold" textAnchor="start">{globalMaxFrequency.toFixed(1)}%</text>
                      </g>
                      
                      {/* Wind frequency sectors */}
                      {seasonData.directions.map((direction, dirIndex) => {
                        const angle = (dirIndex * 22.5 - 90) * (Math.PI / 180);
                        let cumulativeLength = 0;
                        // Use global maximum frequency for consistent scaling across all seasons
                        const maxFreqForScaling = globalMaxFrequency;
                        const maxRadiusAvailable = 75; // Maximum radius available for wind data
                        
                        return (
                          <g key={direction}>
                            {seasonData.frequencies[dirIndex].map((freq, speedIndex) => {
                              if (freq === 0) return null;
                              
                              // Calculate normalized frequency with proper bounds
                              const normalizedFreq = Math.min((freq / maxFreqForScaling) * maxRadiusAvailable, maxRadiusAvailable);
                              const startRadius = cumulativeLength + 20;
                              
                              // Ensure we don't exceed the outer circle (radius 100)
                              const availableRadius = Math.max(0, 100 - startRadius);
                              const endRadius = startRadius + Math.min(normalizedFreq, availableRadius);
                              
                              const sectorWidth = 20 * (Math.PI / 180);
                              const startAngle = angle - sectorWidth / 2;
                              const endAngle = angle + sectorWidth / 2;
                              
                              const x1Start = 140 + startRadius * Math.cos(startAngle);
                              const y1Start = 140 + startRadius * Math.sin(startAngle);
                              const x1End = 140 + endRadius * Math.cos(startAngle);
                              const y1End = 140 + endRadius * Math.sin(startAngle);
                              
                              const x2Start = 140 + startRadius * Math.cos(endAngle);
                              const y2Start = 140 + startRadius * Math.sin(endAngle);
                              const x2End = 140 + endRadius * Math.cos(endAngle);
                              const y2End = 140 + endRadius * Math.sin(endAngle);
                              
                              const actualLength = endRadius - startRadius;
                              cumulativeLength += actualLength;
                              
                              const pathData = [
                                `M ${x1Start} ${y1Start}`,
                                `L ${x1End} ${y1End}`,
                                `A ${endRadius} ${endRadius} 0 0 1 ${x2End} ${y2End}`,
                                `L ${x2Start} ${y2Start}`,
                                `A ${startRadius} ${startRadius} 0 0 0 ${x1Start} ${y1Start}`,
                                'Z'
                              ].join(' ');
                              
                              return (
                                <path
                                  key={`${dirIndex}-${speedIndex}`}
                                  d={pathData}
                                  fill={speedColors[speedIndex]}
                                  stroke="rgba(255,255,255,0.2)"
                                  strokeWidth="0.5"
                                  opacity="0.85"
                                  className="hover:opacity-100 transition-opacity duration-200"
                                />
                              );
                            })}
                          </g>
                        );
                      })}

                      {/* Cardinal directions - simplified */}
                      {[
                        { dir: 'N', angle: 0 },
                        { dir: 'E', angle: 90 },
                        { dir: 'S', angle: 180 },
                        { dir: 'W', angle: 270 }
                      ].map(({ dir, angle }) => {
                        const radian = (angle - 90) * (Math.PI / 180);
                        const x = 140 + 120 * Math.cos(radian);
                        const y = 140 + 120 * Math.sin(radian);
                        
                        return (
                          <g key={dir}>
                            <circle
                              cx={x}
                              cy={y}
                              r="10"
                              fill="rgba(75, 85, 99, 0.8)"
                              stroke="rgb(156, 163, 175)"
                              strokeWidth="1"
                            />
                            <text
                              x={x}
                              y={y}
                              textAnchor="middle"
                              dominantBaseline="central"
                              className="text-xs font-bold fill-white"
                            >
                              {dir}
                            </text>
                          </g>
                        );
                      })}

                      {/* Center - simplified */}
                      <circle cx="140" cy="140" r="10" fill="rgba(75, 85, 99, 0.9)" stroke="rgb(156, 163, 175)" strokeWidth="1" />
                      <text x="140" y="160" textAnchor="middle" className="fill-gray-400 text-xs font-medium">
                        Calm
                      </text>
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Wind Speed Heatmap
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

            {/* X-axis labels (Months) */}
            <div className="absolute -top-8 left-8 right-0 flex justify-between text-xs text-gray-400">
              {months.map((month) => (
                <span key={month} className="transform -translate-x-1/2">
                  {month}
                </span>
              ))}
            </div>

            {/* Heatmap Grid */}
            <div className="ml-8 mt-8 overflow-x-auto">
              <div className="grid grid-cols-12 gap-1">
                {windSpeedMatrix.map((monthData, monthIndex) => (
                  <div key={monthIndex} className="space-y-1">
                    <div className="grid grid-rows-24 gap-px">
                      {monthData.map((speed, hourIndex) => (
                        <div
                          key={`${monthIndex}-${hourIndex}`}
                          className="group relative cursor-pointer transition-all duration-200 hover:scale-110 hover:z-10"
                          style={{
                            backgroundColor: getWindSpeedColor(speed),
                            width: '100%',
                            height: '8px',
                            borderRadius: '1px'
                          }}
                          title={`${months[monthIndex]} ${hourIndex}:00 - ${speed.toFixed(1)} m/s`}
                        >
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20">
                            <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600 whitespace-nowrap">
                              <div className="font-medium">{months[monthIndex]} {hourIndex}:00</div>
                              <div>Wind Speed: {speed.toFixed(1)} m/s</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Heatmap Legend */}
          <div className="mt-6 pt-4 border-t border-gray-600/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Wind Speed Scale</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-400">0 m/s</span>
                <div className="w-32 h-3 rounded bg-gradient-to-r from-blue-300 via-green-500 via-yellow-500 to-red-500"></div>
                <span className="text-xs text-red-400">{Math.max(...windSpeedMatrix.flat()).toFixed(1)} m/s</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend for Wind Rose */}
      {viewMode === 'windRose' && (
        <div className="mt-6 space-y-4">
          <div className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
            <span className="text-lg">💨</span>
            Wind Speed Classifications
          </div>
          <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 text-sm">
            {speedColors.map((color, index) => {
              const speedRange = getSpeedLabel(index);
              const beaufortScale = getBeaufortScale(index);
              return (
                <div key={index} className="flex items-center space-x-2 p-2 bg-gray-700/40 rounded-lg border border-gray-600/40 hover:bg-gray-700/60 transition-colors duration-200">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-gray-400/50 shadow-sm flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-200 font-medium text-xs">{speedRange} m/s</div>
                    <div className="text-gray-400 text-xs truncate">{beaufortScale}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pedagogical Information - Seasonal Wind */}
      <div className="mt-6 bg-cyan-900/20 border border-cyan-700/30 rounded-lg p-4">
        <h4 className="text-cyan-200 font-semibold mb-2 flex items-center gap-2">
          <span>🧭</span>
          Seasonal Wind Insights for Climate-Responsive Design
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-cyan-100">
          <div>
            <p className="mb-2">
              <strong>Wind Rose by Season:</strong> Reveals how dominant wind directions shift throughout the year. 
              Architects can use this to orient buildings for passive ventilation in summer while shielding against winter winds.
            </p>
            <p className="mb-2">
              <strong>Example Design Use:</strong> Position balconies on leeward side in winter (Dec–Feb), 
              while placing operable windows toward summer breezes (Jun–Aug).
            </p>
            <p>
              <strong>Standards Reference:</strong> Boverket guidelines emphasize wind resilience in detailing, roof geometry, 
              and façade materials — especially for exposed sites.
            </p>
          </div>
          <div>
            <p className="mb-2">
              <strong>Wind Speed Heatmap:</strong> Shows when wind is strongest throughout the day and year. 
              Useful for identifying natural ventilation windows and calm periods where mechanical systems dominate.
            </p>
            <p className="mb-2">
              <strong>Seasonal Comfort Strategy:</strong>  
              - Use high daytime winds in spring/summer for stack ventilation  
              - Consider wind breaks or vestibules in winter for comfort.
            </p>
            <p>
              <strong>Design Integration:</strong> Link wind patterns with air quality, roof uplift risk, and vegetation placement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function getSpeedLabel(index: number): string {
  const labels = ['0-2', '2-4', '4-6', '6-8', '8-10', '10-15', '15+'];
  return labels[index] || '';
}

function getBeaufortScale(index: number): string {
  const scales = [
    'Light air',
    'Light breeze', 
    'Gentle breeze',
    'Moderate breeze',
    'Fresh breeze',
    'Strong breeze',
    'Near gale+'
  ];
  return scales[index] || '';
}
