import { useState, useMemo, useRef, useEffect } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  GripVertical,
  Lock,
  RotateCcw,
  Save,
  Download,
  Loader2,
  Package,
  Minus,
  Plus,
  X,
  ChevronRight,
  Palette,
  Edit2,
  Users
} from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'
import {
  MODULE_GROUPS,
  MODULES,
  canToggleModule,
  isModuleVisible,
  buildCombinedOrderList,
  getChildModules,
  type ModuleId,
  type OrderListItem,
  type CustomGroup
} from '../../types/modules'

// Available icons for custom groups (300+ options)
const AVAILABLE_ICONS = [
  // Folders & Files
  'FolderTree', 'Folder', 'FolderOpen', 'FolderClosed', 'FolderArchive', 'FolderCheck', 'FolderCog', 'FolderDot', 'FolderGit', 'FolderGit2', 'FolderHeart', 'FolderInput', 'FolderKanban', 'FolderKey', 'FolderLock', 'FolderMinus', 'FolderOutput', 'FolderPlus', 'FolderRoot', 'FolderSearch', 'FolderSymlink', 'FolderSync', 'FolderUp', 'FolderX', 'Folders',
  'File', 'FileArchive', 'FileAudio', 'FileBadge', 'FileBox', 'FileCheck', 'FileClock', 'FileCode', 'FileCog', 'FileDiff', 'FileDigit', 'FileDown', 'FileHeart', 'FileImage', 'FileInput', 'FileJson', 'FileKey', 'FileLock', 'FileMinus', 'FileOutput', 'FilePen', 'FilePlus', 'FileQuestion', 'FileScan', 'FileSearch', 'FileSliders', 'FileSpreadsheet', 'FileStack', 'FileSymlink', 'FileTerminal', 'FileText', 'FileType', 'FileUp', 'FileVideo', 'FileVolume', 'FileWarning', 'FileX', 'Files',
  
  // Boxes & Packages
  'Package', 'PackageCheck', 'PackageMinus', 'PackageOpen', 'PackagePlus', 'PackageSearch', 'PackageX', 'Box', 'Boxes', 'Archive', 'ArchiveRestore', 'ArchiveX',
  
  // Shapes
  'Shapes', 'Triangle', 'Square', 'Circle', 'Hexagon', 'Octagon', 'Pentagon', 'Diamond', 'Asterisk', 'CircleDot', 'CircleDotDashed', 'SquareDot', 'Spline',
  
  // Data & Storage
  'Database', 'DatabaseBackup', 'DatabaseZap', 'HardDrive', 'HardDriveDownload', 'HardDriveUpload', 'Server', 'ServerCog', 'ServerCrash', 'ServerOff', 'Cloud', 'CloudCog', 'CloudDownload', 'CloudUpload', 'CloudOff', 'CloudRain', 'CloudSun',
  
  // Layout & Grid
  'Layers', 'Layers2', 'Layers3', 'LayoutGrid', 'LayoutList', 'LayoutDashboard', 'LayoutTemplate', 'LayoutPanelLeft', 'LayoutPanelTop', 'Grid2X2', 'Grid3X3', 'AlignLeft', 'AlignCenter', 'AlignRight', 'AlignJustify', 'Columns', 'Rows', 'Table', 'Table2', 'Kanban', 'KanbanSquare', 'Trello',
  
  // Workflow & Process
  'Workflow', 'GitBranch', 'GitCommit', 'GitFork', 'GitMerge', 'GitPullRequest', 'GitCompare', 'Network', 'Share', 'Share2', 'Link', 'Link2', 'Unlink', 'ExternalLink', 'Puzzle', 'Component', 'Blocks', 'Cpu', 'Cog', 'Settings', 'Settings2', 'Wrench', 'Hammer', 'SlidersHorizontal', 'SlidersVertical',
  
  // Navigation & Arrows
  'Navigation', 'Navigation2', 'Compass', 'Map', 'MapPin', 'MapPinned', 'Milestone', 'Signpost', 'SignpostBig', 'Route', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowUpRight', 'ArrowDownLeft', 'MoveRight', 'MoveLeft', 'MoveUp', 'MoveDown', 'CornerDownRight', 'CornerUpLeft', 'Undo', 'Redo', 'RefreshCw', 'RefreshCcw', 'RotateCw', 'RotateCcw',
  
  // Status & Indicators
  'Star', 'StarHalf', 'StarOff', 'Heart', 'HeartCrack', 'HeartHandshake', 'HeartOff', 'HeartPulse', 'Bookmark', 'BookmarkCheck', 'BookmarkMinus', 'BookmarkPlus', 'BookmarkX', 'Tag', 'Tags', 'Flag', 'FlagOff', 'FlagTriangleLeft', 'FlagTriangleRight', 'Award', 'Trophy', 'Medal', 'Crown', 'Gem', 'Sparkle', 'Sparkles', 'Zap', 'ZapOff', 'Flame', 'FlameKindling',
  
  // People & Users
  'Users', 'User', 'UserCheck', 'UserCog', 'UserMinus', 'UserPlus', 'UserX', 'UserCircle', 'UserSquare', 'UsersRound', 'Contact', 'Contact2', 'PersonStanding', 'Accessibility', 'Baby', 'Footprints', 'HandMetal', 'Hand', 'Handshake', 'ThumbsUp', 'ThumbsDown',
  
  // Communication
  'Mail', 'MailCheck', 'MailMinus', 'MailOpen', 'MailPlus', 'MailQuestion', 'MailSearch', 'MailWarning', 'MailX', 'Mails', 'Inbox', 'Send', 'SendHorizontal', 'Forward', 'Reply', 'ReplyAll', 'MessageCircle', 'MessageSquare', 'MessagesSquare', 'AtSign', 'Hash', 'Bell', 'BellDot', 'BellMinus', 'BellOff', 'BellPlus', 'BellRing', 'Megaphone', 'Radio', 'Rss', 'Podcast', 'Mic', 'MicOff', 'Phone', 'PhoneCall', 'PhoneForwarded', 'PhoneIncoming', 'PhoneMissed', 'PhoneOff', 'PhoneOutgoing', 'Video', 'VideoOff', 'Webcam',
  
  // Documents & Notes
  'Book', 'BookA', 'BookCheck', 'BookCopy', 'BookDashed', 'BookDown', 'BookHeadphones', 'BookHeart', 'BookImage', 'BookKey', 'BookLock', 'BookMarked', 'BookMinus', 'BookOpen', 'BookOpenCheck', 'BookOpenText', 'BookPlus', 'BookText', 'BookType', 'BookUp', 'BookUser', 'BookX', 'Library', 'LibraryBig', 'Notebook', 'NotebookPen', 'NotebookTabs', 'NotebookText', 'ClipboardList', 'ClipboardCheck', 'ClipboardCopy', 'ClipboardEdit', 'ClipboardMinus', 'ClipboardPaste', 'ClipboardPen', 'ClipboardPlus', 'ClipboardSignature', 'ClipboardType', 'ClipboardX', 'Newspaper', 'Scroll', 'ScrollText', 'StickyNote', 'NotepadText', 'NotepadTextDashed',
  
  // Tools & Building
  'Briefcase', 'BriefcaseBusiness', 'BriefcaseMedical', 'Hammer', 'Wrench', 'Screwdriver', 'PaintBucket', 'Paintbrush', 'Paintbrush2', 'Pen', 'PenLine', 'PenTool', 'Pencil', 'PencilLine', 'PencilRuler', 'Highlighter', 'Eraser', 'Scissors', 'Ruler', 'Scale', 'Scale3D', 'Pipette', 'Dropper', 'Syringe', 'FlaskConical', 'FlaskRound', 'TestTube', 'TestTubes', 'Microscope', 'Telescope', 'Binoculars', 'Crosshair', 'Target', 'Focus', 'ScanLine', 'Scan', 'ScanFace', 'ScanSearch', 'ScanText', 'QrCode',
  
  // Media & Images
  'Image', 'ImageDown', 'ImageMinus', 'ImageOff', 'ImagePlus', 'Images', 'Camera', 'CameraOff', 'Aperture', 'Focus', 'Film', 'Clapperboard', 'Play', 'Pause', 'PlayCircle', 'PauseCircle', 'StopCircle', 'SkipBack', 'SkipForward', 'FastForward', 'Rewind', 'Repeat', 'Repeat1', 'Shuffle', 'Music', 'Music2', 'Music3', 'Music4', 'Headphones', 'Speaker', 'Volume', 'Volume1', 'Volume2', 'VolumeX', 'Radio', 'Disc', 'Disc2', 'Disc3',
  
  // Weather & Nature
  'Sun', 'SunDim', 'SunMedium', 'SunMoon', 'Sunrise', 'Sunset', 'Moon', 'MoonStar', 'CloudSun', 'CloudMoon', 'CloudRain', 'CloudSnow', 'CloudLightning', 'CloudFog', 'Wind', 'Tornado', 'Rainbow', 'Umbrella', 'UmbrellaOff', 'Thermometer', 'ThermometerSun', 'ThermometerSnowflake', 'Snowflake', 'Droplet', 'Droplets', 'Waves', 'Leaf', 'TreeDeciduous', 'TreePine', 'Trees', 'Flower', 'Flower2', 'Sprout', 'Clover', 'Apple', 'Cherry', 'Citrus', 'Grape', 'Banana', 'Carrot', 'Salad', 'Wheat', 'Bean', 'Nut', 'Egg', 'Fish', 'Bird', 'Bug', 'Cat', 'Dog', 'Rabbit', 'Squirrel', 'Turtle', 'PawPrint', 'Bone',
  
  // Science & Math
  'Atom', 'Dna', 'FlaskConical', 'FlaskRound', 'TestTube', 'TestTubes', 'Microscope', 'Pi', 'Sigma', 'Omega', 'Infinity', 'Plus', 'Minus', 'X', 'Divide', 'Equal', 'Percent', 'Calculator', 'Binary', 'Braces', 'Brackets', 'Parentheses', 'Code', 'Code2', 'CodeXml', 'Terminal', 'TerminalSquare', 'Variable', 'Regex', 'Function', 'Diff',
  
  // Transport & Travel
  'Car', 'CarFront', 'CarTaxiFront', 'Bus', 'BusFront', 'Train', 'TrainFront', 'TrainTrack', 'Tram', 'TramFront', 'Ship', 'Sailboat', 'Anchor', 'Plane', 'PlaneLanding', 'PlaneTakeoff', 'Rocket', 'Bike', 'Truck', 'Ambulance', 'Cable', 'CableCar', 'Footprints', 'Fuel', 'Construction', 'Cone', 'TrafficCone', 'Warehouse', 'Factory', 'Building', 'Building2', 'Hotel', 'Landmark', 'Store', 'ShoppingBag', 'ShoppingBasket', 'ShoppingCart', 'Luggage', 'Tent', 'Caravan', 'Fence', 'ParkingCircle', 'ParkingSquare',
  
  // Security & Privacy
  'Lock', 'LockKeyhole', 'LockOpen', 'Unlock', 'UnlockKeyhole', 'Key', 'KeyRound', 'KeySquare', 'Shield', 'ShieldAlert', 'ShieldBan', 'ShieldCheck', 'ShieldEllipsis', 'ShieldHalf', 'ShieldMinus', 'ShieldOff', 'ShieldPlus', 'ShieldQuestion', 'ShieldX', 'Siren', 'Fingerprint', 'ScanFace', 'Eye', 'EyeOff', 'Glasses', 'View', 'UserCheck',
  
  // Finance & Commerce
  'Wallet', 'Wallet2', 'WalletCards', 'CreditCard', 'Banknote', 'Coins', 'PiggyBank', 'Receipt', 'ReceiptText', 'HandCoins', 'CircleDollarSign', 'DollarSign', 'Euro', 'PoundSterling', 'IndianRupee', 'JapaneseYen', 'Bitcoin', 'Landmark', 'Building', 'Store', 'ShoppingBag', 'ShoppingBasket', 'ShoppingCart', 'Gift', 'GiftCard', 'Ticket', 'TicketCheck', 'TicketMinus', 'TicketPlus', 'TicketSlash', 'TicketX', 'Percent', 'BadgePercent', 'TrendingUp', 'TrendingDown', 'BarChart', 'BarChart2', 'BarChart3', 'BarChart4', 'BarChartBig', 'BarChartHorizontal', 'BarChartHorizontalBig', 'LineChart', 'PieChart', 'Activity', 'AreaChart', 'CandlestickChart', 'GanttChart', 'ScatterChart',
  
  // Health & Medical
  'Heart', 'HeartPulse', 'Activity', 'Stethoscope', 'Pill', 'Tablets', 'Syringe', 'Thermometer', 'Cross', 'BriefcaseMedical', 'Hospital', 'Ambulance', 'Accessibility', 'Wheelchair', 'Brain', 'Bone', 'Hand', 'Ear', 'Eye', 'Dna', 'Microscope', 'Apple', 'Salad', 'Dumbbell', 'Bike', 'Footprints',
  
  // Gaming & Fun
  'Gamepad', 'Gamepad2', 'Joystick', 'Dice1', 'Dice2', 'Dice3', 'Dice4', 'Dice5', 'Dice6', 'Puzzle', 'ToyBrick', 'Ghost', 'Skull', 'Sword', 'Swords', 'Wand', 'Wand2', 'Crown', 'Castle', 'Drama', 'Laugh', 'Smile', 'SmilePlus', 'Meh', 'Frown', 'Angry', 'Annoyed', 'PartyPopper', 'Cake', 'CakeSlice', 'Cookie', 'Candy', 'IceCream', 'IceCream2', 'Popcorn', 'Pizza', 'Sandwich', 'Soup', 'Utensils', 'UtensilsCrossed', 'ChefHat', 'Wine', 'Beer', 'Coffee', 'Cup', 'GlassWater', 'Milk', 'Martini', 'Cigarette', 'CigaretteOff',
  
  // Misc Objects
  'Clock', 'Clock1', 'Clock2', 'Clock3', 'Clock4', 'Clock5', 'Clock6', 'Clock7', 'Clock8', 'Clock9', 'Clock10', 'Clock11', 'Clock12', 'Timer', 'TimerOff', 'TimerReset', 'Hourglass', 'AlarmClock', 'AlarmClockCheck', 'AlarmClockMinus', 'AlarmClockOff', 'AlarmClockPlus', 'Watch', 'Calendar', 'CalendarCheck', 'CalendarClock', 'CalendarDays', 'CalendarHeart', 'CalendarMinus', 'CalendarOff', 'CalendarPlus', 'CalendarRange', 'CalendarSearch', 'CalendarX', 'Lamp', 'LampCeiling', 'LampDesk', 'LampFloor', 'LampWallDown', 'LampWallUp', 'Lightbulb', 'LightbulbOff', 'Flashlight', 'FlashlightOff', 'Plug', 'PlugZap', 'Cable', 'Battery', 'BatteryCharging', 'BatteryFull', 'BatteryLow', 'BatteryMedium', 'BatteryWarning', 'Power', 'PowerOff', 'Magnet', 'Paperclip', 'Pin', 'PinOff', 'Scissors', 'Stamp', 'Sticker', 'Armchair', 'BedDouble', 'BedSingle', 'Bath', 'Sofa', 'DoorClosed', 'DoorOpen', 'Lamp', 'Fan', 'Heater', 'AirVent', 'Refrigerator', 'WashingMachine', 'Microwave', 'CookingPot', 'Tv', 'Tv2', 'Monitor', 'MonitorCheck', 'MonitorDot', 'MonitorDown', 'MonitorOff', 'MonitorPause', 'MonitorPlay', 'MonitorSmartphone', 'MonitorSpeaker', 'MonitorStop', 'MonitorUp', 'MonitorX', 'Laptop', 'Laptop2', 'Tablet', 'TabletSmartphone', 'Smartphone', 'SmartphoneCharging', 'SmartphoneNfc', 'Watch', 'Mouse', 'MousePointer', 'MousePointer2', 'MousePointerClick', 'Keyboard', 'Printer', 'ScanLine', 'HardDrive', 'Usb', 'Wifi', 'WifiOff', 'Bluetooth', 'BluetoothConnected', 'BluetoothOff', 'BluetoothSearching', 'Nfc', 'Signal', 'SignalHigh', 'SignalLow', 'SignalMedium', 'SignalZero', 'Antenna', 'Satellite', 'SatelliteDish', 'Globe', 'Globe2', 'Earth', 'Languages', 'Type', 'TypeOutline', 'CaseLower', 'CaseSensitive', 'CaseUpper', 'WholeWord', 'Baseline', 'Bold', 'Italic', 'Underline', 'Strikethrough', 'Subscript', 'Superscript', 'Quote', 'TextQuote', 'Heading', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6', 'Pilcrow', 'PilcrowSquare', 'List', 'ListChecks', 'ListCollapse', 'ListEnd', 'ListFilter', 'ListMinus', 'ListMusic', 'ListOrdered', 'ListPlus', 'ListRestart', 'ListStart', 'ListTodo', 'ListTree', 'ListVideo', 'ListX', 'CheckCheck', 'Check', 'CheckCircle', 'CheckCircle2', 'CheckSquare', 'CircleCheck', 'CircleCheckBig', 'SquareCheck', 'SquareCheckBig', 'BadgeCheck', 'Verified', 'ShieldCheck'
]

