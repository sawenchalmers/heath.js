import React, { useState } from 'react';

interface HourlyTemperatureData {
  temperature: number;
  month: number;
  day: number;
  hour: number;
}

interface DegreeDaysChartProps {
  hourlyTemperatures: HourlyTemperatureData[];
  comfortTemp: number;
  heatingDegreeDays: number;
  coolingDegreeDays: number;
  onComfortTempChange: (temp: number) => void;
}

export const DegreeDaysChart: React.FC<DegreeDaysChartProps> = ({
  hourlyTemperatures,
  comfortTemp,
  onComfortTempChange
}) => {
  const [inputTemp, setInputTemp] = useState(comfortTemp.toString());
  const [showDegreeHours, setShowDegreeHours] = useState(false);
  const [monthlyHoursCollapsed, setMonthlyHoursCollapsed] = useState(true);

  const handleTempChange = (value: string) => {
    setInputTemp(value);
    const temp = parseFloat(value);
    if (!isNaN(temp) && temp >= 10 && temp <= 35) {
      onComfortTempChange(temp);
    }
  };

  // Ensure we have exactly 8760 hours of data (one full year)
  const validHourlyData = hourlyTemperatures.slice(0, 8760);
  
  // Calculate heating and cooling hours - count hours outside comfort temperature
  const hourlyDegreeData = validHourlyData.map((hourData, index) => {
    const temp = hourData.temperature;
    
    let heatingDD = 0;
    let coolingDD = 0;
    let heatingHour = 0;
    let coolingHour = 0;
    
    // Calculate degree-hours: temperature difference for each hour
    if (temp < comfortTemp) {
      heatingDD = comfortTemp - temp; // Degree-hours for heating
      heatingHour = 1; // Count this hour as needing heating
    } else if (temp > comfortTemp) {
      coolingDD = temp - comfortTemp; // Degree-hours for cooling
      coolingHour = 1; // Count this hour as needing cooling
    }
    
    return {
      hour: index,
      day: hourData.day,
      month: hourData.month,
      temperature: temp,
      heatingDD,
      coolingDD,
      heatingHour,
      coolingHour
    };
  });

  // Aggregate hourly data into daily data for visualization
  const dailyData = Array.from({ length: 365 }, (_, dayIndex) => {
    const dayOfYear = dayIndex + 1;
    const month = Math.floor(dayOfYear / 30.4) + 1; // Approximate month
    
    // Find all hours for this day (24 hours per day)
    const startHour = dayIndex * 24;
    const endHour = Math.min(startHour + 24, hourlyDegreeData.length);
    const dayHours = hourlyDegreeData.slice(startHour, endHour);
    
    // Sum the degree-hours for this day to get degree-days
    const dailyHeatingDD = dayHours.reduce((sum, h) => sum + h.heatingDD, 0); // Sum all degree-hours
    const dailyCoolingDD = dayHours.reduce((sum, h) => sum + h.coolingDD, 0); // Sum all degree-hours
    const avgTemp = dayHours.reduce((sum, h) => sum + h.temperature, 0) / dayHours.length;
    
    return {
      day: dayOfYear,
      month,
      temperature: avgTemp,
      heatingDD: dailyHeatingDD, // Degree-days for this day
      coolingDD: dailyCoolingDD  // Degree-days for this day
    };
  });

  // Find max values for scaling
  const maxHeatingDD = Math.max(...dailyData.map(d => d.heatingDD));
  const maxCoolingDD = Math.max(...dailyData.map(d => d.coolingDD));
  const maxDD = Math.max(maxHeatingDD, maxCoolingDD);

  // Calculate monthly totals
  const monthlyTotals = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthData = dailyData.filter(d => Math.floor((d.day - 1) / 30.4) === monthIndex);
    return {
      month: monthIndex + 1,
      heatingDDs: monthData.reduce((sum, d) => sum + d.heatingDD, 0),
      coolingDDs: monthData.reduce((sum, d) => sum + d.coolingDD, 0)
    };
  });

  // Calculate monthly hours and degree hours
  const monthlyHours = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthHours = hourlyDegreeData.filter(h => {
      const dayOfYear = Math.floor(h.hour / 24) + 1;
      const monthOfHour = Math.floor((dayOfYear - 1) / 30.4);
      return monthOfHour === monthIndex;
    });
    return {
      month: monthIndex + 1,
      heatingHours: monthHours.reduce((sum, h) => sum + h.heatingHour, 0),
      coolingHours: monthHours.reduce((sum, h) => sum + h.coolingHour, 0),
      heatingDegreeHours: monthHours.reduce((sum, h) => sum + h.heatingDD, 0),
      coolingDegreeHours: monthHours.reduce((sum, h) => sum + h.coolingDD, 0)
    };
  });

  const totalHeatingDDs = monthlyTotals.reduce((sum, m) => sum + m.heatingDDs, 0); // Sum of all degree-days
  const totalCoolingDDs = monthlyTotals.reduce((sum, m) => sum + m.coolingDDs, 0); // Sum of all degree-days

  // Calculate total heating and cooling hours and degree hours
  const totalHeatingHours = hourlyDegreeData.reduce((sum, h) => sum + h.heatingHour, 0);
  const totalCoolingHours = hourlyDegreeData.reduce((sum, h) => sum + h.coolingHour, 0);
  const totalHeatingDegreeHours = hourlyDegreeData.reduce((sum, h) => sum + h.heatingDD, 0);
  const totalCoolingDegreeHours = hourlyDegreeData.reduce((sum, h) => sum + h.coolingDD, 0);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 rounded-xl p-6 border border-gray-600/40 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <span className="text-2xl">📊</span>
          Heating and Cooling Analysis
        </h3>
        
        <div className="flex items-center gap-6">
          {/* Toggle for Hours vs Degree Hours */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-300">
              Display Mode:
            </label>
            <button
              onClick={() => setShowDegreeHours(!showDegreeHours)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                showDegreeHours 
                  ? 'bg-orange-600 text-white shadow-lg' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {showDegreeHours ? 'Degree Hours' : 'Hour Counts'}
            </button>
          </div>

          {/* Comfort Temperature Control */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-300">
              Comfort Temperature:
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="35"
                step="0.5"
                value={inputTemp}
                onChange={(e) => handleTempChange(e.target.value)}
                className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer
                         [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                         [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((parseFloat(inputTemp) - 10) / 25) * 100}%, #374151 ${((parseFloat(inputTemp) - 10) / 25) * 100}%, #374151 100%)`
                }}
              />
              <div className="text-white font-medium text-sm min-w-[3rem]">
                {inputTemp}°C
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Summary Statistics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-3 bg-gradient-to-br from-red-900/50 to-red-800/30 rounded-lg border border-red-700/50 hover:from-red-900/60 hover:to-red-800/40 transition-all duration-200">
          <div className="text-red-400 font-bold text-lg">
            {showDegreeHours ? totalHeatingDegreeHours.toFixed(0) : totalHeatingHours}
          </div>
          <div className="text-red-300 text-xs font-medium">
            {showDegreeHours ? 'Heating Degree Hours' : 'Heating Hours'}
          </div>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-green-900/50 to-green-800/30 rounded-lg border border-green-700/50 hover:from-green-900/60 hover:to-green-800/40 transition-all duration-200">
          <div className="text-green-400 font-bold text-lg">{comfortTemp}°C</div>
          <div className="text-green-300 text-xs font-medium">Comfort Temperature</div>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-lg border border-blue-700/50 hover:from-blue-900/60 hover:to-blue-800/40 transition-all duration-200">
          <div className="text-blue-400 font-bold text-lg">
            {showDegreeHours ? totalCoolingDegreeHours.toFixed(0) : totalCoolingHours}
          </div>
          <div className="text-blue-300 text-xs font-medium">
            {showDegreeHours ? 'Cooling Degree Hours' : 'Cooling Hours'}
          </div>
        </div>
      </div>

      {/* Wide Daily Degree Days Chart */}
      <div className="relative h-96 bg-gray-900/60 rounded-lg border border-gray-600/40 p-2 mb-6">
        <div className="absolute inset-2">
          <svg width="100%" height="100%" viewBox="0 0 1200 360" className="overflow-visible">
            {/* Background grid */}
            <defs>
              <pattern id="grid" width="100" height="25" patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 25" fill="none" stroke="rgb(75, 85, 99)" strokeWidth="0.5" opacity="0.3"/>
              </pattern>
            </defs>
            <rect width="1200" height="320" fill="url(#grid)" />
            
            {/* Zero line */}
            <line x1="0" y1="160" x2="1200" y2="160" stroke="rgb(156, 163, 175)" strokeWidth="2" opacity="0.8" />
            
            {/* Month labels */}
            {months.map((month, index) => (
              <text
                key={month}
                x={index * 100 + 50}
                y="340"
                textAnchor="middle"
                className="fill-gray-400 text-xs font-medium"
              >
                {month}
              </text>
            ))}
            
            {/* Y-axis labels */}
            <text x="-5" y="25" textAnchor="end" className="fill-gray-400 text-xs">+{maxDD.toFixed(0)}</text>
            <text x="-5" y="165" textAnchor="end" className="fill-gray-400 text-xs">0</text>
            <text x="-5" y="305" textAnchor="end" className="fill-gray-400 text-xs">-{maxDD.toFixed(0)}</text>
            
            {/* Area plots for heating and cooling degree days */}
            {(() => {
              // Create path data for heating degree days (below zero line)
              const heatingPath = dailyData.map((data, index) => {
                const x = index * (1200 / dailyData.length);
                const y = 160 + (data.heatingDD / maxDD) * 140;
                return `${x},${y}`;
              }).join(' L');
              
              // Create path data for cooling degree days (above zero line)  
              const coolingPath = dailyData.map((data, index) => {
                const x = index * (1200 / dailyData.length);
                const y = 160 - (data.coolingDD / maxDD) * 140;
                return `${x},${y}`;
              }).join(' L');
              
              return (
                <g>
                  {/* Heating degree days area (red, below zero) */}
                  <path
                    d={`M0,160 L${heatingPath} L1200,160 Z`}
                    fill="rgb(239, 68, 68)"
                    fillOpacity="0.7"
                    stroke="rgb(220, 38, 38)"
                    strokeWidth="1.5"
                  />
                  
                  {/* Cooling degree days area (blue, above zero) */}
                  <path
                    d={`M0,160 L${coolingPath} L1200,160 Z`}
                    fill="rgb(59, 130, 246)"
                    fillOpacity="0.7"
                    stroke="rgb(37, 99, 235)"
                    strokeWidth="1.5"
                  />
                  
                  {/* Interactive points for tooltips */}
                  {dailyData.map((data, index) => {
                    const x = index * (1200 / dailyData.length);
                    const heatingY = 160 + (data.heatingDD / maxDD) * 140;
                    const coolingY = 160 - (data.coolingDD / maxDD) * 140;
                    
                    return (
                      <g key={index}>
                        {data.heatingDD > 0 && (
                          <circle
                            cx={x}
                            cy={heatingY}
                            r="2"
                            fill="rgb(239, 68, 68)"
                            opacity="0"
                            className="hover:opacity-100 cursor-pointer"
                          >
                            <title>Day {data.day}: {data.heatingDD.toFixed(1)} HDD</title>
                          </circle>
                        )}
                        {data.coolingDD > 0 && (
                          <circle
                            cx={x}
                            cy={coolingY}
                            r="2"
                            fill="rgb(59, 130, 246)"
                            opacity="0"
                            className="hover:opacity-100 cursor-pointer"
                          >
                            <title>Day {data.day}: {data.coolingDD.toFixed(1)} CDD</title>
                          </circle>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </svg>
        </div>
        
        {/* Chart labels */}
        <div className="absolute top-4 left-6 text-sm text-blue-400 font-medium">CDD</div>
        <div className="absolute bottom-4 left-6 text-sm text-red-400 font-medium">HDD</div>
      </div>

      {/* Monthly Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
            <span className="text-lg">📅</span>
            {showDegreeHours ? 'Monthly Degree Hours' : 'Monthly Hours'}
          </div>
          <button
            onClick={() => setMonthlyHoursCollapsed(!monthlyHoursCollapsed)}
            className="flex items-center gap-2 px-3 py-1 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg transition-colors duration-200 text-sm font-medium text-gray-300"
          >
            <span>{monthlyHoursCollapsed ? 'Show' : 'Hide'} Details</span>
            <span className={`transform transition-transform duration-200 ${monthlyHoursCollapsed ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
        </div>
        
        {!monthlyHoursCollapsed && (
          <>
            <div className="grid grid-cols-4 gap-3">
              {monthlyHours.map((monthly, index) => {
                const heatingValue = showDegreeHours ? monthly.heatingDegreeHours : monthly.heatingHours;
                const coolingValue = showDegreeHours ? monthly.coolingDegreeHours : monthly.coolingHours;
                const maxMonthlyValue = Math.max(
                  ...monthlyHours.map(m => Math.max(
                    showDegreeHours ? m.heatingDegreeHours : m.heatingHours,
                    showDegreeHours ? m.coolingDegreeHours : m.coolingHours
                  ))
                );
                const heatingWidth = (heatingValue / maxMonthlyValue) * 100;
                const coolingWidth = (coolingValue / maxMonthlyValue) * 100;
            
            return (
              <div key={index} className="p-3 bg-gray-700/40 rounded-lg border border-gray-600/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-gray-300 font-medium">{months[index]}</div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-red-400">
                        {showDegreeHours ? `${heatingValue.toFixed(0)}°h` : `${heatingValue}h`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-blue-400">
                        {showDegreeHours ? `${coolingValue.toFixed(0)}°h` : `${coolingValue}h`}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Horizontal bar chart */}
                <div className="space-y-1">
                  {/* Heating bar */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 text-xs text-red-400">Heat</div>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div 
                        className="bg-red-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${heatingWidth}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  {/* Cooling bar */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 text-xs text-blue-400">Cool</div>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${coolingWidth}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-red-400">
              {showDegreeHours ? 'Heating Degree Hours' : 'Heating Hours'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-blue-400">
              {showDegreeHours ? 'Cooling Degree Hours' : 'Cooling Hours'}
            </span>
          </div>
        </div>
        
        {/* Debug Information */}
        <div className="mt-4 p-3 bg-gray-800/60 rounded-lg border border-gray-600/40">
          <div className="text-xs text-gray-400 space-y-1">
            <div>Data Points: {validHourlyData.length} hours ({Math.floor(validHourlyData.length / 24)} days)</div>
            <div>Calculated HDD: {totalHeatingDDs.toFixed(0)} | Calculated CDD: {totalCoolingDDs.toFixed(0)}</div>
            <div>Heating Hours: {totalHeatingHours} | Cooling Hours: {totalCoolingHours}</div>
            <div>Heating Degree Hours: {totalHeatingDegreeHours.toFixed(0)} | Cooling Degree Hours: {totalCoolingDegreeHours.toFixed(0)}</div>
            <div>Current Mode: {showDegreeHours ? 'Degree Hours (energy intensity)' : 'Hour Counts (time duration)'}</div>
          </div>
        </div>
          </>
        )}

        {/* Pedagogical Information */}
        <div className="mt-4 bg-orange-900/20 border border-orange-700/30 rounded-lg p-4">
          <h4 className="text-orange-200 font-semibold mb-2 flex items-center gap-2">
            <span>🎓</span>
            Understanding Heating & Cooling Analysis for Building Design
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-orange-100">
            <div>
              <p className="mb-2">
                <strong>What This Analysis Shows:</strong> The summary cards and monthly breakdown display either {showDegreeHours ? 'degree hours (energy intensity - temperature difference × time)' : 'hour counts (simple time duration)'} 
                when {showDegreeHours ? 'heating or cooling energy is needed' : 'outdoor temperatures require heating or cooling to maintain comfort'}. 
                The main area chart always shows degree days (HDD/CDD) which measure daily energy intensity.
              </p>
              <p className="mb-2">
                <strong>Two Analysis Modes:</strong> Toggle between <em>Hour Counts</em> (time-based: how many hours need heating/cooling) and <em>Degree Hours</em> (energy-based: temperature difference × time, measuring energy intensity).
              </p>
              <p className="mb-2">
                <strong>Swedish Building Context:</strong> According to <a href="https://www.boverket.se/" target="_blank" className="underline text-orange-300">Boverket</a>, 
                residential buildings should maintain 18-22°C. Commercial buildings typically target 20-26°C for optimal comfort and productivity.
              </p>
              <p>
                <strong>Reading the Data:</strong> The monthly breakdown shows {showDegreeHours ? 'degree hours for each month, indicating energy intensity requirements' : 'hour counts for each month, showing duration of heating/cooling needs'}. 
                Use this data to size HVAC systems and plan energy strategies.
              </p>
            </div>
            <div>
              <p className="mb-2">
                <strong>Design Applications:</strong> {showDegreeHours ? 'High degree hour values indicate intense energy needs' : 'High hour counts indicate extended periods of energy use'} - 
                suggesting needs for better insulation, passive solar gains, heat recovery systems, natural ventilation, shading, or thermal mass.
              </p>
              <p className="mb-2">
                <strong>Analysis Comparison:</strong> Hour counts show <em>duration</em> (useful for system runtime and maintenance planning), while degree hours show <em>energy intensity</em> (useful for sizing and energy cost estimation).
              </p>
              <p className="mb-2">
                <strong>Comfort Temperature Impact:</strong> Adjusting the comfort setpoint by 1-2°C can significantly reduce both metrics. 
                Each degree change can affect 10-15% of annual heating/cooling demand in Swedish climates.
              </p>
              <p>
                <strong>Seasonal Strategy:</strong> The interactive controls help evaluate adaptive comfort strategies - 
                allowing wider temperature ranges during mild seasons while maintaining strict comfort during extreme weather.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
