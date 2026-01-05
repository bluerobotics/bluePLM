/**
 * Hook to fetch and manage weather data
 */

import { useState, useEffect, useCallback } from 'react'
import type { WeatherData } from '../types'
import { fetchWeather } from '../utils/weather'

export interface UseWeatherDataResult {
  weather: WeatherData | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useWeatherData(enabled: boolean): UseWeatherDataResult {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadWeather = useCallback(async () => {
    if (!enabled) {
      setWeather(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await fetchWeather()
      setWeather(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setWeather(null)
      return
    }

    let cancelled = false

    const doLoad = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchWeather()
        if (!cancelled) {
          setWeather(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch weather')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    doLoad()

    // Refresh every 15 minutes
    const interval = setInterval(doLoad, 15 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled])

  return { weather, loading, error, refresh: loadWeather }
}