// Custom Google Drive icon to match ActivityBar
function GoogleDriveIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8.24 2L1 14.19L4.24 19.83L11.47 7.64L8.24 2Z" fill="currentColor"/>
      <path d="M15.76 2H8.24L15.47 14.19H22.99L15.76 2Z" fill="currentColor" fillOpacity="0.7"/>
      <path d="M1 14.19L4.24 19.83H19.76L22.99 14.19H1Z" fill="currentColor" fillOpacity="0.4"/>
    </svg>
  )
}

// Dynamic icon getter - supports all Lucide icons
function getIcon(iconName: string, size: number = 16): React.ReactNode {
  if (iconName === 'GoogleDrive') {
    return <GoogleDriveIcon size={size} />
  }
  
  // Get icon from Lucide dynamically
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[iconName]
  if (IconComponent && typeof IconComponent === 'function') {
    return <IconComponent size={size} />
  }
  
  // Fallback to Package icon
  return <Package size={size} />
}


// Preset colors for quick selection
const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#14b8a6', // teal
  '#84cc16', // lime
  '#a855f7', // purple
]

// Color picker component
function IconColorPicker({ 
  color, 
  onChange,
  onClose 
}: { 
  color: string | null
  onChange: (color: string | null) => void
  onClose: () => void
}) {
  const [customColor, setCustomColor] = useState(color || '#3b82f6')
  const inputRef = useRef<HTMLInputElement>(null)
  
  return (
    <div 
      className="absolute right-0 top-full mt-1 w-56 bg-plm-bg border border-plm-border rounded-lg shadow-xl z-50 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2">
        Icon Color
      </div>
      
      {/* Preset colors grid */}
      <div className="grid grid-cols-6 gap-1.5 mb-3">
        {PRESET_COLORS.map(presetColor => (
          <button
            key={presetColor}
            onClick={() => {
              onChange(presetColor)
              onClose()
            }}
            className={`w-7 h-7 rounded-md border-2 transition-all hover:scale-110 ${
              color === presetColor ? 'border-plm-fg ring-2 ring-plm-accent' : 'border-transparent'
            }`}
            style={{ backgroundColor: presetColor }}
            title={presetColor}
          />
        ))}
      </div>
      
      {/* Custom color picker */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-plm-border"
          />
        </div>
        <input
          type="text"
          value={customColor}
          onChange={(e) => {
            const val = e.target.value
            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
              setCustomColor(val)
            }
          }}
          placeholder="#000000"
          className="flex-1 px-2 py-1.5 text-xs bg-plm-bg-secondary border border-plm-border rounded font-mono"
        />
        <button
          onClick={() => {
            onChange(customColor)
            onClose()
          }}
          className="px-2 py-1.5 text-xs bg-plm-accent text-white rounded hover:bg-plm-accent/80 transition-colors"
        >
          Apply
        </button>
      </div>
      
      {/* Reset to default */}
      <button
        onClick={() => {
          onChange(null)
          onClose()
        }}
        className={`w-full px-3 py-2 text-xs text-left rounded transition-colors flex items-center gap-2 ${
          !color ? 'bg-plm-accent/20 text-plm-accent' : 'hover:bg-plm-highlight text-plm-fg-muted'
        }`}
      >
        <RotateCcw size={12} />
        Use default color
      </button>
    </div>
  )
}

