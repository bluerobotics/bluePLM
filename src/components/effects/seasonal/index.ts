/**
 * Seasonal Effects Feature Module
 * 
 * This module provides seasonal visual effects including:
 * - Christmas snow effects with wind physics
 * - Halloween spooky effects (ghosts, sparks, pumpkins)
 * - Weather-based dynamic theming and effects
 */

// Components
export { ChristmasEffects, HalloweenEffects, WeatherEffects } from './components'

// Hooks
export { useSeasonalTheme, useWeatherData, type UseWeatherDataResult } from './hooks'

// Utils (for consumers who need direct access)
export * from './utils'

// Types
export type { 
  SeasonalTheme, 
  WeatherData,
  WeatherCondition,
  ChristmasConfig, 
  HalloweenConfig,
  SnowflakeConfig,
  Snowflake,
  WindState,
  GustState,
  WindForces,
} from './types'

// Constants
export { 
  DEFAULT_CHRISTMAS_CONFIG, 
  DEFAULT_HALLOWEEN_CONFIG,
  CHRISTMAS_DATE_RANGE,
  HALLOWEEN_DATE_RANGE,
  WEATHER_CACHE_DURATION,
} from './constants'
