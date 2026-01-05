// Tick Slider Component - A visual slider with snap points
import { useState, useRef, useEffect } from 'react'

interface TickSliderProps {
  value: number
  min: number
  max: number
  step: number
  snapPoints: number[]
  onChange: (value: number) => void
}

export function TickSlider({ value, min, max, step, snapPoints, onChange }: TickSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  // Calculate position percentage
  const getPercent = (val: number) => ((val - min) / (max - min)) * 100
  
  // Snap to nearest point if within threshold
  const snapThreshold = ((max - min) / snapPoints.length) * 0.3
  const getSnappedValue = (val: number) => {
    for (const point of snapPoints) {
      if (Math.abs(val - point) <= snapThreshold) {
        return point
      }
    }
    return val
  }
  
  // Handle mouse move
  const handleMove = (clientX: number) => {
    if (!sliderRef.current) return
    
    const rect = sliderRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const rawValue = min + percent * (max - min)
    const snappedValue = getSnappedValue(rawValue)
    const steppedValue = Math.round(snappedValue / step) * step
    const clampedValue = Math.max(min, Math.min(max, steppedValue))
    
    onChange(clampedValue)
  }
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    handleMove(e.clientX)
  }
  
  useEffect(() => {
    if (!isDragging) return
    
    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX)
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])
  
  return (
    <div 
      ref={sliderRef}
      className="relative h-6 cursor-pointer select-none"
      onMouseDown={handleMouseDown}
    >
      {/* Track background */}
      <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-plm-border rounded-full" />
      
      {/* Filled track */}
      <div 
        className="absolute top-1/2 left-0 h-1 -translate-y-1/2 bg-plm-accent rounded-full"
        style={{ width: `${getPercent(value)}%` }}
      />
      
      {/* Tick marks */}
      {snapPoints.map((point) => {
        const percent = getPercent(point)
        const isActive = value >= point
        const isAtValue = Math.abs(value - point) < step
        return (
          <div
            key={point}
            className={`absolute top-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
              isAtValue ? 'bg-plm-fg scale-125' : isActive ? 'bg-plm-accent' : 'bg-plm-fg-muted/40'
            }`}
            style={{ left: `${percent}%` }}
          />
        )
      })}
      
      {/* Thumb */}
      <div
        className={`absolute top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 bg-plm-fg rounded-full shadow-lg border-2 border-plm-accent transition-transform ${
          isDragging ? 'scale-125' : 'hover:scale-110'
        }`}
        style={{ left: `${getPercent(value)}%` }}
      />
    </div>
  )
}
