/**
 * Seasonal Effects Feature - Constants
 */

import type { ChristmasConfig, HalloweenConfig } from './types'

export const DEFAULT_CHRISTMAS_CONFIG: ChristmasConfig = {
  snowEnabled: true,
  snowOpacity: 80,
  snowDensity: 100,
  snowSize: 100,
  blusteryness: 50,
  useLocalWeather: false,
  sleighEnabled: true,
  sleighDirection: 'push',
}

export const DEFAULT_HALLOWEEN_CONFIG: HalloweenConfig = {
  sparksEnabled: true,
  sparksOpacity: 70,
  sparksSpeed: 40,
  ghostsOpacity: 30,
}

// Date ranges for automatic theme application
export const CHRISTMAS_DATE_RANGE = {
  start: { month: 12, day: 1 },
  end: { month: 12, day: 31 },
}

export const HALLOWEEN_DATE_RANGE = {
  start: { month: 10, day: 15 },
  end: { month: 11, day: 1 },
}

// Weather cache duration
export const WEATHER_CACHE_DURATION = 15 * 60 * 1000 // 15 minutes
