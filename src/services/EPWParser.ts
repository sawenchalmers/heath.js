interface EPWHeader {
  location: string;
  country: string;
  dataSource: string;
  stationId: string;
  latitude: number;
  longitude: number;
  timezone: number;
  elevation: number;
}

interface EPWDataPoint {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dataSourceFlag: string;
  dryBulbTemperature: number; // °C
  dewPointTemperature: number; // °C
  relativeHumidity: number; // %
  atmosphericPressure: number; // Pa
  extraterrestrialHorizontalRadiation: number; // Wh/m²
  extraterrestrialDirectNormalRadiation: number; // Wh/m²
  horizontalInfraredRadiation: number; // Wh/m²
  globalHorizontalRadiation: number; // Wh/m²
  directNormalRadiation: number; // Wh/m²
  diffuseHorizontalRadiation: number; // Wh/m²
  globalHorizontalIlluminance: number; // lux
  directNormalIlluminance: number; // lux
  diffuseHorizontalIlluminance: number; // lux
  zenithLuminance: number; // Cd/m²
  windDirection: number; // degrees
  windSpeed: number; // m/s
  totalSkyCover: number; // tenths
  opaqueSkyCover: number; // tenths
  visibility: number; // km
  ceilingHeight: number; // m
  presentWeatherObservation: number;
  presentWeatherCodes: string;
  precipitableWater: number; // mm
  aerosolOpticalDepth: number;
  snowDepth: number; // cm
  daysSinceLastSnowfall: number;
  albedo: number;
  liquidPrecipitationDepth: number; // mm
  liquidPrecipitationQuantity: number; // hr
}

interface EPWProcessedData {
  header: EPWHeader;
  hourlyData: EPWDataPoint[];
  dailyAverages: {
    temperature: number[];
    humidity: number[];
    windSpeed: number[];
  };
  monthlyAverages: {
    temperature: number[];
    humidity: number[];
    windSpeed: number[];
    windDirection: number[];
  };
  annualStats: {
    minTemperature: number;
    maxTemperature: number;
    avgTemperature: number;
    avgHumidity: number;
    avgWindSpeed: number;
    predominantWindDirection: number;
  };
}

interface ComfortAnalysis {
  heatingDegreeDays: number;
  coolingDegreeDays: number;
  heatingDegreeHours: number;
  coolingDegreeHours: number;
  comfortableHours: number;
  comfortPercentage: number;
}

interface WindRoseData {
  directions: string[];
  speeds: number[][];
  frequencies: number[][];
}

interface EPWCacheEntry {
  data: EPWProcessedData;
  timestamp: number;
  zipUrl: string;
  epwFileName: string;
}