// Icon picker dropdown with search
function IconPickerDropdown({
  selectedIcon,
  onSelect,
}: {
  selectedIcon: string
  onSelect: (iconName: string) => void
  onClose?: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  
  // Filter icons based on search query
  const filteredIcons = useMemo(() => {
    if (!searchQuery) return AVAILABLE_ICONS
    const query = searchQuery.toLowerCase()
    return AVAILABLE_ICONS.filter(iconName => 
      iconName.toLowerCase().includes(query)
    )
  }, [searchQuery])
  
  return (
    <div 
      className="absolute left-0 top-full mt-1 w-80 bg-plm-bg border border-plm-border rounded-lg shadow-xl z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search input */}
      <div className="p-2 border-b border-plm-border">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search icons..."
          className="w-full px-3 py-1.5 text-sm bg-plm-bg-secondary border border-plm-border rounded focus:border-plm-accent focus:outline-none"
        />
      </div>
      
      {/* Icon count */}
      <div className="px-3 py-1 text-[10px] text-plm-fg-dim">
        {filteredIcons.length} icons {searchQuery && `matching "${searchQuery}"`}
      </div>
      
      {/* Icons grid */}
      <div className="p-2 max-h-64 overflow-y-auto">
        {filteredIcons.length === 0 ? (
          <div className="text-center py-4 text-sm text-plm-fg-muted">
            No icons found
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {filteredIcons.map(iconName => (
              <button
                key={iconName}
                onClick={() => onSelect(iconName)}
                className={`p-2 rounded-md transition-colors ${
                  selectedIcon === iconName 
                    ? 'bg-plm-accent/20 text-plm-accent ring-1 ring-plm-accent' 
                    : 'text-plm-fg-muted hover:bg-plm-highlight hover:text-plm-fg'
                }`}
                title={iconName}
              >
                {getIcon(iconName, 16)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Group editor component for creating/editing custom groups
function GroupEditor({
  group,
  onSave,
  onCancel
}: {
  group?: CustomGroup
  onSave: (name: string, icon: string, iconColor: string | null) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(group?.name || '')
  const [icon, setIcon] = useState(group?.icon || 'Folder')
  const [iconColor, setIconColor] = useState(group?.iconColor || null)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  
  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), icon, iconColor)
    }
  }
  
  return (
    <div className="p-4 bg-plm-bg-secondary rounded-lg border border-plm-border space-y-4">
      <div className="text-sm font-medium text-plm-fg">
        {group ? 'Edit Group' : 'New Group'}
      </div>
      
      {/* Name input */}
      <div>
        <label className="text-xs text-plm-fg-muted block mb-1">Group Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Custom Group"
          className="w-full px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded-lg focus:border-plm-accent focus:outline-none"
          autoFocus
        />
      </div>
      
      {/* Icon and Color selection */}
      <div className="flex items-center gap-4">
        {/* Icon selector */}
        <div className="relative flex-1">
          <label className="text-xs text-plm-fg-muted block mb-1">Icon</label>
          <button
            onClick={() => {
              setShowIconPicker(!showIconPicker)
              setShowColorPicker(false)
            }}
            className="flex items-center gap-2 px-3 py-2 bg-plm-bg border border-plm-border rounded-lg hover:bg-plm-highlight transition-colors"
            style={iconColor ? { color: iconColor } : undefined}
          >
            {getIcon(icon, 16)}
            <span className="text-xs text-plm-fg-muted">Change</span>
          </button>
          
          {showIconPicker && (
            <IconPickerDropdown
              selectedIcon={icon}
              onSelect={(iconName) => {
                setIcon(iconName)
                setShowIconPicker(false)
              }}
              onClose={() => setShowIconPicker(false)}
            />
          )}
        </div>
        
        {/* Color selector */}
        <div className="relative">
          <label className="text-xs text-plm-fg-muted block mb-1">Color</label>
          <button
            onClick={() => {
              setShowColorPicker(!showColorPicker)
              setShowIconPicker(false)
            }}
            className="flex items-center gap-2 px-3 py-2 bg-plm-bg border border-plm-border rounded-lg hover:bg-plm-highlight transition-colors"
          >
            {iconColor ? (
              <div 
                className="w-4 h-4 rounded-full border border-white/30"
                style={{ backgroundColor: iconColor }}
              />
            ) : (
              <Palette size={16} className="text-plm-fg-muted" />
            )}
            <span className="text-xs text-plm-fg-muted">{iconColor || 'Default'}</span>
          </button>
          
          {showColorPicker && (
            <IconColorPicker
              color={iconColor}
              onChange={setIconColor}
              onClose={() => setShowColorPicker(false)}
            />
          )}
        </div>
      </div>
      
      {/* Preview */}
      <div>
        <label className="text-xs text-plm-fg-muted block mb-1">Preview</label>
        <div className="flex items-center gap-2 px-3 py-2 bg-plm-bg border border-plm-border rounded-lg">
          <div 
            className="p-1.5 rounded-md"
            style={iconColor ? { color: iconColor, backgroundColor: `${iconColor}15` } : { color: 'var(--plm-accent)' }}
          >
            {getIcon(icon, 16)}
          </div>
          <span className="text-sm text-plm-fg">{name || 'Group Name'}</span>
          <ChevronRight size={14} className="text-plm-fg-dim ml-auto" />
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="flex-1 px-4 py-2 text-sm bg-plm-accent text-white rounded-lg hover:bg-plm-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {group ? 'Save Changes' : 'Create Group'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-plm-border text-plm-fg-muted rounded-lg hover:bg-plm-highlight transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// Group list item component
function GroupListItemComponent({
  group,
  index,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  onEdit,
  onRemove
}: {
  group: CustomGroup
  index: number
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: () => void
  onDragEnd: () => void
  isDragging: boolean
  onEdit: (group: CustomGroup) => void
  onRemove: (groupId: string) => void
}) {
  const { moduleConfig } = usePDMStore()
  
  // Count children (modules assigned to this group)
  const childCount = getChildModules(group.id, moduleConfig).length
  
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-move ${
        isDragging 
          ? 'opacity-50 border-plm-accent bg-plm-accent/10' 
          : 'border-plm-accent/30 bg-gradient-to-r from-plm-accent/5 to-transparent hover:from-plm-accent/10'
      }`}
    >
      <GripVertical size={14} className="text-plm-fg-muted flex-shrink-0" />
      
      {/* Icon with custom color */}
      <div 
        className="p-1.5 rounded-md"
        style={group.iconColor ? { 
          color: group.iconColor,
          backgroundColor: `${group.iconColor}15`
        } : { color: 'var(--plm-accent)' }}
      >
        {getIcon(group.icon, 16)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-plm-fg font-medium">{group.name}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-plm-accent/20 text-plm-accent uppercase tracking-wide">
            Group
          </span>
          {childCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-plm-fg-muted/20 text-plm-fg-muted" title={`${childCount} item${childCount > 1 ? 's' : ''} in this group`}>
              <ChevronRight size={10} />
              {childCount}
            </span>
          )}
        </div>
      </div>
      
      {/* Edit button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onEdit(group)
        }}
        className="p-1.5 text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight rounded transition-colors"
        title="Edit group"
      >
        <Edit2 size={14} />
      </button>
      
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove(group.id)
        }}
        className="p-1.5 text-plm-fg-muted hover:text-plm-error hover:bg-plm-error/10 rounded transition-colors"
        title="Remove group"
      >
        <X size={14} />
      </button>
    </div>
  )
}

// Combined order list item (module or divider)
function OrderListItemComponent({
  item,
  index,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  dropIndicator,
  onSetParent,
  onSetIconColor,
  onEditGroup,
  onRemoveGroup
}: {
  item: OrderListItem
  index: number
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: () => void
  onDragEnd: () => void
  isDragging: boolean
  dropIndicator: { index: number; position: 'before' | 'after' } | null
  onSetParent?: (moduleId: ModuleId, parentId: string | null) => void
  onSetIconColor?: (moduleId: ModuleId, color: string | null) => void
  onEditGroup?: (group: CustomGroup) => void
  onRemoveGroup?: (groupId: string) => void
}) {
  // Check if drop indicator should show for this item
  const showDropBefore = dropIndicator?.index === index && dropIndicator.position === 'before'
  const showDropAfter = dropIndicator?.index === index && dropIndicator.position === 'after'
  const { moduleConfig, setModuleEnabled, removeDivider } = usePDMStore()
  const [showParentSelect, setShowParentSelect] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!showParentSelect && !showColorPicker) return
    
    const handleClickOutside = () => {
      setShowParentSelect(false)
      setShowColorPicker(false)
    }
    
    // Delay to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)
    
    return () => {
      clearTimeout(timeout)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showParentSelect, showColorPicker])
  
  // Handle group items
  if (item.type === 'group') {
    const group = moduleConfig.customGroups.find(g => g.id === item.id)
    if (!group) return null
    
    return (
      <div className="relative">
        {/* Drop indicator - before */}
        {showDropBefore && (
          <div className="absolute -top-1 left-0 right-0 h-0.5 bg-plm-accent z-10">
            <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
            <div className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
          </div>
        )}
        
        <GroupListItemComponent
          group={group}
          index={index}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          isDragging={isDragging}
          onEdit={(g) => onEditGroup?.(g)}
          onRemove={(id) => onRemoveGroup?.(id)}
        />
        
        {/* Drop indicator - after */}
        {showDropAfter && (
          <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-plm-accent z-10">
            <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
            <div className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
          </div>
        )}
      </div>
    )
  }
  
  if (item.type === 'divider') {
    return (
      <div className="relative">
        {/* Drop indicator - before */}
        {showDropBefore && (
          <div className="absolute -top-1 left-0 right-0 h-0.5 bg-plm-accent z-10">
            <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
            <div className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
          </div>
        )}
        
        <div
          draggable
          onDragStart={() => onDragStart(index)}
          onDragOver={(e) => onDragOver(e, index)}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-move ${
            isDragging 
              ? 'opacity-50 border-plm-accent bg-plm-accent/10' 
              : 'border-plm-border bg-plm-bg-secondary hover:border-plm-border/80'
          }`}
        >
          <GripVertical size={14} className="text-plm-fg-muted flex-shrink-0" />
          <div className="flex items-center gap-2 flex-1">
            <Minus size={16} className="text-plm-fg-muted" />
            <span className="text-xs text-plm-fg-muted font-medium uppercase tracking-wide">
              Divider
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeDivider(item.id)
            }}
            className="p-1 text-plm-fg-muted hover:text-plm-error rounded transition-colors"
            title="Remove divider"
          >
            <X size={14} />
          </button>
        </div>
        
        {/* Drop indicator - after */}
        {showDropAfter && (
          <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-plm-accent z-10">
            <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
            <div className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
          </div>
        )}
      </div>
    )
  }
  
  // Module item
  const moduleId = item.id as ModuleId
  const module = MODULES.find(m => m.id === moduleId)
  if (!module) return null
  
  const isVisible = isModuleVisible(moduleId, moduleConfig)
  const canToggle = canToggleModule(moduleId, moduleConfig)
  const isGroupEnabled = moduleConfig.enabledGroups[module.group]
  const group = MODULE_GROUPS.find(g => g.id === module.group)
  const isDisabledByGroup = group?.isMasterToggle && !isGroupEnabled
  
  const isEnabled = moduleConfig.enabledModules[moduleId]
  
  // Get current parent and children count
  const currentParentId = moduleConfig.moduleParents?.[moduleId] || null
  const currentParentModule = currentParentId && !currentParentId.startsWith('group-') 
    ? MODULES.find(m => m.id === currentParentId) 
    : null
  const currentParentGroup = currentParentId?.startsWith('group-') 
    ? moduleConfig.customGroups.find(g => g.id === currentParentId) 
    : null
  const childCount = getChildModules(moduleId, moduleConfig).length
  
  // Get custom icon color
  const customIconColor = moduleConfig.moduleIconColors?.[moduleId] || null
  
  // Get available parents (all modules except self and descendants, plus custom groups)
  const getDescendants = (id: string): string[] => {
    const children = getChildModules(id, moduleConfig)
    return [id, ...children.flatMap(c => getDescendants(c.id))]
  }
  const descendants = getDescendants(moduleId)
  const availableModuleParents = MODULES.filter(m => !descendants.includes(m.id))
  const availableGroupParents = moduleConfig.customGroups.filter(g => g.enabled)
  
  return (
    <div className="relative">
      {/* Drop indicator - before */}
      {showDropBefore && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-plm-accent z-10">
          <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
          <div className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
        </div>
      )}
      
      <div
        draggable
        onDragStart={() => onDragStart(index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-move ${
          isDragging 
            ? 'opacity-50 border-plm-accent bg-plm-accent/10' 
            : isEnabled && isVisible
            ? 'border-plm-success/30 bg-gradient-to-r from-plm-success/5 to-transparent hover:from-plm-success/10 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.1)]'
            : isVisible
            ? 'border-plm-border bg-plm-bg hover:bg-plm-highlight/50'
            : 'border-plm-border/50 bg-plm-bg-secondary'
        } ${currentParentId ? 'ml-6 border-l-2 border-l-plm-accent/30' : ''}`}
      >
        <GripVertical size={14} className="text-plm-fg-muted flex-shrink-0" />
      
      {/* Icon with custom color support */}
      <div 
        className={`p-1.5 rounded-md transition-all ${
          !customIconColor && (isEnabled && isVisible 
            ? 'text-plm-success bg-plm-success/10' 
            : isVisible 
            ? 'text-plm-accent' 
            : 'text-plm-fg-muted')
        }`}
        style={customIconColor ? { 
          color: customIconColor,
          backgroundColor: `${customIconColor}15`
        } : undefined}
      >
        {getIcon(module.icon, 16)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isVisible ? 'text-plm-fg' : 'text-plm-fg-muted'}`}>
            {module.name}
          </span>
          {module.required && (
            <span title="Required when group enabled">
              <Lock size={10} className="text-plm-fg-dim" />
            </span>
          )}
          {childCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-plm-accent/20 text-plm-accent" title={`Has ${childCount} sub-item${childCount > 1 ? 's' : ''}`}>
              <ChevronRight size={10} />
              {childCount}
            </span>
          )}
        </div>
        {(currentParentModule || currentParentGroup) && (
          <div className="text-[10px] text-plm-fg-dim mt-0.5">
            Sub-item of: {currentParentModule?.name || currentParentGroup?.name}
            {currentParentGroup && <span className="text-plm-accent ml-1">(group)</span>}
          </div>
        )}
      </div>
      
      {/* Color picker button */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowColorPicker(!showColorPicker)
            setShowParentSelect(false)
          }}
          className={`p-1.5 rounded transition-colors ${
            customIconColor 
              ? 'hover:bg-plm-highlight' 
              : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight'
          }`}
          title="Set icon color"
        >
          {customIconColor ? (
            <div 
              className="w-3.5 h-3.5 rounded-full border border-white/30"
              style={{ backgroundColor: customIconColor }}
            />
          ) : (
            <Palette size={14} />
          )}
        </button>
        
        {/* Color picker dropdown */}
        {showColorPicker && (
          <IconColorPicker
            color={customIconColor}
            onChange={(color) => onSetIconColor?.(moduleId, color)}
            onClose={() => setShowColorPicker(false)}
          />
        )}
      </div>
      
      {/* Parent selector button */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowParentSelect(!showParentSelect)
            setShowColorPicker(false)
          }}
          className={`p-1.5 rounded transition-colors ${
            currentParentId 
              ? 'text-plm-accent bg-plm-accent/10 hover:bg-plm-accent/20' 
              : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight'
          }`}
          title="Set parent module (create sub-group)"
        >
          <ChevronRight size={14} className={currentParentId ? 'rotate-90' : ''} />
        </button>
        
        {/* Parent selection dropdown */}
        {showParentSelect && (
          <div 
            className="absolute right-0 top-full mt-1 w-48 bg-plm-bg border border-plm-border rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-plm-fg-muted border-b border-plm-border">
              Set Parent
            </div>
            <button
              onClick={() => {
                onSetParent?.(moduleId, null)
                setShowParentSelect(false)
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-plm-highlight transition-colors flex items-center gap-2 ${
                !currentParentId ? 'text-plm-accent' : 'text-plm-fg'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${!currentParentId ? 'bg-plm-accent' : 'bg-transparent border border-plm-border'}`} />
              None (Top-level)
            </button>
            {/* Custom groups section */}
            {availableGroupParents.length > 0 && (
              <>
                <div className="px-3 py-1 text-[9px] uppercase tracking-wide text-plm-fg-dim bg-plm-bg-secondary">
                  Groups
                </div>
                {availableGroupParents.map(group => (
                  <button
                    key={group.id}
                    onClick={() => {
                      onSetParent?.(moduleId, group.id)
                      setShowParentSelect(false)
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-plm-highlight transition-colors flex items-center gap-2 ${
                      currentParentId === group.id ? 'text-plm-accent' : 'text-plm-fg'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${currentParentId === group.id ? 'bg-plm-accent' : 'bg-transparent border border-plm-border'}`} />
                    <span style={group.iconColor ? { color: group.iconColor } : undefined}>
                      {getIcon(group.icon, 12)}
                    </span>
                    {group.name}
                  </button>
                ))}
              </>
            )}
            
            {/* Modules section */}
            {availableModuleParents.length > 0 && (
              <>
                <div className="px-3 py-1 text-[9px] uppercase tracking-wide text-plm-fg-dim bg-plm-bg-secondary">
                  Modules
                </div>
                {availableModuleParents.map(parent => (
                  <button
                    key={parent.id}
                    onClick={() => {
                      onSetParent?.(moduleId, parent.id)
                      setShowParentSelect(false)
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-plm-highlight transition-colors flex items-center gap-2 ${
                      currentParentId === parent.id ? 'text-plm-accent' : 'text-plm-fg'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${currentParentId === parent.id ? 'bg-plm-accent' : 'bg-transparent border border-plm-border'}`} />
                    <span className="text-plm-fg-muted">
                      {getIcon(parent.icon, 12)}
                    </span>
                    {parent.name}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Status badges */}
      <div className="flex items-center gap-2">
        {isDisabledByGroup && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-plm-bg-lighter text-plm-fg-dim">
            GROUP OFF
          </span>
        )}
      </div>
      
      {/* Toggle - Enhanced visual state */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (canToggle && !isDisabledByGroup) {
            setModuleEnabled(moduleId, !moduleConfig.enabledModules[moduleId])
          }
        }}
        disabled={!canToggle || isDisabledByGroup}
        className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
          (!canToggle || isDisabledByGroup) ? 'opacity-40 cursor-not-allowed' : ''
        } ${
          moduleConfig.enabledModules[moduleId]
            ? 'bg-plm-success/20 border border-plm-success/40 hover:bg-plm-success/30'
            : 'bg-plm-bg-secondary border border-plm-border hover:bg-plm-highlight/50'
        }`}
        title={!canToggle ? 'This module cannot be disabled' : isDisabledByGroup ? 'Enable the group first' : undefined}
      >
        {/* Status indicator dot */}
        <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
          moduleConfig.enabledModules[moduleId]
            ? 'bg-plm-success shadow-[0_0_8px_2px_rgba(34,197,94,0.4)] animate-pulse'
            : 'bg-plm-fg-dim'
        }`} />
        
        {/* Status text */}
        <span className={`text-xs font-medium uppercase tracking-wide transition-colors ${
          moduleConfig.enabledModules[moduleId]
            ? 'text-plm-success'
            : 'text-plm-fg-muted'
        }`}>
          {moduleConfig.enabledModules[moduleId] ? 'On' : 'Off'}
        </span>
      </button>
      </div>
      
      {/* Drop indicator - after */}
      {showDropAfter && (
        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-plm-accent z-10">
          <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
          <div className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-plm-accent" />
        </div>
      )}
    </div>
  )
}

export function ModulesSettings() {
  const { 
    moduleConfig, 
    setCombinedOrder,
    addDivider,
    setModuleParent,
    setModuleIconColor,
    addCustomGroup,
    updateCustomGroup,
    removeCustomGroup,
    resetModulesToDefaults,
    loadOrgModuleDefaults,
    saveOrgModuleDefaults,
    getEffectiveRole
  } = usePDMStore()
  
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ index: number; position: 'before' | 'after' } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null)
  
  // Group editing state
  const [showGroupEditor, setShowGroupEditor] = useState(false)
  const [editingGroup, setEditingGroup] = useState<CustomGroup | null>(null)
  
  const isAdmin = getEffectiveRole() === 'admin'
  
  // Build combined list for display (including custom groups)
  const combinedList = useMemo(() => {
    return buildCombinedOrderList(moduleConfig.moduleOrder, moduleConfig.dividers, moduleConfig.customGroups)
  }, [moduleConfig.moduleOrder, moduleConfig.dividers, moduleConfig.customGroups])
  
  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    
    // Calculate if we're in the top or bottom half of the element
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const isTopHalf = y < rect.height / 2
    
    // Determine where the indicator should show
    const position = isTopHalf ? 'before' : 'after'
    
    // Don't show indicator on the dragged item itself or right next to it
    if (dragIndex === null) return
    if (index === dragIndex) {
      setDropIndicator(null)
      return
    }
    // Don't show "after" indicator if it would be right before dragged item
    if (position === 'after' && index === dragIndex - 1) {
      setDropIndicator(null)
      return
    }
    // Don't show "before" indicator if it would be right after dragged item
    if (position === 'before' && index === dragIndex + 1) {
      setDropIndicator(null)
      return
    }
    
    setDropIndicator({ index, position })
  }
  
  const handleDrop = () => {
    if (dragIndex !== null && dropIndicator !== null) {
      const draggedItem = combinedList[dragIndex]
      const newList = [...combinedList]
      
      // Check if dragging a group - if so, collect all children
      const itemsToMove: OrderListItem[] = [draggedItem]
      const indicesToRemove: number[] = [dragIndex]
      
      if (draggedItem.type === 'group' || draggedItem.type === 'module') {
        // Find all child modules that should move with this parent
        const parentId = draggedItem.id
        combinedList.forEach((item, idx) => {
          if (item.type === 'module' && moduleConfig.moduleParents?.[item.id as ModuleId] === parentId) {
            itemsToMove.push(item)
            indicesToRemove.push(idx)
          }
        })
      }
      
      // Remove items from highest index to lowest to preserve indices
      indicesToRemove.sort((a, b) => b - a)
      for (const idx of indicesToRemove) {
        newList.splice(idx, 1)
      }
      
      // Calculate the actual insert index
      let insertIndex = dropIndicator.index
      if (dropIndicator.position === 'after') {
        insertIndex++
      }
      
      // Adjust for removed items before the insert point
      const removedBefore = indicesToRemove.filter(idx => idx < insertIndex).length
      insertIndex -= removedBefore
      
      // Insert all items at the new position
      newList.splice(insertIndex, 0, ...itemsToMove)
      setCombinedOrder(newList)
    }
    setDragIndex(null)
    setDropIndicator(null)
  }
  
  const handleDragEnd = () => {
    setDragIndex(null)
    setDropIndicator(null)
  }
  
  const handleAddDivider = () => {
    // Add divider at the end
    addDivider(moduleConfig.moduleOrder.length - 1)
  }
  
  const handleAddGroup = (name: string, icon: string, iconColor: string | null) => {
    addCustomGroup(name, icon, iconColor)
    setShowGroupEditor(false)
    setEditingGroup(null)
  }
  
  const handleEditGroup = (group: CustomGroup) => {
    setEditingGroup(group)
    setShowGroupEditor(true)
  }
  
  const handleUpdateGroup = (name: string, icon: string, iconColor: string | null) => {
    if (editingGroup) {
      updateCustomGroup(editingGroup.id, { name, icon, iconColor })
    }
    setShowGroupEditor(false)
    setEditingGroup(null)
  }
  
  const handleRemoveGroup = (groupId: string) => {
    removeCustomGroup(groupId)
  }
  
  const handleSaveOrgDefaults = async () => {
    setIsSaving(true)
    setSaveResult(null)
    try {
      const result = await saveOrgModuleDefaults()
      setSaveResult(result.success ? 'success' : 'error')
      setTimeout(() => setSaveResult(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleLoadOrgDefaults = async () => {
    setIsLoading(true)
    try {
      await loadOrgModuleDefaults()
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-plm-fg">Modules</h1>
          <p className="text-sm text-plm-fg-muted mt-1">
            Enable, disable, and reorder sidebar modules
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleSaveOrgDefaults}
              disabled={isSaving}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                saveResult === 'success'
                  ? 'bg-plm-success/20 text-plm-success border border-plm-success/30'
                  : saveResult === 'error'
                  ? 'bg-plm-error/20 text-plm-error border border-plm-error/30'
                  : 'bg-plm-accent text-white hover:bg-plm-accent/80'
              }`}
              title="Save as organization defaults for new members"
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {saveResult === 'success' ? 'Saved!' : saveResult === 'error' ? 'Failed' : 'Save Defaults'}
            </button>
          )}
          <button
            onClick={handleLoadOrgDefaults}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-plm-border text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors disabled:opacity-50"
            title="Load organization defaults"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Load Defaults
          </button>
          <button
            onClick={resetModulesToDefaults}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-plm-border text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
            title="Reset to factory defaults"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>
      
      {/* Combined Order List */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
            Sidebar Order
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingGroup(null)
                setShowGroupEditor(true)
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-plm-accent/50 text-plm-accent hover:bg-plm-accent/10 transition-colors"
              title="Add a custom group to organize modules"
            >
              <Users size={12} />
              Add Group
            </button>
            <button
              onClick={handleAddDivider}
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-plm-border text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
              title="Add a section divider"
            >
              <Plus size={12} />
              Add Divider
            </button>
          </div>
        </div>
        
        {/* Group Editor */}
        {showGroupEditor && (
          <div className="mb-4">
            <GroupEditor
              group={editingGroup || undefined}
              onSave={editingGroup ? handleUpdateGroup : handleAddGroup}
              onCancel={() => {
                setShowGroupEditor(false)
                setEditingGroup(null)
              }}
            />
          </div>
        )}
        
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
          <p className="text-sm text-plm-fg-muted mb-4">
            Drag to reorder. Toggle to enable/disable. Disabling a module hides its dependents.
          </p>
          <div className="space-y-2" onDragEnd={handleDragEnd}>
            {combinedList.map((item, index) => (
              <OrderListItemComponent
                key={item.type === 'module' ? item.id : item.type === 'group' ? item.id : `divider-${item.id}`}
                item={item}
                index={index}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isDragging={dragIndex === index}
                dropIndicator={dropIndicator}
                onSetParent={setModuleParent}
                onSetIconColor={setModuleIconColor}
                onEditGroup={handleEditGroup}
                onRemoveGroup={handleRemoveGroup}
              />
            ))}
          </div>
        </div>
      </section>
      
      {/* Legend */}
      <section className="pt-2">
        <div className="flex flex-wrap gap-4 text-xs text-plm-fg-dim">
          <div className="flex items-center gap-1.5">
            <Lock size={10} />
            <span>Required module</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={10} className="text-plm-accent" />
            <span>Custom group</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Minus size={10} />
            <span>Section divider</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Palette size={10} />
            <span>Set icon color</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ChevronRight size={10} />
            <span>Has sub-items / Set parent</span>
          </div>
        </div>
      </section>
      
      {/* Info sections */}
      <section className="pt-2 pb-4 space-y-3">
        <div className="p-3 bg-plm-accent/5 border border-plm-accent/20 rounded-lg">
          <div className="text-sm text-plm-fg font-medium mb-1 flex items-center gap-2">
            <Users size={14} className="text-plm-accent" />
            Custom Groups
          </div>
          <p className="text-xs text-plm-fg-muted">
            Create groups to organize modules into categories. Groups appear in the sidebar with a custom icon and color.
            Assign modules to groups using the <ChevronRight size={10} className="inline" /> button → Groups section.
          </p>
        </div>
        
        <div className="p-3 bg-plm-highlight/50 border border-plm-border rounded-lg">
          <div className="text-sm text-plm-fg font-medium mb-1 flex items-center gap-2">
            <ChevronRight size={14} />
            Sub-menus
          </div>
          <p className="text-xs text-plm-fg-muted">
            Click the <ChevronRight size={10} className="inline" /> button on any module to set its parent (module or group). 
            Child items appear as a fly-out submenu when hovering the parent in the sidebar.
            You can nest up to 10 levels deep!
          </p>
        </div>
      </section>
    </div>
  )
}
