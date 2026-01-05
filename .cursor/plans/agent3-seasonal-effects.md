# Agent 3: Seasonal Effects Feature Module

## Mission
Create a self-contained `features/seasonal-effects/` module for all seasonal/weather visual effects.

## Ownership Boundaries

**FILES YOU OWN (only you touch these):**
- `src/components/ChristmasEffects.tsx` → Move to feature
- `src/components/HalloweenEffects.tsx` → Move to feature
- `src/components/WeatherEffects.tsx` → Move to feature
- `src/lib/weather.ts` → Move to feature
- `src/lib/snowPhysics.ts` → Move to feature
- Create new: `src/features/seasonal-effects/`

**FILES YOU MUST NOT TOUCH:**
- `src/components/core/` (Agent 1)
- `src/components/shared/` (Agent 2)
- Any other feature folders
- Store files (except reading for reference)
- App.tsx, layout files

---

## Task 1: Create Feature Directory Structure

```
src/features/seasonal-effects/
├── components/
│   ├── ChristmasEffects.tsx
│   ├── HalloweenEffects.tsx
│   ├── WeatherEffects.tsx
│   └── index.ts
├── hooks/
│   ├── useWeatherData.ts
│   ├── useSeasonalTheme.ts
│   └── index.ts
├── utils/
│   ├── weather.ts
│   ├── snowPhysics.ts
│   └── index.ts
├── types.ts
├── constants.ts
└── index.ts
```

---

## Task 2: Create Types File

Create `src/features/seasonal-effects/types.ts`:
```typescript
export type SeasonalTheme = 'christmas' | 'halloween' | 'weather' | null

export interface WeatherData {
  temperature: number
  condition: 'clear' | 'cloudy' | 'rainy' | 'snowy' | 'stormy'
  humidity: number
  windSpeed: number
  location?: string
}

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
```

---

## Task 3: Create Constants File

Create `src/features/seasonal-effects/constants.ts`:
```typescript
import type { ChristmasConfig, HalloweenConfig } from './types'

export const DEFAULT_CHRISTMAS_CONFIG: ChristmasConfig = {
  snowEnabled: true,
  snowOpacity: 0.8,
  snowDensity: 100,
  snowSize: 1,
  blusteryness: 0.5,
  useLocalWeather: false,
  sleighEnabled: true,
  sleighDirection: 'push',
}

export const DEFAULT_HALLOWEEN_CONFIG: HalloweenConfig = {
  sparksEnabled: true,
  sparksOpacity: 0.7,
  sparksSpeed: 1,
  ghostsOpacity: 0.5,
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
```

---

## Task 4: Move Snow Physics Utility

### Steps
1. Read `src/lib/snowPhysics.ts`
2. Create `src/features/seasonal-effects/utils/snowPhysics.ts` with the content
3. Create re-export stub at original location:
```typescript
// src/lib/snowPhysics.ts
// Re-export from seasonal-effects feature
export * from '../features/seasonal-effects/utils/snowPhysics'
```

---

## Task 5: Move Weather Utility

### Steps
1. Read `src/lib/weather.ts`
2. Create `src/features/seasonal-effects/utils/weather.ts` with the content
3. Create re-export stub at original location:
```typescript
// src/lib/weather.ts
// Re-export from seasonal-effects feature
export * from '../features/seasonal-effects/utils/weather'
```

---

## Task 6: Create Utils Index

Create `src/features/seasonal-effects/utils/index.ts`:
```typescript
export * from './snowPhysics'
export * from './weather'
```

---

## Task 7: Create Hooks

### Create `src/features/seasonal-effects/hooks/useSeasonalTheme.ts`:
```typescript
import { useMemo } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import type { SeasonalTheme } from '../types'
import { CHRISTMAS_DATE_RANGE, HALLOWEEN_DATE_RANGE } from '../constants'

function isDateInRange(
  date: Date,
  range: { start: { month: number; day: number }; end: { month: number; day: number } }
): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()
  
  if (range.start.month <= range.end.month) {
    return (
      (month > range.start.month || (month === range.start.month && day >= range.start.day)) &&
      (month < range.end.month || (month === range.end.month && day <= range.end.day))
    )
  }
  // Handle year wrap (e.g., Dec-Jan)
  return (
    month > range.start.month || 
    (month === range.start.month && day >= range.start.day) ||
    month < range.end.month || 
    (month === range.end.month && day <= range.end.day)
  )
}

export function useSeasonalTheme(): SeasonalTheme {
  const theme = usePDMStore(s => s.theme)
  const autoApply = usePDMStore(s => s.autoApplySeasonalThemes)
  
  return useMemo(() => {
    // Manual theme selection takes priority
    if (theme === 'christmas') return 'christmas'
    if (theme === 'halloween') return 'halloween'
    if (theme === 'weather') return 'weather'
    
    // Auto-apply based on date
    if (autoApply) {
      const now = new Date()
      if (isDateInRange(now, CHRISTMAS_DATE_RANGE)) return 'christmas'
      if (isDateInRange(now, HALLOWEEN_DATE_RANGE)) return 'halloween'
    }
    
    return null
  }, [theme, autoApply])
}
```