export class EPWParser {
  private static readonly WIND_DIRECTIONS = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
  ];

  private static readonly CACHE_PREFIX = 'epw_cache_';
  private static readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private static readonly MAX_CACHE_SIZE = 4 * 1024 * 1024; // 4MB to leave room for other data

  // Cache management methods
  private static getCacheKey(zipUrl: string, epwFileName: string): string {
    return `${this.CACHE_PREFIX}${btoa(zipUrl + epwFileName)}`;
  }

  private static getCachedData(zipUrl: string, epwFileName: string): EPWProcessedData | null {
    try {
      const cacheKey = this.getCacheKey(zipUrl, epwFileName);
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const entry: EPWCacheEntry = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - entry.timestamp < this.CACHE_DURATION) {
          console.log(`Using cached EPW data for ${epwFileName}`);
          
          // Update timestamp for LRU behavior (touch the cache entry)
          try {
            const updatedEntry: EPWCacheEntry = {
              ...entry,
              timestamp: now
            };
            localStorage.setItem(cacheKey, JSON.stringify(updatedEntry));
          } catch (error) {
            // If we can't update timestamp (storage full), that's okay
            console.warn('Could not update cache timestamp:', error);
          }
          
          return entry.data;
        } else {
          // Cache expired, remove it
          localStorage.removeItem(cacheKey);
          console.log(`Cache expired for ${epwFileName}`);
        }
      }
    } catch (error) {
      console.warn('Failed to read EPW cache:', error);
    }
    
    return null;
  }

  private static setCachedData(zipUrl: string, epwFileName: string, data: EPWProcessedData): void {
    try {
      const cacheKey = this.getCacheKey(zipUrl, epwFileName);
      const entry: EPWCacheEntry = {
        data,
        timestamp: Date.now(),
        zipUrl,
        epwFileName
      };
      
      const entryString = JSON.stringify(entry);
      const entrySize = new Blob([entryString]).size;
      
      // Check if we have enough space and clean if necessary
      this.ensureStorageSpace(entrySize);
      
      localStorage.setItem(cacheKey, entryString);
      console.log(`Cached EPW data for ${epwFileName} (${(entrySize / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
      console.warn('Failed to cache EPW data:', error);
      
      // If still failing after cleanup, try one more aggressive cleanup
      if (error instanceof Error && (error.name === 'QuotaExceededError' || error.message?.includes('quota'))) {
        console.log('Storage quota exceeded, attempting aggressive cleanup...');
        this.aggressiveCleanup();
        
        // Try one more time after aggressive cleanup
        try {
          const cacheKey = this.getCacheKey(zipUrl, epwFileName);
          const entry: EPWCacheEntry = {
            data,
            timestamp: Date.now(),
            zipUrl,
            epwFileName
          };
          localStorage.setItem(cacheKey, JSON.stringify(entry));
          console.log(`Cached EPW data for ${epwFileName} after aggressive cleanup`);
        } catch (finalError) {
          console.warn(`Unable to cache ${epwFileName} - storage limit reached:`, finalError);
        }
      }
    }
  }

  // Public method to clear all EPW cache
  static clearCache(): void {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log(`Cleared ${keysToRemove.length} cached EPW entries`);
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  // Public method to get cache info
  static getCacheInfo(): { count: number; totalSize: number; entries: Array<{ fileName: string; timestamp: Date; size: number }> } {
    const entries: Array<{ fileName: string; timestamp: Date; size: number }> = [];
    let totalSize = 0;
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          try {
            const cached = localStorage.getItem(key);
            if (cached) {
              const entry: EPWCacheEntry = JSON.parse(cached);
              const size = new Blob([cached]).size;
              totalSize += size;
              
              entries.push({
                fileName: entry.epwFileName,
                timestamp: new Date(entry.timestamp),
                size
              });
            }
          } catch (error) {
            console.warn('Failed to parse cache entry:', error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get cache info:', error);
    }
    
    return {
      count: entries.length,
      totalSize,
      entries: entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    };
  }

  // Get cache status for UI display
  static getCacheStatus(): { 
    isNearLimit: boolean; 
    usagePercent: number; 
    totalSize: number; 
    maxSize: number;
    count: number;
  } {
    const totalSize = this.calculateCacheSize();
    const usagePercent = (totalSize / this.MAX_CACHE_SIZE) * 100;
    const isNearLimit = usagePercent > 80;
    const info = this.getCacheInfo();
    
    return {
      isNearLimit,
      usagePercent,
      totalSize,
      maxSize: this.MAX_CACHE_SIZE,
      count: info.count
    };
  }

  // Method to extract EPW from remote ZIP with caching and CORS fallback
  static async parseEPWFromRemoteZip(zipUrl: string, epwFileName: string): Promise<EPWProcessedData> {
    // Check cache first
    const cached = this.getCachedData(zipUrl, epwFileName);
    if (cached) {
      return cached;
    }

    console.log(`Downloading and parsing EPW from: ${zipUrl}`);
    
    try {
      // Try direct fetch first
      const epwContent = await this.extractEPWFromRemoteZip(zipUrl, epwFileName);
      const data = this.parseEPWContent(epwContent);
      
      // Cache the result
      this.setCachedData(zipUrl, epwFileName, data);
      
      return data;
    } catch (error) {
      console.error('Failed to fetch EPW from remote ZIP:', error);
      
      // If we have any cached data (even expired), use it as fallback
      try {
        const cacheKey = this.getCacheKey(zipUrl, epwFileName);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const entry: EPWCacheEntry = JSON.parse(cached);
          console.warn(`Using expired cache as fallback for ${epwFileName}`);
          return entry.data;
        }
      } catch (cacheError) {
        console.warn('Failed to use cached fallback:', cacheError);
      }
      
      throw new Error(`Failed to load EPW data: ${error instanceof Error ? error.message : 'Unknown error'}. This may be due to CORS policy or network issues.`);
    }
  }

  // Helper method to extract EPW from remote ZIP
  private static async extractEPWFromRemoteZip(zipUrl: string, epwFileName: string): Promise<string> {
    const JSZip = (await import('jszip')).default;
    
    try {
      console.log(`Downloading ZIP file from: ${zipUrl}`);
      
      const response = await fetch(zipUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/zip, application/octet-stream, */*',
        },
        mode: 'cors', // Explicitly set CORS mode
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ZIP file: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      console.log(`Downloaded ${arrayBuffer.byteLength} bytes`);
      
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(arrayBuffer);
      
      // Find the EPW file (exact match first, then case-insensitive)
      let epwFile = zipContents.files[epwFileName];
      
      if (!epwFile) {
        // Try case-insensitive search
        const foundFileName = Object.keys(zipContents.files).find(fileName => 
          fileName.toLowerCase() === epwFileName.toLowerCase() ||
          fileName.toLowerCase().endsWith('.epw')
        );
        
        if (foundFileName) {
          epwFile = zipContents.files[foundFileName];
        }
      }
      
      if (!epwFile) {
        throw new Error(`EPW file "${epwFileName}" not found in ZIP archive. Available files: ${Object.keys(zipContents.files).join(', ')}`);
      }
      
      console.log(`Extracting EPW file: ${epwFile.name}`);
      const epwContent = await epwFile.async('text');
      
      return epwContent;
      
    } catch (error) {
      console.error('Error extracting EPW from remote ZIP:', error);
      throw error;
    }
  }

  static async parseEPWFile(file: File): Promise<EPWProcessedData> {
    const text = await file.text();
    return this.parseEPWText(text);
  }

  static async parseEPWFromPath(path: string): Promise<EPWProcessedData> {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch EPW file: ${response.statusText}`);
      }
      const text = await response.text();
      return this.parseEPWText(text);
    } catch (error) {
      throw new Error(`Failed to load EPW file from ${path}: ${error}`);
    }
  }

  static parseEPWContent(text: string): EPWProcessedData {
    return this.parseEPWText(text);
  }

  private static parseEPWText(text: string): EPWProcessedData {
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 8) {
      throw new Error('Invalid EPW file format');
    }

    // Parse header (first 8 lines)
    const headerLine = lines[0].split(',');
    const header: EPWHeader = {
      location: headerLine[1] || '',
      country: headerLine[3] || '',
      dataSource: headerLine[4] || '',
      stationId: headerLine[5] || '',
      latitude: parseFloat(headerLine[6]) || 0,
      longitude: parseFloat(headerLine[7]) || 0,
      timezone: parseFloat(headerLine[8]) || 0,
      elevation: parseFloat(headerLine[9]) || 0
    };

    // Parse hourly data (starting from line 8)
    const hourlyData: EPWDataPoint[] = [];
    for (let i = 8; i < lines.length; i++) {
      const fields = lines[i].split(',');
      if (fields.length >= 35) {
        try {
          const dataPoint: EPWDataPoint = {
            year: parseInt(fields[0]) || 0,
            month: parseInt(fields[1]) || 0,
            day: parseInt(fields[2]) || 0,
            hour: parseInt(fields[3]) || 0,
            minute: parseInt(fields[4]) || 0,
            dataSourceFlag: fields[5] || '',
            dryBulbTemperature: parseFloat(fields[6]) || 0,
            dewPointTemperature: parseFloat(fields[7]) || 0,
            relativeHumidity: Math.min(100, Math.max(0, parseFloat(fields[8]) || 0)),
            atmosphericPressure: parseFloat(fields[9]) || 0,
            extraterrestrialHorizontalRadiation: Math.max(0, parseFloat(fields[10]) || 0),
            extraterrestrialDirectNormalRadiation: Math.max(0, parseFloat(fields[11]) || 0),
            horizontalInfraredRadiation: Math.max(0, parseFloat(fields[12]) || 0),
            globalHorizontalRadiation: Math.max(0, parseFloat(fields[13]) || 0),
            directNormalRadiation: Math.max(0, parseFloat(fields[14]) || 0),
            diffuseHorizontalRadiation: Math.max(0, parseFloat(fields[15]) || 0),
            globalHorizontalIlluminance: Math.max(0, parseFloat(fields[16]) || 0),
            directNormalIlluminance: Math.max(0, parseFloat(fields[17]) || 0),
            diffuseHorizontalIlluminance: Math.max(0, parseFloat(fields[18]) || 0),
            zenithLuminance: Math.max(0, parseFloat(fields[19]) || 0),
            windDirection: Math.max(0, Math.min(360, parseFloat(fields[20]) || 0)),
            windSpeed: Math.max(0, parseFloat(fields[21]) || 0),
            totalSkyCover: Math.max(0, Math.min(10, parseFloat(fields[22]) || 0)),
            opaqueSkyCover: Math.max(0, Math.min(10, parseFloat(fields[23]) || 0)),
            visibility: Math.max(0, parseFloat(fields[24]) || 0),
            ceilingHeight: Math.max(0, parseFloat(fields[25]) || 0),
            presentWeatherObservation: parseInt(fields[26]) || 0,
            presentWeatherCodes: fields[27] || '',
            precipitableWater: Math.max(0, parseFloat(fields[28]) || 0),
            aerosolOpticalDepth: Math.max(0, parseFloat(fields[29]) || 0),
            snowDepth: Math.max(0, parseFloat(fields[30]) || 0),
            daysSinceLastSnowfall: Math.max(0, parseFloat(fields[31]) || 0),
            albedo: Math.max(0, Math.min(1, parseFloat(fields[32]) || 0)),
            liquidPrecipitationDepth: Math.max(0, parseFloat(fields[33]) || 0),
            liquidPrecipitationQuantity: Math.max(0, parseFloat(fields[34]) || 0)
          };
          hourlyData.push(dataPoint);
        } catch (error) {
          console.warn(`Failed to parse line ${i + 1}:`, error);
        }
      }
    }

    // Calculate monthly averages and annual stats
    const monthlyAverages = this.calculateMonthlyAverages(hourlyData);
    const annualStats = this.calculateAnnualStats(hourlyData);
    const dailyAverages = this.calculateDailyAverages(hourlyData);

    return {
      header,
      hourlyData,
      dailyAverages,
      monthlyAverages,
      annualStats
    };
  }

  private static calculateDailyAverages(data: EPWDataPoint[]) {
    const dailyData: { [day: string]: EPWDataPoint[] } = {};
    
    // Group data by day
    data.forEach(point => {
      const dayKey = `${point.month}-${point.day}`;
      if (!dailyData[dayKey]) {
        dailyData[dayKey] = [];
      }
      dailyData[dayKey].push(point);
    });

    const temperature: number[] = [];
    const humidity: number[] = [];
    const windSpeed: number[] = [];

    // Calculate daily averages for each day of the year
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = month === 2 ? 28 : (month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31);
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = `${month}-${day}`;
        const dayData = dailyData[dayKey] || [];
        
        if (dayData.length > 0) {
          temperature.push(dayData.reduce((sum, p) => sum + p.dryBulbTemperature, 0) / dayData.length);
          humidity.push(dayData.reduce((sum, p) => sum + p.relativeHumidity, 0) / dayData.length);
          windSpeed.push(dayData.reduce((sum, p) => sum + p.windSpeed, 0) / dayData.length);
        } else {
          // Fill with zeros for missing days
          temperature.push(0);
          humidity.push(0);
          windSpeed.push(0);
        }
      }
    }

    return { temperature, humidity, windSpeed };
  }

  private static calculateMonthlyAverages(data: EPWDataPoint[]) {
    const monthlyData: { [month: number]: EPWDataPoint[] } = {};
    
    // Group data by month
    data.forEach(point => {
      if (!monthlyData[point.month]) {
        monthlyData[point.month] = [];
      }
      monthlyData[point.month].push(point);
    });

    const temperature: number[] = [];
    const humidity: number[] = [];
    const windSpeed: number[] = [];
    const windDirection: number[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthData = monthlyData[month] || [];
      
      if (monthData.length > 0) {
        temperature.push(monthData.reduce((sum, p) => sum + p.dryBulbTemperature, 0) / monthData.length);
        humidity.push(monthData.reduce((sum, p) => sum + p.relativeHumidity, 0) / monthData.length);
        windSpeed.push(monthData.reduce((sum, p) => sum + p.windSpeed, 0) / monthData.length);
        
        // Calculate predominant wind direction for the month
        const directionSum = monthData.reduce((sum, p) => sum + p.windDirection, 0);
        windDirection.push(directionSum / monthData.length);
      } else {
        temperature.push(0);
        humidity.push(0);
        windSpeed.push(0);
        windDirection.push(0);
      }
    }

    return { temperature, humidity, windSpeed, windDirection };
  }

  private static calculateAnnualStats(data: EPWDataPoint[]) {
    if (data.length === 0) {
      return {
        minTemperature: 0,
        maxTemperature: 0,
        avgTemperature: 0,
        avgHumidity: 0,
        avgWindSpeed: 0,
        predominantWindDirection: 0
      };
    }

    const temperatures = data.map(p => p.dryBulbTemperature);
    const humidities = data.map(p => p.relativeHumidity);
    const windSpeeds = data.map(p => p.windSpeed);
    const windDirections = data.map(p => p.windDirection);

    return {
      minTemperature: Math.min(...temperatures),
      maxTemperature: Math.max(...temperatures),
      avgTemperature: temperatures.reduce((sum, t) => sum + t, 0) / temperatures.length,
      avgHumidity: humidities.reduce((sum, h) => sum + h, 0) / humidities.length,
      avgWindSpeed: windSpeeds.reduce((sum, w) => sum + w, 0) / windSpeeds.length,
      predominantWindDirection: windDirections.reduce((sum, w) => sum + w, 0) / windDirections.length
    };
  }

  static calculateComfortAnalysis(data: EPWDataPoint[], comfortTemp: number = 21): ComfortAnalysis {
    let heatingDegreeDays = 0;
    let coolingDegreeDays = 0;
    let heatingDegreeHours = 0;
    let coolingDegreeHours = 0;
    let comfortableHours = 0;

    const comfortRange = 1; // ±1°C comfort range as requested
    const dailyTemps: { [key: string]: number[] } = {};

    // Ensure we only process one year of data (8760 hours)
    const yearData = data.slice(0, 8760);

    // Group temperatures by day for degree days calculation
    yearData.forEach(point => {
      const dayKey = `${point.month}-${point.day}`;
      if (!dailyTemps[dayKey]) {
        dailyTemps[dayKey] = [];
      }
      dailyTemps[dayKey].push(point.dryBulbTemperature);
    });

    // Calculate degree days (based on daily averages)
    Object.values(dailyTemps).forEach(dayTemps => {
      const avgDayTemp = dayTemps.reduce((sum, t) => sum + t, 0) / dayTemps.length;
      
      if (avgDayTemp < comfortTemp - comfortRange) {
        heatingDegreeDays += (comfortTemp - avgDayTemp);
      } else if (avgDayTemp > comfortTemp + comfortRange) {
        coolingDegreeDays += (avgDayTemp - comfortTemp);
      }
    });

    // Calculate degree hours (sum of temperature differences for each hour)
    yearData.forEach(point => {
      const temp = point.dryBulbTemperature;
      
      if (temp < comfortTemp - comfortRange) {
        heatingDegreeHours += (comfortTemp - temp);
      } else if (temp > comfortTemp + comfortRange) {
        coolingDegreeHours += (temp - comfortTemp);
      } else {
        comfortableHours++;
      }
    });

    return {
      heatingDegreeDays,
      coolingDegreeDays,
      heatingDegreeHours,
      coolingDegreeHours,
      comfortableHours,
      comfortPercentage: (comfortableHours / yearData.length) * 100
    };
  }

  static generateWindRoseData(data: EPWDataPoint[]): WindRoseData {
    const directions = this.WIND_DIRECTIONS;
    const speedBins = [0, 2, 4, 6, 8, 10, 15]; // m/s
    const speedLabels = ['0-2', '2-4', '4-6', '6-8', '8-10', '10-15', '15+'];
    
    // Initialize frequency matrix
    const frequencies: number[][] = directions.map(() => new Array(speedLabels.length).fill(0));
    const speeds: number[][] = directions.map(() => new Array(speedLabels.length).fill(0));
    
    data.forEach(point => {
      if (point.windSpeed > 0) {
        // Determine direction bin (0-15 for 16 compass directions)
        const directionIndex = Math.floor(((point.windDirection + 11.25) % 360) / 22.5);
        
        // Determine speed bin
        let speedIndex = speedBins.length - 1;
        for (let i = 0; i < speedBins.length - 1; i++) {
          if (point.windSpeed < speedBins[i + 1]) {
            speedIndex = i;
            break;
          }
        }
        
        frequencies[directionIndex][speedIndex]++;
        speeds[directionIndex][speedIndex] += point.windSpeed;
      }
    });
    
    // Calculate average speeds and convert frequencies to percentages
    const totalCount = data.filter(p => p.windSpeed > 0).length;
    
    for (let dir = 0; dir < directions.length; dir++) {
      for (let speed = 0; speed < speedLabels.length; speed++) {
        if (frequencies[dir][speed] > 0) {
          speeds[dir][speed] = speeds[dir][speed] / frequencies[dir][speed];
          frequencies[dir][speed] = (frequencies[dir][speed] / totalCount) * 100;
        }
      }
    }
    
    return {
      directions,
      speeds,
      frequencies
    };
  }

  // Ensure we have enough storage space by cleaning old entries
  private static ensureStorageSpace(requiredSize: number): void {
    try {
      const currentUsage = this.calculateCacheSize();
      
      // If adding this entry would exceed our limit, clean up
      if (currentUsage + requiredSize > this.MAX_CACHE_SIZE) {
        const targetSize = Math.max(this.MAX_CACHE_SIZE - requiredSize, this.MAX_CACHE_SIZE * 0.7);
        this.cleanCacheToSize(targetSize);
      }
    } catch (error) {
      console.warn('Failed to ensure storage space:', error);
      this.aggressiveCleanup();
    }
  }

  // Calculate current cache size
  private static calculateCacheSize(): number {
    let totalSize = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          const item = localStorage.getItem(key);
          if (item) {
            totalSize += new Blob([item]).size;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to calculate cache size:', error);
    }
    return totalSize;
  }

  // Clean cache to target size using LRU strategy
  private static cleanCacheToSize(targetSize: number): void {
    try {
      const entries: Array<{ key: string; timestamp: number; size: number }> = [];
      
      // Collect all cache entries with their timestamps and sizes
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          try {
            const item = localStorage.getItem(key);
            if (item) {
              const entry: EPWCacheEntry = JSON.parse(item);
              const size = new Blob([item]).size;
              entries.push({ key, timestamp: entry.timestamp, size });
            }
          } catch {
            // Remove corrupted entries
            entries.push({ key, timestamp: 0, size: 0 });
          }
        }
      }
      
      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a.timestamp - b.timestamp);
      
      let currentSize = entries.reduce((sum, entry) => sum + entry.size, 0);
      
      // Remove oldest entries until we reach target size
      for (const entry of entries) {
        if (currentSize <= targetSize) break;
        
        localStorage.removeItem(entry.key);
        currentSize -= entry.size;
        console.log(`Removed old cache entry: ${entry.key}`);
      }
      
      console.log(`Cache cleaned to ${(currentSize / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      console.warn('Failed to clean cache to size:', error);
    }
  }

  // Aggressive cleanup - remove all but the most recent entry
  private static aggressiveCleanup(): void {
    try {
      const entries: Array<{ key: string; timestamp: number; fileName: string }> = [];
      
      // Collect all cache entries
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          try {
            const item = localStorage.getItem(key);
            if (item) {
              const entry: EPWCacheEntry = JSON.parse(item);
              entries.push({ 
                key, 
                timestamp: entry.timestamp, 
                fileName: entry.epwFileName 
              });
            }
          } catch {
            // Remove corrupted entries
            entries.push({ key, timestamp: 0, fileName: 'corrupted' });
          }
        }
      }
      
      // Sort by timestamp (newest first)
      entries.sort((a, b) => b.timestamp - a.timestamp);
      
      // Keep only the most recent entry, remove all others
      for (let i = 1; i < entries.length; i++) {
        localStorage.removeItem(entries[i].key);
        console.log(`Aggressively removed cache entry: ${entries[i].fileName}`);
      }
      
      console.log(`Aggressive cleanup complete. Kept ${Math.min(1, entries.length)} entries.`);
    } catch (error) {
      console.warn('Failed to perform aggressive cleanup:', error);
      // Last resort - clear all EPW cache
      this.clearCache();
    }
  }
}

export type { EPWHeader, EPWDataPoint, EPWProcessedData, ComfortAnalysis, WindRoseData };
