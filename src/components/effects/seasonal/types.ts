/**
 * Seasonal Effects Feature - Type Definitions
 */

export type SeasonalTheme = 'christmas' | 'halloween' | 'weather' | null

export interface WeatherData {
  condition: WeatherCondition
  temperature: number // Celsius
  isDay: boolean
  windSpeed: number // km/h
  humidity: number // %
  cloudCover: number // %
  precipitation: number // mm
  weatherCode: number
  location?: { lat: number; lon: number }
}

export type WeatherCondition = 
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'heavy-snow'
  | 'thunderstorm'
  | 'unknown'

export interface SnowflakeConfig {
  count: number
  opacity: number
  size: number
  blusteriness: number
}

export interface ChristmasConfig {
  snowEnabled: boolean
  snowOpacity: number
  snowDensity: number
  snowSize: number
  blusteryness: number
  useLocalWeather: boolean
  sleighEnabled: boolean
  sleighDirection: 'push' | 'pull'
}

export interface HalloweenConfig {
  sparksEnabled: boolean
  sparksOpacity: number
  sparksSpeed: number
  ghostsOpacity: number
}

// Snowflake interface for Canvas-based rendering
export interface Snowflake {
  id: number
  x: number  // 0-100 percentage
  y: number  // 0-100 percentage
  vx: number  // Horizontal velocity
  vy: number  // Vertical velocity (falling speed)
  size: number
  baseSpeed: number  // Base falling speed
  opacity: number
  mass: number  // Larger flakes are heavier, less affected by wind
}

// Wind simulation state
export interface WindState {
  baseWind: number       // Slow-changing base wind (-1 to 1)
  gustStrength: number   // Current gust strength (0 to 1)
  gustDirection: number  // Gust direction in radians
  turbulence: number     // High-frequency noise
  weatherWind: number    // Wind speed from weather API (0-1 normalized)
}

// Gust state for wind simulation
export interface GustState {
  nextGustTime: number
  gustDuration: number
}

// Wind forces output type (reusable to avoid GC pressure)
export interface WindForces {
  baseWindX: number
  baseWindY: number
  weatherWindX: number
  weatherWindY: number
}
