import { useState, useEffect, useRef } from 'react'
import { usePDMStore } from '@/stores/pdmStore'

// 🎃 HALLOWEEN EFFECTS COMPONENT 👻
// Adds spooky magic when the Halloween theme is active

interface Spark {
  id: number
  x: number
  y: number
  size: number
  speed: number
  baseOpacity: number // Original opacity (doesn't change)
  wobble: number
  wobbleSpeed: number
  color: string // orange to red gradient
}

interface FlyingGhost {
  id: number
  x: number
  y: number
  size: number
  speed: number
  active: boolean
}

interface Pumpkin {
  id: number
  x: number
  y: number
  size: number
  glowIntensity: number
  glowSpeed: number
}

export function HalloweenEffects() {
  const theme = usePDMStore(s => s.theme)
  const ghostsOpacity = usePDMStore(s => s.halloweenGhostsOpacity)
  const sparksOpacity = usePDMStore(s => s.halloweenSparksOpacity)
  const sparksSpeed = usePDMStore(s => s.halloweenSparksSpeed)
  const setGhostsOpacity = usePDMStore(s => s.setHalloweenGhostsOpacity)
  const setSparksOpacity = usePDMStore(s => s.setHalloweenSparksOpacity)
  const setSparksSpeed = usePDMStore(s => s.setHalloweenSparksSpeed)
  
  const [sparks, setSparks] = useState<Spark[]>([])
  const [flyingGhosts, setFlyingGhosts] = useState<FlyingGhost[]>([])
  const [pumpkins, setPumpkins] = useState<Pumpkin[]>([])
  const [showControls, setShowControls] = useState(false)
  const animationRef = useRef<number>(0)
  const sparksSpeedRef = useRef(sparksSpeed ?? 40)
  const ghostsOpacityRef = useRef(ghostsOpacity ?? 30)
  
  // Keep refs in sync
  useEffect(() => {
    sparksSpeedRef.current = sparksSpeed ?? 40
  }, [sparksSpeed])
  
  useEffect(() => {
    ghostsOpacityRef.current = ghostsOpacity ?? 30
  }, [ghostsOpacity])
  
  // Only render if Halloween theme is active
  const isHalloween = theme === 'halloween'
  
  // Spark colors - orange to red gradient
  const sparkColors = ['#ff6b2b', '#ff5500', '#ff4400', '#ff3300', '#ff8844', '#ffaa55', '#ff7733']
  
  // Initialize pumpkins (static decorations)
  useEffect(() => {
    if (!isHalloween) return
    
    const newPumpkins: Pumpkin[] = []
    for (let i = 0; i < 5; i++) {
      newPumpkins.push({
        id: i,
        x: Math.random() * 90 + 5,
        y: 95, // Near bottom
        size: Math.random() * 15 + 20,
        glowIntensity: Math.random() * 0.3 + 0.5,
        glowSpeed: Math.random() * 1 + 0.5,
      })
    }
    setPumpkins(newPumpkins)
  }, [isHalloween])
  
  // Initialize flying ghosts - several small ghosts that fly across the top
  useEffect(() => {
    if (!isHalloween) {
      setFlyingGhosts([])
      return
    }
    
    // Create ghost slots - they'll be activated periodically
    const ghosts: FlyingGhost[] = []
    for (let i = 0; i < 5; i++) {
      ghosts.push({
        id: i,
        x: -100 - (i * 200), // Stagger starting positions off-screen
        y: 3 + Math.random() * 8, // 3-11% from top
        size: 25 + Math.random() * 20, // 25-45px (smaller ghosts)
        speed: 1.5 + Math.random() * 1.5, // 1.5-3 speed
        active: false,
      })
    }
    setFlyingGhosts(ghosts)
    
    // Activate ghosts periodically
    const activateGhost = () => {
      if (ghostsOpacityRef.current <= 0) return
      
      setFlyingGhosts(prev => {
        const inactive = prev.filter(g => !g.active)
        if (inactive.length === 0) return prev
        
        // Activate a random inactive ghost
        const ghostToActivate = inactive[Math.floor(Math.random() * inactive.length)]
        return prev.map(g => 
          g.id === ghostToActivate.id 
            ? { 
                ...g, 
                active: true, 
                x: -80,
                y: 3 + Math.random() * 8,
                size: 25 + Math.random() * 20,
                speed: 1.5 + Math.random() * 1.5,
              } 
            : g
        )
      })
    }
    
    // Start first ghost quickly, then periodically
    const firstTimeout = setTimeout(activateGhost, 2000)
    const interval = setInterval(activateGhost, 8000 + Math.random() * 7000) // Every 8-15 seconds
    
    return () => {
      clearTimeout(firstTimeout)
      clearInterval(interval)
    }
  }, [isHalloween])
  
  // Initialize sparks and animate everything
  useEffect(() => {
    if (!isHalloween) {
      setSparks([])
      return
    }
    
    // Create initial sparks
    const initialSparks: Spark[] = []
    for (let i = 0; i < 80; i++) {
      initialSparks.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 120,
        size: Math.random() * 4 + 2,
        speed: Math.random() * 2 + 1,
        baseOpacity: Math.random() * 0.8 + 0.2,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.05 + 0.02,
        color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
      })
    }
    setSparks(initialSparks)
    
    // Main animation loop
    const animate = () => {
      const speedValue = sparksSpeedRef.current ?? 40
      const speedMultiplier = 0.1 + (speedValue / 100) * 2.9
      
      // Animate sparks
      setSparks(prev => prev.map(spark => {
        let newY = spark.y - spark.speed * 0.1 * speedMultiplier
        let newWobble = spark.wobble + spark.wobbleSpeed
        let newX = spark.x + Math.sin(newWobble) * 0.1
        let newBaseOpacity = spark.baseOpacity
        
        if (newY < -5) {
          newY = 105 + Math.random() * 10
          newX = Math.random() * 100
          newBaseOpacity = Math.random() * 0.8 + 0.2
          return {
            ...spark,
            x: newX,
            y: newY,
            wobble: newWobble,
            baseOpacity: newBaseOpacity,
            color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
            size: Math.random() * 4 + 2,
            speed: Math.random() * 2 + 1,
          }
        }
        
        return { ...spark, x: newX, y: newY, wobble: newWobble }
      }))
      
      // Animate flying ghosts
      setFlyingGhosts(prev => prev.map(ghost => {
        if (!ghost.active) return ghost
        
        const newX = ghost.x + ghost.speed
        
        // Deactivate if off screen right
        if (newX > window.innerWidth + 100) {
          return { ...ghost, active: false, x: -100 }
        }
        
        return { ...ghost, x: newX }
      }))
      
      animationRef.current = requestAnimationFrame(animate)
    }
    
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isHalloween])
  
  if (!isHalloween) return null
  
  return (
    <>
      {/* Background gradient with spooky atmosphere */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: -10,
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(139, 0, 0, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 30%, rgba(189, 147, 249, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 100%, rgba(255, 107, 43, 0.25) 0%, transparent 50%),
            linear-gradient(to bottom, #050505 0%, #0d0d0d 100%)
          `,
        }}
      />
      
      {/* Bonfire glow at the bottom */}
      <div 
        className="fixed inset-x-0 bottom-0 pointer-events-none"
        style={{ 
          zIndex: -9,
          height: '40%',
          background: `
            radial-gradient(ellipse 120% 60% at 50% 100%, rgba(255, 107, 43, 0.35) 0%, rgba(255, 85, 0, 0.2) 30%, transparent 70%),
            radial-gradient(ellipse 80% 40% at 50% 100%, rgba(255, 68, 0, 0.25) 0%, transparent 60%)
          `,
          animation: 'bonfireGlow 3s ease-in-out infinite',
        }}
      />
      
      {/* Secondary ambient glow */}
      <div 
        className="fixed inset-x-0 bottom-0 pointer-events-none"
        style={{ 
          zIndex: -9,
          height: '25%',
          background: `
            radial-gradient(ellipse 100% 50% at 50% 100%, rgba(255, 140, 0, 0.2) 0%, transparent 70%)
          `,
          animation: 'bonfireGlow 2s ease-in-out infinite 0.5s',
        }}
      />
      
      {/* Moon */}
      <div 
        className="fixed pointer-events-none"
        style={{ 
          zIndex: -8,
          top: '8%',
          right: '12%',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 40%, #fffacd 0%, #ffd700 60%, #daa520 100%)',
          boxShadow: '0 0 60px rgba(255, 215, 0, 0.4), 0 0 100px rgba(255, 215, 0, 0.2)',
          opacity: 0.9,
        }}
      >
        <div style={{ position: 'absolute', top: '25%', left: '30%', width: '15px', height: '15px', borderRadius: '50%', background: 'rgba(139, 119, 42, 0.3)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '55%', width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(139, 119, 42, 0.25)' }} />
      </div>
      
      {/* Flying ghosts across the top */}
      {(ghostsOpacity ?? 30) > 0 && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 10000 }}>
          {flyingGhosts.filter(g => g.active).map(ghost => (
            <div
              key={ghost.id}
              style={{
                position: 'absolute',
                left: `${ghost.x}px`,
                top: `${ghost.y}%`,
                width: `${ghost.size}px`,
                height: `${ghost.size * 1.3}px`,
                opacity: (ghostsOpacity ?? 30) / 100,
              }}
            >
              <svg viewBox="0 0 40 52" style={{ width: '100%', height: '100%' }}>
                <defs>
                  <filter id={`flying-ghost-glow-${ghost.id}`}>
                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <path 
                  d="M20 0 C8 0 0 10 0 22 L0 42 L8 35 L16 42 L24 35 L32 42 L40 35 L40 22 C40 10 32 0 20 0 Z" 
                  fill="white"
                  fillOpacity="0.85"
                  filter={`url(#flying-ghost-glow-${ghost.id})`}
                />
                <circle cx="12" cy="18" r="3" fill="#1a1a1a" fillOpacity="0.9" />
                <circle cx="28" cy="18" r="3" fill="#1a1a1a" fillOpacity="0.9" />
                <ellipse cx="20" cy="27" rx="4" ry="5" fill="#1a1a1a" fillOpacity="0.7" />
              </svg>
            </div>
          ))}
        </div>
      )}
      
      {/* Bonfire sparks floating upward */}
      {sparksOpacity > 0 && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 9999 }}>
          {sparks.map(spark => {
            let displayOpacity = spark.baseOpacity
            if (spark.y < 30) {
              displayOpacity = spark.baseOpacity * (spark.y / 30)
            }
            
            return (
              <div
                key={spark.id}
                style={{
                  position: 'absolute',
                  left: `${spark.x}%`,
                  top: `${spark.y}%`,
                  width: `${spark.size}px`,
                  height: `${spark.size}px`,
                  borderRadius: '50%',
                  backgroundColor: spark.color,
                  opacity: displayOpacity * (sparksOpacity / 100),
                  boxShadow: `0 0 ${spark.size * 2}px ${spark.color}, 0 0 ${spark.size}px ${spark.color}`,
                  filter: 'blur(0.5px)',
                }}
              />
            )
          })}
        </div>
      )}
      
      {/* Glowing pumpkins at bottom */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: -6 }}>
        {pumpkins.map(pumpkin => (
          <div
            key={pumpkin.id}
            style={{
              position: 'absolute',
              left: `${pumpkin.x}%`,
              bottom: '2%',
              width: `${pumpkin.size}px`,
              height: `${pumpkin.size * 0.9}px`,
              animation: `pumpkinGlow ${pumpkin.glowSpeed}s ease-in-out infinite`,
            }}
          >
            <svg viewBox="0 0 50 45" style={{ width: '100%', height: '100%' }}>
              <path d="M23 5 Q25 0 27 5 L26 10 L24 10 Z" fill="#228B22" />
              <ellipse cx="25" cy="27" rx="24" ry="17" fill="#ff6b2b" />
              <ellipse cx="12" cy="27" rx="8" ry="17" fill="#e85a20" />
              <ellipse cx="25" cy="27" rx="7" ry="17" fill="#ff7a40" />
              <ellipse cx="38" cy="27" rx="8" ry="17" fill="#e85a20" />
              <polygon points="15,22 20,22 17.5,28" fill="#ffb347" style={{ filter: 'drop-shadow(0 0 5px #ff6b2b)' }} />
              <polygon points="30,22 35,22 32.5,28" fill="#ffb347" style={{ filter: 'drop-shadow(0 0 5px #ff6b2b)' }} />
              <path d="M18 32 Q25 40 32 32 L30 34 Q25 38 20 34 Z" fill="#ffb347" style={{ filter: 'drop-shadow(0 0 5px #ff6b2b)' }} />
            </svg>
          </div>
        ))}
      </div>
      
      {/* Halloween controls button */}
      <div 
        className="fixed bottom-4 right-4"
        style={{ zIndex: 10001 }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        {showControls && (
          <div className="mb-2 p-2.5 bg-plm-bg-lighter rounded-lg border border-plm-border shadow-lg text-xs min-w-[160px]">
            <div className="text-plm-fg-muted mb-2">🎃 Halloween Effects</div>
            
            <div className="mb-2 px-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-plm-fg">👻 Ghosts</span>
                <span className="text-plm-fg-muted">{ghostsOpacity ?? 30}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={ghostsOpacity ?? 30}
                onChange={(e) => setGhostsOpacity(Number(e.target.value))}
                className="w-full h-1.5 bg-plm-border rounded-full appearance-none cursor-pointer accent-orange-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm"
              />
            </div>
            
            <div className="mb-2 px-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-plm-fg">🔥 Sparks</span>
                <span className="text-plm-fg-muted">{sparksOpacity ?? 70}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sparksOpacity ?? 70}
                onChange={(e) => setSparksOpacity(Number(e.target.value))}
                className="w-full h-1.5 bg-plm-border rounded-full appearance-none cursor-pointer accent-orange-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm"
              />
            </div>
            
            <div className="px-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-plm-fg">💨 Spark Speed</span>
                <span className="text-plm-fg-muted">{sparksSpeed ?? 40}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={sparksSpeed ?? 40}
                onChange={(e) => setSparksSpeed(Number(e.target.value))}
                className="w-full h-1.5 bg-plm-border rounded-full appearance-none cursor-pointer accent-orange-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm"
              />
            </div>
          </div>
        )}
        <button
          onClick={() => setShowControls(s => !s)}
          className="w-10 h-10 rounded-full bg-plm-accent/20 hover:bg-plm-accent/30 border border-plm-accent/50 flex items-center justify-center text-xl transition-colors"
          title="Halloween Settings"
        >
          🎃
        </button>
      </div>
      
      {/* CSS animations */}
      <style>{`
        @keyframes pumpkinGlow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(255, 107, 43, 0.6)); }
          50% { filter: drop-shadow(0 0 15px rgba(255, 107, 43, 0.9)); }
        }
        
        @keyframes bonfireGlow {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  )
}

export default HalloweenEffects
