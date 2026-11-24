import React, { useState, useRef } from 'react';
import { EPWParser, EPWProcessedData, ComfortAnalysis, WindRoseData } from '../services/EPWParser';
import { TemperatureChart } from './weather/TemperatureChart';
import { HumidityChart } from './weather/HumidityChart';
import { WindRose } from './weather/WindRose';
import { DegreeDaysChart } from './weather/DegreeDaysChart';
import { swedishCities, SwedishCity } from '../data/swedishCities';
import { PROXIED_SERVICES } from '../services/proxiedServices';
import { proxyUrl } from '../services/proxyUrl';
import { hasSeenWeatherTour, rememberWeatherTourSeen } from '../utils/weatherTourMemory';

// Tour step definitions
interface TourStep {
  id: string;
  title: string;
  content: string;
  targetElement?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
  keyTerms?: { term: string; definition: string }[];
}

// Glossary of technical terms
const glossaryTerms: { [key: string]: string } = {
  'EPW': 'EnergyPlus Weather - A standardized weather data format containing hourly weather information for building energy simulations.',
  'TMY': 'Typical Meteorological Year - A dataset containing weather information for a "typical" year, created by selecting the most representative months from a multi-year dataset.',
  'Degree Days': 'A measure of heating or cooling demand. Calculated as the difference between the daily average temperature and a base temperature (usually comfort temperature).',
  'Heating Degree Days': 'The number of degrees per day that the average temperature is below the heating base temperature. Used to estimate heating energy requirements.',
  'Cooling Degree Days': 'The number of degrees per day that the average temperature is above the cooling base temperature. Used to estimate cooling energy requirements.',
  'Dry Bulb Temperature': 'The temperature of air measured by a thermometer freely exposed to the air but shielded from radiation and moisture.',
  'Relative Humidity': 'The amount of moisture in the air compared to the maximum amount the air can hold at that temperature, expressed as a percentage.',
  'Wind Rose': 'A graphical tool used to show the frequency of winds blowing from various directions and their speeds at a specific location.',
  'HVAC': 'Heating, Ventilation, and Air Conditioning - Systems used to provide thermal comfort and indoor air quality.',
  'Building Envelope': 'The physical separator between the interior and exterior environments, including walls, roof, windows, and doors.',
  'Thermal Comfort': 'The condition of mind that expresses satisfaction with the thermal environment, typically between 20-24°C for most people.',
  'Solar Radiation': 'Energy from the sun that affects building heating and cooling loads, and can be used for passive heating strategies.'
};

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Weather Data Analysis',
    content: 'This tool helps you analyze climate data for building performance. Weather data is crucial for understanding how buildings perform in different climates.',
    position: 'bottom',
    keyTerms: [
      { term: 'EPW', definition: glossaryTerms['EPW'] },
      { term: 'TMY', definition: glossaryTerms['TMY'] }
    ]
  },
  {
    id: 'location-selection',
    title: 'Step 1: Choose Your Location',
    content: 'Start by selecting a Swedish city or uploading your own EPW weather file. Each location has different climate characteristics that affect building energy needs.',
    targetElement: 'current-location',
    position: 'bottom',
    keyTerms: [
      { term: 'EPW', definition: glossaryTerms['EPW'] },
      { term: 'Climate Data', definition: 'Long-term weather patterns and statistics for a specific location, used for building design and energy analysis.' }
    ]
  },
  {
    id: 'city-grid',
    title: 'Quick Location Selection',
    content: 'Click on any Swedish city to load its weather data. Notice how cities at different latitudes have varying temperature patterns.',
    targetElement: 'city-grid',
    position: 'top',
    keyTerms: [
      { term: 'Latitude', definition: 'Geographic coordinate that affects solar radiation and temperature patterns. Higher latitudes generally have cooler climates.' }
    ]
  },
  {
    id: 'temperature-analysis',
    title: 'Step 2: Temperature Analysis',
    content: 'The temperature chart shows monthly averages and annual statistics. This helps understand heating and cooling needs throughout the year.',
    targetElement: 'temperature-chart',
    position: 'top',
    keyTerms: [
      { term: 'Dry Bulb Temperature', definition: glossaryTerms['Dry Bulb Temperature'] },
      { term: 'Thermal Comfort', definition: glossaryTerms['Thermal Comfort'] }
    ]
  },
  {
    id: 'degree-days',
    title: 'Step 3: Degree Days Analysis',
    content: 'Degree days measure how much heating or cooling is needed. Adjust the comfort temperature to see how it affects energy requirements.',
    targetElement: 'degree-days-chart',
    position: 'top',
    keyTerms: [
      { term: 'Degree Days', definition: glossaryTerms['Degree Days'] },
      { term: 'Heating Degree Days', definition: glossaryTerms['Heating Degree Days'] },
      { term: 'Cooling Degree Days', definition: glossaryTerms['Cooling Degree Days'] }
    ]
  },
  {
    id: 'humidity-analysis',
    title: 'Step 4: Humidity Analysis',
    content: 'Humidity affects comfort and building systems. High humidity can lead to condensation issues, while low humidity can cause discomfort.',
    targetElement: 'humidity-chart',
    position: 'top',
    keyTerms: [
      { term: 'Relative Humidity', definition: glossaryTerms['Relative Humidity'] },
      { term: 'Condensation', definition: 'Water vapor that turns into liquid when it contacts a surface cooler than the dew point, potentially causing building damage.' }
    ]
  },
  {
    id: 'wind-analysis',
    title: 'Step 5: Wind Analysis',
    content: 'Wind direction and speed affect building ventilation and heat loss. The wind rose shows prevailing wind patterns throughout the year.',
    targetElement: 'wind-rose',
    position: 'top',
    keyTerms: [
      { term: 'Wind Rose', definition: glossaryTerms['Wind Rose'] },
      { term: 'Prevailing Winds', definition: 'The most common wind direction for a location, important for building orientation and natural ventilation design.' }
    ]
  },
  {
    id: 'complete',
    title: 'Tour Complete!',
    content: 'You now understand how to analyze weather data for building performance. Try different locations and compare their climate characteristics.',
    position: 'bottom'
  }
];