### Create `src/features/seasonal-effects/hooks/useWeatherData.ts`:
```typescript
import { useState, useEffect } from 'react'
import type { WeatherData } from '../types'
import { fetchWeatherData } from '../utils/weather'

export function useWeatherData(enabled: boolean) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setWeather(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetchWeatherData()
      .then(data => {
        if (!cancelled) {
          setWeather(data)
          setError(null)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return { weather, loading, error }
}
```

### Create `src/features/seasonal-effects/hooks/index.ts`:
```typescript
export { useSeasonalTheme } from './useSeasonalTheme'
export { useWeatherData } from './useWeatherData'
```

---

## Task 8: Move Christmas Effects Component

### Steps
1. Read `src/components/ChristmasEffects.tsx`
2. Create `src/features/seasonal-effects/components/ChristmasEffects.tsx`
3. Update internal imports to use relative paths within feature:
   - `../utils/snowPhysics` instead of `@/lib/snowPhysics`
   - `../hooks/useWeatherData` if applicable
4. Create re-export stub at original location:
```typescript
// src/components/ChristmasEffects.tsx
export { ChristmasEffects } from '@/features/seasonal-effects'
```

---

## Task 9: Move Halloween Effects Component

### Steps
1. Read `src/components/HalloweenEffects.tsx`
2. Create `src/features/seasonal-effects/components/HalloweenEffects.tsx`
3. Update internal imports
4. Create re-export stub at original location:
```typescript
// src/components/HalloweenEffects.tsx
export { HalloweenEffects } from '@/features/seasonal-effects'
```

---

## Task 10: Move Weather Effects Component

### Steps
1. Read `src/components/WeatherEffects.tsx`
2. Create `src/features/seasonal-effects/components/WeatherEffects.tsx`
3. Update internal imports to use `../utils/weather` and `../hooks/useWeatherData`
4. Create re-export stub at original location:
```typescript
// src/components/WeatherEffects.tsx
export { WeatherEffects } from '@/features/seasonal-effects'
```

---

## Task 11: Create Components Index

Create `src/features/seasonal-effects/components/index.ts`:
```typescript
export { ChristmasEffects } from './ChristmasEffects'
export { HalloweenEffects } from './HalloweenEffects'
export { WeatherEffects } from './WeatherEffects'
```

---

## Task 12: Create Main Feature Index

Create `src/features/seasonal-effects/index.ts`:
```typescript
// Components
export { ChristmasEffects, HalloweenEffects, WeatherEffects } from './components'

// Hooks
export { useSeasonalTheme, useWeatherData } from './hooks'

// Utils (for consumers who need direct access)
export * from './utils'

// Types
export type { 
  SeasonalTheme, 
  WeatherData, 
  ChristmasConfig, 
  HalloweenConfig,
  SnowflakeConfig 
} from './types'

// Constants
export { 
  DEFAULT_CHRISTMAS_CONFIG, 
  DEFAULT_HALLOWEEN_CONFIG,
  CHRISTMAS_DATE_RANGE,
  HALLOWEEN_DATE_RANGE
} from './constants'
```

---

## Task 13: Create Features Index (if doesn't exist)

Create `src/features/index.ts` if it doesn't exist:
```typescript
// Feature modules
export * from './seasonal-effects'
```

---

## Verification Checklist

- [ ] `src/features/seasonal-effects/` directory structure complete
- [ ] All three effect components moved with proper imports
- [ ] `snowPhysics.ts` and `weather.ts` moved to utils/
- [ ] Hooks created for weather data and theme detection
- [ ] Types and constants properly defined
- [ ] Re-export stubs created at original locations
- [ ] `npm run typecheck` passes
- [ ] Effects still work in the app (visual verification)

---

## Notes for Agent

1. **Test effects visually** - Set theme to christmas/halloween in settings to verify
2. **Preserve Canvas/animation logic** - Don't simplify the physics, just reorganize
3. **Keep store integration** - Components still read from usePDMStore for config
4. **Weather API** - Ensure weather.ts API calls work after move