export const WeatherAndLocationTab: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedLocation, setSelectedLocation] = useState<SwedishCity>({
    city: 'Gothenburg',
    region: 'Västra Götaland',
    latitude: 57.66300,
    longitude: 12.28000,
    timezone: 'Europe/Stockholm',
    zipUrl: 'https://climate.onebuilding.org/WMO_Region_6_Europe/SWE_Sweden/VG_Vastra_Gotaland/SWE_VG_Goteborg.City.AP.025120_TMYx.2009-2023.zip',
    epwFileName: 'SWE_VG_Goteborg.City.AP.025120_TMYx.2009-2023.epw'
  });

  const [weatherData, setWeatherData] = useState<EPWProcessedData | null>(null);
  const [comfortAnalysis, setComfortAnalysis] = useState<ComfortAnalysis | null>(null);
  const [windRoseData, setWindRoseData] = useState<WindRoseData | null>(null);
  const [comfortTemp, setComfortTemp] = useState(21);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCacheInfo, setShowCacheInfo] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<{ count: number; totalSize: number; entries: Array<{ fileName: string; timestamp: Date; size: number }> }>({ count: 0, totalSize: 0, entries: [] });

  // Tour state
  const [currentTourStep, setCurrentTourStep] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [tourStarted, setTourStarted] = useState(hasSeenWeatherTour);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showStepTerms, setShowStepTerms] = useState(false);

  // Tour functions
  const startTour = () => {
    setCurrentTourStep(0);
    setShowSidebar(true);
    setTourStarted(true);
    rememberWeatherTourSeen();
  };

  const nextTourStep = () => {
    if (currentTourStep < tourSteps.length - 1) {
      setCurrentTourStep(currentTourStep + 1);
      // Scroll to the target element if it exists
      const nextStep = tourSteps[currentTourStep + 1];
      if (nextStep.targetElement) {
        setTimeout(() => {
          const element = document.getElementById(nextStep.targetElement!);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    } else {
      endTour();
    }
  };

  const prevTourStep = () => {
    if (currentTourStep > 0) {
      setCurrentTourStep(currentTourStep - 1);
      // Scroll to the target element if it exists
      const prevStep = tourSteps[currentTourStep - 1];
      if (prevStep.targetElement) {
        setTimeout(() => {
          const element = document.getElementById(prevStep.targetElement!);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  };

  const endTour = () => {
    setCurrentTourStep(0);
    setShowSidebar(false);
  };

  const skipTour = () => {
    setTourStarted(true);
    setShowSidebar(false);
    rememberWeatherTourSeen();
  };

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  const getCurrentStep = () => tourSteps[currentTourStep];
  const getCompletedSteps = () => tourSteps.slice(0, currentTourStep);
  const getUpcomingSteps = () => tourSteps.slice(currentTourStep + 1);

  // Helper function to check if current step targets a specific element
  const isCurrentStepTarget = (elementId: string) => {
    return tourStarted && getCurrentStep().targetElement === elementId;
  };

  // Helper function to get step color based on progress
  const getStepColor = (stepIndex: number) => {
    const progress = (stepIndex + 1) / tourSteps.length;
    if (stepIndex < currentTourStep) {
      return 'from-green-900/50 to-green-800/50 border-green-500/50'; // Completed
    } else if (stepIndex === currentTourStep) {
      // Color progression from orange to green based on overall progress
      if (progress < 0.3) {
        return 'from-orange-900/50 to-orange-800/50 border-orange-500/50'; // Early steps
      } else if (progress < 0.7) {
        return 'from-yellow-900/50 to-yellow-800/50 border-yellow-500/50'; // Middle steps  
      } else {
        return 'from-blue-900/50 to-blue-800/50 border-blue-500/50'; // Near completion
      }
    } else {
      return 'from-gray-900/50 to-gray-800/50 border-gray-600/50'; // Not reached yet
    }
  };

  // Helper function to get step indicator color
  const getStepIndicatorColor = (stepIndex: number) => {
    if (stepIndex < currentTourStep) {
      return 'bg-green-400'; // Completed
    } else if (stepIndex === currentTourStep) {
      const progress = (stepIndex + 1) / tourSteps.length;
      if (progress < 0.3) return 'bg-orange-400'; 
      else if (progress < 0.7) return 'bg-yellow-400';
      else return 'bg-blue-400';
    } else {
      return 'bg-gray-500'; // Not reached yet
    }
  };

  // Glossary tooltip component
  const GlossaryTerm: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const definition = glossaryTerms[term];
    
    if (!definition) return <>{children}</>;
    
    return (
      <span 
        className="relative inline-block"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span className="border-b border-dotted border-cyan-400 cursor-help text-cyan-300">
          {children}
        </span>
        {showTooltip && (
          <div className="absolute z-50 w-64 p-3 bg-gray-900 border border-cyan-500/50 rounded-lg shadow-xl 
                         bottom-full left-1/2 transform -translate-x-1/2 mb-2">
            <div className="text-cyan-300 text-xs font-medium mb-1">{term}</div>
            <div className="text-gray-300 text-xs leading-relaxed">{definition}</div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 
                           border-l-4 border-r-4 border-t-4 border-transparent border-t-cyan-500/50"></div>
          </div>
        )}
      </span>
    );
  };

  const loadWeatherData = async (location: SwedishCity) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`Loading weather data for ${location.city}`);
      
      // Always route through <base path>proxy/climate/ to avoid CORS: the Vite proxy forwards it in dev,
      // the container's nginx in production. Under the base path, so it works when served under /heath/.
      const zipUrl = location.zipUrl.replace(PROXIED_SERVICES.climate, proxyUrl('climate'));
      
      // Use EPWParser's cached remote ZIP method
      const data = await EPWParser.parseEPWFromRemoteZip(zipUrl, location.epwFileName);
      
      setWeatherData(data);
      
      // Calculate comfort analysis
      const comfort = EPWParser.calculateComfortAnalysis(data.hourlyData, comfortTemp);
      setComfortAnalysis(comfort);
      
      // Generate wind rose data
      const windRose = EPWParser.generateWindRoseData(data.hourlyData);
      setWindRoseData(windRose);
      
      // Update cache info for status display
      updateCacheInfo();
      
    } catch (err) {
      console.error('Failed to load weather data:', err);
      if (err instanceof Error && err.message.includes('quota')) {
        setError(`Storage limit reached. ${err.message}. Try clearing the cache or using a smaller EPW file.`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load weather data');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationSelect = async (location: SwedishCity) => {
    setSelectedLocation(location);
    await loadWeatherData(location);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.epw')) {
      setError('Please select a valid EPW file');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const data = await EPWParser.parseEPWFile(file);
      setWeatherData(data);
      
      // Update selected location with file data
      setSelectedLocation({
        city: data.header.location || 'Custom Location',
        region: data.header.country || 'Unknown',
        latitude: data.header.latitude,
        longitude: data.header.longitude,
        timezone: 'Europe/Stockholm', // Default for custom files
        zipUrl: '',
        epwFileName: file.name
      });
      
      // Calculate comfort analysis
      const comfort = EPWParser.calculateComfortAnalysis(data.hourlyData, comfortTemp);
      setComfortAnalysis(comfort);
      
      // Generate wind rose data
      const windRose = EPWParser.generateWindRoseData(data.hourlyData);
      setWindRoseData(windRose);
      
    } catch (err) {
      console.error('Failed to parse EPW file:', err);
      if (err instanceof Error && err.message.includes('quota')) {
        setError(`Storage limit reached. ${err.message}. Try clearing the cache or using a smaller EPW file.`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to parse EPW file');
      }
    } finally {
      setIsLoading(false);
      // Update cache info after any operation
      updateCacheInfo();
    }
  };

  const handleComfortTempChange = (newTemp: number) => {
    setComfortTemp(newTemp);
    if (weatherData) {
      const comfort = EPWParser.calculateComfortAnalysis(weatherData.hourlyData, newTemp);
      setComfortAnalysis(comfort);
    }
  };

  // Update cache info
  const updateCacheInfo = () => {
    const info = EPWParser.getCacheInfo();
    setCacheInfo(info);
  };

  // Get cache status for warnings
  const getCacheStatus = () => {
    return EPWParser.getCacheStatus();
  };

  // Clear cache
  const handleClearCache = () => {
    EPWParser.clearCache();
    updateCacheInfo();
  };

  // Toggle cache info display
  const toggleCacheInfo = () => {
    if (!showCacheInfo) {
      updateCacheInfo();
    }
    setShowCacheInfo(!showCacheInfo);
  };

  // Load default weather data on mount
  React.useEffect(() => {
    loadWeatherData(selectedLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-full flex flex-col bg-gradient-to-br from-gray-900 to-gray-800 relative">
      {/* Tour Welcome Dialog */}
      {!tourStarted && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 shadow-2xl border border-blue-500/50 max-w-2xl mx-4">
            <div className="text-center">
              <div className="text-6xl mb-4">🎓</div>
              <h2 className="text-3xl font-bold text-white mb-4">Welcome to Weather Data Analysis</h2>
              <p className="text-gray-300 text-lg mb-6 leading-relaxed">
                Take a guided tour to learn how to analyze climate data for building performance, 
                or jump right in and explore on your own.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={startTour}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 
                           text-white rounded-lg transition-all duration-200 font-semibold shadow-lg"
                >
                  🚀 Start Guided Tour
                </button>
                <button
                  onClick={skipTour}
                  className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg 
                           transition-all duration-200 font-semibold"
                >
                  Skip Tour
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tour Sidebar */}
      {tourStarted && (
        <div className={`fixed left-0 top-0 h-full bg-gray-900/95 backdrop-blur-sm border-r border-gray-600/30 z-40 transition-transform duration-300 ${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        }`} style={{ width: '320px' }}>
          <div className="p-4 h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Learning Guide</h3>
              <button
                onClick={toggleSidebar}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {showSidebar ? '◀' : '▶'}
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Progress indicator */}
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-sm mb-2">Progress</div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentTourStep + 1) / tourSteps.length) * 100}%` }}
                  ></div>
                </div>
                <div className="text-white text-sm mt-1">
                  Step {currentTourStep + 1} of {tourSteps.length}
                </div>
              </div>

              {/* Current Step */}
              <div className={`bg-gradient-to-br ${getStepColor(currentTourStep)} rounded-lg p-4 border transition-all duration-500`}>
                <div className="text-blue-200 text-sm mb-1 flex items-center gap-2">
                  <span className={`w-2 h-2 ${getStepIndicatorColor(currentTourStep)} rounded-full`}></span>
                  Current Step
                </div>
                <div className="text-white font-semibold mb-2">{getCurrentStep().title}</div>
                <div className="text-gray-300 text-sm mb-3">{getCurrentStep().content}</div>
                
                {/* Focus indicator */}
                {getCurrentStep().targetElement && (
                  <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-2 mb-3">
                    <div className="text-blue-200 text-xs mb-1">👁️ Focus on:</div>
                    <div className="text-blue-300 text-sm font-medium">
                      {getCurrentStep().targetElement!.charAt(0).toUpperCase() + getCurrentStep().targetElement!.slice(1).replace('-', ' ')} Section
                    </div>
                  </div>
                )}

                {/* Key Terms for this step */}
                {getCurrentStep().keyTerms && getCurrentStep().keyTerms!.length > 0 && (
                  <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-3 mb-3">
                    <button
                      onClick={() => setShowStepTerms(!showStepTerms)}
                      className="flex items-center gap-2 text-purple-200 text-xs mb-2 hover:text-purple-100 transition-colors"
                    >
                      <span>📚</span>
                      Key Terms ({getCurrentStep().keyTerms!.length})
                      <span className="text-xs">{showStepTerms ? '▼' : '▶'}</span>
                    </button>
                    {showStepTerms && (
                      <div className="space-y-2">
                        {getCurrentStep().keyTerms!.map((term, index) => (
                          <div key={index} className="bg-purple-900/20 rounded p-2">
                            <div className="text-purple-200 text-xs font-medium">{term.term}</div>
                            <div className="text-purple-100 text-xs mt-1">{term.definition}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <button
                    onClick={prevTourStep}
                    disabled={currentTourStep === 0}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed
                             text-white rounded text-sm transition-all duration-200"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={nextTourStep}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm 
                             transition-all duration-200"
                  >
                    {currentTourStep === tourSteps.length - 1 ? 'Finish' : 'Next →'}
                  </button>
                </div>
              </div>

              {/* Completed Steps */}
              {getCompletedSteps().length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400 text-sm mb-2">✅ Completed</div>
                  <div className="space-y-1">
                    {getCompletedSteps().map((step, index) => (
                      <div key={step.id} className="text-green-400 text-sm">
                        {index + 1}. {step.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Steps */}
              {getUpcomingSteps().length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400 text-sm mb-2">📋 Coming Up</div>
                  <div className="space-y-1">
                    {getUpcomingSteps().map((step, index) => (
                      <div key={step.id} className="text-gray-400 text-sm">
                        {currentTourStep + index + 2}. {step.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tour Controls */}
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-sm mb-2">Tour Controls</div>
                <div className="space-y-2">
                  <button
                    onClick={endTour}
                    className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm 
                             transition-all duration-200"
                  >
                    End Tour
                  </button>
                </div>
              </div>

              {/* Complete Glossary */}
              <div className="bg-gray-800 rounded-lg p-3">
                <button
                  onClick={() => setShowGlossary(!showGlossary)}
                  className="flex items-center justify-between w-full text-gray-400 text-sm mb-2 hover:text-gray-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>📖</span>
                    Complete Glossary
                  </span>
                  <span className="text-xs">{showGlossary ? '▼' : '▶'}</span>
                </button>
                {showGlossary && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {Object.entries(glossaryTerms).map(([term, definition]) => (
                      <div key={term} className="bg-gray-700/50 rounded p-2">
                        <div className="text-cyan-300 text-xs font-medium">{term}</div>
                        <div className="text-gray-300 text-xs mt-1 leading-relaxed">{definition}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Toggle Button */}
      {tourStarted && (
        <button
          onClick={toggleSidebar}
          className={`fixed top-20 z-50 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-r-lg 
                     transition-all duration-300 ${showSidebar ? 'left-80' : 'left-0'}`}
        >
          {showSidebar ? '◀' : '▶'} Guide
        </button>
      )}

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${showSidebar ? 'ml-80' : 'ml-0'}`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900/50 to-cyan-900/50 border-b border-blue-700/30 p-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
              <span className="text-4xl">🌤️</span>
              Weather & Climate Analysis
            </h1>
            <p className="text-blue-200 text-lg">
              Configure location and analyze climate data for building performance
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-900 to-gray-800">
          <div className="p-6 space-y-8 max-w-7xl mx-auto min-h-full">
            {/* Loading State */}
            {isLoading && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-gray-900/95 rounded-2xl p-8 shadow-2xl border border-gray-700/50 text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
                <h3 className="text-white text-xl font-bold mb-2">Loading Weather Data</h3>
                <p className="text-gray-300">Parsing EPW file and generating analysis...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-gradient-to-r from-red-900/80 to-red-800/80 rounded-xl p-6 border border-red-600/50 shadow-lg">
              <div className="flex items-start space-x-4">
                <div className="text-red-400 text-3xl">⚠️</div>
                <div className="flex-1">
                  <h3 className="text-red-200 text-lg font-semibold mb-2">Error Loading Weather Data</h3>
                  <p className="text-red-300 mb-4">{error}</p>
                  
                  {(error.includes('CORS') || error.includes('Failed to fetch')) && (
                    <div className="bg-yellow-900/30 border border-yellow-600/30 rounded-lg p-4 mb-4">
                      <h4 className="text-yellow-200 font-semibold mb-2 flex items-center gap-2">
                        <span>ℹ️</span>
                        CORS Limitation Notice
                      </h4>
                      <p className="text-yellow-100 text-sm mb-3">
                        Due to browser security policies, we cannot directly download weather data from Climate.OneBuilding.org. 
                        However, you can still access the weather data by:
                      </p>
                      <ul className="text-yellow-100 text-sm space-y-1 mb-3">
                        <li>• Manually downloading EPW files from the source link below</li>
                        <li>• Using the "Upload EPW File" feature above</li>
                        <li>• Running the application from a server with proper CORS configuration</li>
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <a 
                          href="https://climate.onebuilding.org/WMO_Region_6_Europe/SWE_Sweden/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 bg-yellow-600/80 hover:bg-yellow-600 
                                   text-white rounded-lg transition-all duration-200 font-medium text-sm"
                        >
                          <span>🔗</span>
                          Download EPW Files
                        </a>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600/80 hover:bg-blue-600 
                                   text-white rounded-lg transition-all duration-200 font-medium text-sm"
                        >
                          <span>📂</span>
                          Upload EPW File
                        </button>
                      </div>
                    </div>
                  )}
                  
                  <button
                    onClick={() => setError(null)}
                    className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg 
                             transition-all duration-200 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cache Status Warning */}
          {(() => {
            const status = getCacheStatus();
            return status.isNearLimit && (
              <div className="bg-gradient-to-r from-yellow-900/80 to-orange-900/80 rounded-xl p-4 border border-yellow-600/50 shadow-lg">
                <div className="flex items-start space-x-3">
                  <div className="text-yellow-400 text-2xl">💾</div>
                  <div className="flex-1">
                    <h3 className="text-yellow-200 text-lg font-semibold mb-1">Cache Storage Nearly Full</h3>
                    <p className="text-yellow-100 text-sm mb-3">
                      Cache is {status.usagePercent.toFixed(1)}% full ({(status.totalSize / 1024 / 1024).toFixed(1)} MB used). 
                      Consider clearing old cache entries to ensure smooth operation.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearCache}
                        className="px-3 py-1 bg-yellow-600/80 hover:bg-yellow-600 text-white rounded 
                                 transition-all duration-200 font-medium text-sm"
                      >
                        Clear Cache
                      </button>
                      <button
                        onClick={toggleCacheInfo}
                        className="px-3 py-1 bg-orange-600/80 hover:bg-orange-600 text-white rounded 
                                 transition-all duration-200 font-medium text-sm"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Current Location & File Upload */}
          <div id="current-location" className={`bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-4 border border-gray-600/30 shadow-xl transition-all duration-300 ${
            isCurrentStepTarget('current-location') ? 'ring-4 ring-blue-500/50 shadow-blue-500/25 shadow-2xl' : ''
          }`}>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Current Selection */}
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <span className="text-xl">📍</span>
                  Current Location
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">City</div>
                    <div className="text-white font-semibold">{selectedLocation.city}</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">Region</div>
                    <div className="text-white font-semibold">{selectedLocation.region}</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">Coordinates</div>
                    <div className="text-cyan-400 font-mono text-sm">
                      {selectedLocation.latitude.toFixed(2)}°N, {Math.abs(selectedLocation.longitude).toFixed(2)}°E
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">Data Source</div>
                    <div className="text-green-400 font-mono text-xs">
                      Climate.OneBuilding
                    </div>
                  </div>
                </div>
              </div>

              {/* File Upload */}
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <span className="text-xl">📂</span>
                  Custom EPW File
                </h2>
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center hover:border-blue-500 transition-colors duration-200">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".epw"
                    onChange={handleFileUpload}
                    disabled={isLoading}
                    className="hidden"
                  />
                  <div className="text-2xl mb-2">☁️</div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={`px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 
                             text-white rounded-lg transition-all duration-200 font-medium shadow-lg
                             ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Upload EPW File
                  </button>
                  <p className="text-gray-400 text-xs mt-2">
                    Select a custom .epw weather file
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Swedish Cities Grid */}
          <div id="city-grid" className={`bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-4 border border-gray-600/30 shadow-xl transition-all duration-300 ${
            isCurrentStepTarget('city-grid') ? 'ring-4 ring-blue-500/50 shadow-blue-500/25 shadow-2xl' : ''
          }`}>
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-xl">🇸🇪</span>
              Swedish Cities
            </h2>
            
            {/* CORS Notice */}
            {/* <div className="bg-green-900/30 border border-green-600/30 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-2">
                <span className="text-green-400">✅</span>
                <div>
                  <h4 className="text-green-200 font-medium text-sm mb-1">Proxy Configuration Active</h4>
                  <p className="text-green-100 text-xs">
                    Development server is configured with CORS proxy. City data should load automatically.
                  </p>
                </div>
              </div>
            </div> */}
            
            <div className="grid grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {swedishCities.map((city) => (
                <button
                  key={`${city.city}-${city.region}`}
                  onClick={() => handleLocationSelect(city)}
                  disabled={isLoading}
                  className={`p-2 rounded-lg text-left transition-all duration-200 border ${
                    selectedLocation.city === city.city && selectedLocation.region === city.region
                      ? 'bg-gradient-to-br from-blue-600/30 to-cyan-600/30 border-blue-500/60 text-blue-300 shadow-lg shadow-blue-500/20'
                      : 'bg-gray-700/40 border-gray-600/40 text-gray-300 hover:bg-gray-600/40 hover:border-gray-500/60'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="font-medium text-sm mb-1">{city.city}</div>
                  <div className="text-xs opacity-75 mb-1">{city.region}</div>
                  <div className="text-xs font-mono opacity-60">
                    {city.latitude.toFixed(1)}°N
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Weather Data Visualizations */}
          {weatherData && (
            <div className="space-y-8">
              {/* Temperature Chart - Full Width */}
              <div id="temperature-chart" className={`transition-all duration-300 ${
                isCurrentStepTarget('temperature-chart') ? 'ring-4 ring-blue-500/50 shadow-blue-500/25 shadow-2xl rounded-xl' : ''
              }`}>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    🌡️ Temperature Analysis - <GlossaryTerm term="Dry Bulb Temperature">Dry Bulb Temperature</GlossaryTerm>
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Understand heating and cooling needs based on <GlossaryTerm term="Thermal Comfort">thermal comfort</GlossaryTerm> requirements.
                  </p>
                </div>
                <TemperatureChart
                  monthlyTemperatures={weatherData.monthlyAverages.temperature}
                  minTemp={weatherData.annualStats.minTemperature}
                  maxTemp={weatherData.annualStats.maxTemperature}
                  avgTemp={weatherData.annualStats.avgTemperature}
                  hourlyData={weatherData.hourlyData?.map((point) => ({
                    dryBulbTemp: point.dryBulbTemperature,
                    hour: point.hour,
                    day: point.day,
                    month: point.month
                  }))}
                />
              </div>

              {/* Degree Days Chart - Full Width */}
              {weatherData.hourlyData && comfortAnalysis && (
                <div id="degree-days-chart" className={`transition-all duration-300 ${
                  isCurrentStepTarget('degree-days-chart') ? 'ring-4 ring-blue-500/50 shadow-blue-500/25 shadow-2xl rounded-xl' : ''
                }`}>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                      📊 <GlossaryTerm term="Degree Days">Degree Days</GlossaryTerm> Analysis
                    </h3>
                    <p className="text-gray-400 text-sm">
                      Measure <GlossaryTerm term="Heating Degree Days">heating</GlossaryTerm> and <GlossaryTerm term="Cooling Degree Days">cooling</GlossaryTerm> energy requirements.
                    </p>
                  </div>
                  <DegreeDaysChart
                    hourlyTemperatures={weatherData.hourlyData.map(point => ({
                      temperature: point.dryBulbTemperature,
                      month: point.month,
                      day: point.day,
                      hour: point.hour
                    }))}
                    comfortTemp={comfortTemp}
                    heatingDegreeDays={comfortAnalysis.heatingDegreeDays}
                    coolingDegreeDays={comfortAnalysis.coolingDegreeDays}
                    onComfortTempChange={handleComfortTempChange}
                  />
                </div>
              )}

              {/* Humidity Chart */}
              <div id="humidity-chart" className={`transition-all duration-300 ${
                isCurrentStepTarget('humidity-chart') ? 'ring-4 ring-blue-500/50 shadow-blue-500/25 shadow-2xl rounded-xl' : ''
              }`}>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    💧 <GlossaryTerm term="Relative Humidity">Humidity</GlossaryTerm> Analysis
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Monitor moisture levels that affect comfort and building systems.
                  </p>
                </div>
                <HumidityChart
                  monthlyHumidity={weatherData.monthlyAverages.humidity}
                  avgHumidity={weatherData.annualStats.avgHumidity}
                  hourlyData={weatherData.hourlyData?.map((point) => ({
                    relativeHumidity: point.relativeHumidity,
                    hour: point.hour,
                    day: point.day,
                    month: point.month
                  }))}
                />
              </div>

              {/* Bottom Row - Wind Rose */}
              {windRoseData && (
                <div id="wind-rose" className={`transition-all duration-300 ${
                  isCurrentStepTarget('wind-rose') ? 'ring-4 ring-blue-500/50 shadow-blue-500/25 shadow-2xl rounded-xl' : ''
                }`}>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                      🌬️ <GlossaryTerm term="Wind Rose">Wind Rose</GlossaryTerm> Analysis
                    </h3>
                    <p className="text-gray-400 text-sm">
                      Visualize wind patterns for building ventilation and energy design.
                    </p>
                  </div>
                  <WindRose
                    windRoseData={windRoseData}
                    avgWindSpeed={weatherData.annualStats.avgWindSpeed}
                    predominantDirection={weatherData.annualStats.predominantWindDirection}
                    hourlyWindData={weatherData.hourlyData.map(point => ({
                      windSpeed: point.windSpeed,
                      windDirection: point.windDirection,
                      hour: point.hour,
                      day: point.day,
                      month: point.month
                    }))}
                  />
                </div>
              )}
            </div>
          )}

          {/* Climate Summary */}
          {weatherData && (
            <div id="climate-summary" className={`bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-6 border border-gray-600/30 shadow-xl transition-all duration-300 ${
              isCurrentStepTarget('climate-summary') ? 'ring-4 ring-blue-500/50 shadow-blue-500/25 shadow-2xl' : ''
            }`}>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-2xl">📊</span>
                Climate Summary
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Data Source</div>
                  <div className="text-white font-medium">{weatherData.header.dataSource}</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Station ID</div>
                  <div className="text-white font-medium">{weatherData.header.stationId}</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Elevation</div>
                  <div className="text-white font-medium">{weatherData.header.elevation.toFixed(0)} m</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Timezone</div>
                  <div className="text-white font-medium">{selectedLocation.timezone}</div>
                </div>
              </div>
            </div>
          )}

          {/* Cache Management */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-6 border border-gray-600/30 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="text-2xl">💾</span>
              Cache Management
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-gray-300">
                  Weather data is cached locally to improve performance and reduce network requests.
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={toggleCacheInfo}
                    className="px-4 py-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg 
                             transition-all duration-200 font-medium"
                  >
                    {showCacheInfo ? 'Hide' : 'Show'} Cache Info
                  </button>
                  <button
                    onClick={handleClearCache}
                    className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg 
                             transition-all duration-200 font-medium"
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
              
              {showCacheInfo && (
                <div className="bg-gray-700/50 rounded-lg p-4 space-y-3">
                  {(() => {
                    const status = getCacheStatus();
                    return (
                      <>
                        {status.isNearLimit && (
                          <div className="bg-yellow-900/50 border border-yellow-600/50 rounded-lg p-3 mb-3">
                            <div className="flex items-center gap-2 text-yellow-200 text-sm font-medium">
                              <span>⚠️</span>
                              Cache Near Limit ({status.usagePercent.toFixed(1)}% used)
                            </div>
                            <p className="text-yellow-100 text-xs mt-1">
                              Consider clearing old cache entries to avoid storage issues.
                            </p>
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-gray-400 text-sm">Cached Files</div>
                            <div className="text-white font-semibold">{cacheInfo.count}</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-sm">Used Space</div>
                            <div className="text-white font-semibold">
                              {(cacheInfo.totalSize / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-sm">Cache Limit</div>
                            <div className="text-white font-semibold">
                              {(status.maxSize / 1024 / 1024).toFixed(0)} MB
                            </div>
                          </div>
                        </div>
                        
                        {/* Cache usage bar */}
                        <div className="w-full bg-gray-600/50 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-300 ${
                              status.usagePercent > 90 ? 'bg-red-500' : 
                              status.usagePercent > 80 ? 'bg-yellow-500' : 
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(status.usagePercent, 100)}%` }}
                          ></div>
                        </div>
                        <div className="text-gray-400 text-xs text-center">
                          {status.usagePercent.toFixed(1)}% of cache limit used
                        </div>
                      </>
                    );
                  })()}
                  
                  {cacheInfo.entries.length > 0 && (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      <div className="text-gray-400 text-sm font-medium">Cached Files:</div>
                      {cacheInfo.entries.map((entry, index) => (
                        <div key={index} className="bg-gray-600/30 rounded p-2 text-sm">
                          <div className="text-white font-mono">{entry.fileName}</div>
                          <div className="text-gray-400 flex justify-between">
                            <span>{entry.timestamp.toLocaleDateString()} {entry.timestamp.toLocaleTimeString()}</span>
                            <span>{(entry.size / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Data Source Attribution */}
          <div className="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 rounded-xl p-6 border border-blue-700/30 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-3">
              <span className="text-xl">🌍</span>
              Climate Data Source
            </h2>
            <div className="space-y-4">
              <p className="text-blue-200">
                Weather data is sourced from <strong>Climate.OneBuilding.org</strong>, providing 
                high-quality TMY (Typical Meteorological Year) data for building energy analysis.
              </p>
              
              <div className="bg-blue-900/30 border border-blue-600/30 rounded-lg p-4">
                <h4 className="text-blue-200 font-semibold mb-2">How to Access Weather Data:</h4>
                <ol className="text-blue-100 text-sm space-y-2">
                  <li>1. Visit the Sweden climate data page using the link below</li>
                  <li>2. Navigate to your desired city/region folder</li>
                  <li>3. Download the appropriate .zip file (contains .epw weather data)</li>
                  <li>4. Extract the .epw file from the zip</li>
                  <li>5. Use the "Upload EPW File" feature above to analyze the data</li>
                </ol>
              </div>
              
              <div className="flex items-center gap-4">
                <a 
                  href="https://climate.onebuilding.org/WMO_Region_6_Europe/SWE_Sweden/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/80 hover:bg-blue-600 
                           text-white rounded-lg transition-all duration-200 font-medium"
                >
                  <span>🔗</span>
                  Download Sweden Climate Data
                </a>
                <span className="text-blue-300 text-sm">
                  2009-2023 TMY Data Available
                </span>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
