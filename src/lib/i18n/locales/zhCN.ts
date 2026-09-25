import type { TranslationDict } from '../types'
import { mdbLifecycleTranslations } from './mdbLifecycle'

// Simplified Chinese translations (简体中文)
export const zhCN: TranslationDict = {
  mdbSetup: {
    title: 'BluePLM MDB',
    chooseConnection: '连接现有安装或设置新安装。',
    existing: '连接现有 MDB 服务器',
    existingHelp: '只需输入公开 HTTPS 地址。',
    install: '设置新的 MDB 服务器',
    installHelp: '通过 FTPS 引导部署并配置网络存储。',
    backendUrl: '后端 URL',
    publicUrl: '公开 HTTPS URL',
    connect: '连接 MariaDB (MDB)',
    deployed: 'MDB 服务器已部署',
    deployedHelp: '服务器包和私有配置已上传。',
    openSetup: '打开服务器设置',
    completed: '设置完成 — 连接 BluePLM',
    newServer: '设置新的 BluePLM MDB 服务器',
    hosting: '主机准备',
    addressAndFtp: '公开地址和 FTP/FTPS',
    database: 'PHP 服务器的 MariaDB 连接',
    secrets: '首次安装密钥',
    networkVault: '归档/NAS 存储路径',
    browse: '浏览文件夹…',
    storeSecrets: '保存生成的密钥',
    generatedHelp: '仅显示一次，不会保存在客户端。',
    sessionComment: '会话密钥',
    bootstrapComment: '引导令牌',
    maintenanceComment: '维护令牌',
    vaultHelp: '选择归档或 NAS 根目录。',
    browseFolders: '浏览文件夹…',
    finishGuided: '完成引导设置',
    guidedStep1: '打开设置页面并输入令牌。',
    guidedStep2: '创建公司、所有者、NAS 存储和可选保护。',
    guidedStep3: '成功后返回此处。',
    openServerSetup: '打开设置',
    checkServer: '正在检查 MDB 服务器…',
    connectAfterSetup: '设置完成 — 连接 BluePLM',
    hostingPreparation: '1. 主机准备',
    hostingHelp: '创建 FTP 用户和 MariaDB 数据库。',
    documentRootConfirmed: '已确认根目录指向 public/。',
    addressFtp: '2. 公开地址和 FTP/FTPS',
    publicHttps: '公开 HTTPS URL',
    ftpServer: 'FTP/FTPS 服务器 URL',
    ftpTarget: 'FTP 目标文件夹',
    ftpTargetPlaceholder: '留空表示 FTP 用户根目录',
    ftpUser: 'FTP 用户',
    ftpPassword: 'FTP 密码',
    databaseConnection: '3. MariaDB 连接',
    databaseHost: '数据库主机',
    port: '端口',
    databaseName: '数据库名称',
    databaseUser: '数据库用户',
    databasePassword: '数据库密码',
    firstSecrets: '4. 初始密钥',
    generateSecrets: '生成安全密钥',
    secretsHelp: '值只写入私有 .env。',
    sessionSecret: '会话密钥',
    bootstrapToken: '引导令牌',
    maintenanceToken: '维护令牌',
    deploying: '正在部署 MDB 服务器…',
    deploy: '部署并启动引导设置',
    testingFtp: '正在测试 FTPS 连接…',
    testFtp: '测试 FTPS 连接',
    ftpTestPassed: 'FTPS 连接成功',
    ftpTestFailed: 'FTPS 连接测试失败',
    ftpTestUnavailable: '此版本不支持 FTPS 测试',
    ...mdbLifecycleTranslations['zh-CN'],
  },
  checkoutDisplay: {
    you: '你',
    loadingOwner: '正在加载签出者',
    ownerUnavailable: '签出者不可用',
    checkedOutBy: '由 {{name}} 签出',
    checkedOutByOnComputer: '由 {{name}} 在 {{computer}} 上签出',
    anotherComputer: '另一台电脑',
    differentComputer: '不同电脑',
    otherComputer: '其他电脑',
  },
  fileReadonly: {
    blocked: '此文件在磁盘上为只读，因此没有写入任何内容。',
    unknown: '无法确认此文件是否为只读，因此没有写入任何内容。',
    stillCheckedOut: '已签出，但在磁盘上仍为只读：{{names}}',
    madeWritable: '{{count}} 个文件此前已签出，现在可以写入。',
    solidWorksStillReadonly:
      '已签出且磁盘上可写，但 SolidWorks 仍以只读方式打开该文件。在 SolidWorks 中：编辑 → 只读模式，或关闭后重新打开该文件。',
  },
  common: {
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    remove: '移除',
    close: '关闭',
    search: '搜索',
    loading: '加载中...',
    error: '错误',
    success: '成功',
    warning: '警告',
    info: '信息',
    yes: '是',
    no: '否',
    ok: '确定',
    confirm: '确认',
    back: '返回',
    next: '下一步',
    refresh: '刷新',
    reset: '重置',
    apply: '应用',
    clear: '清除',
    select: '选择',
    selectAll: '全选',
    none: '无',
    all: '全部',
    name: '名称',
    description: '描述',
    type: '类型',
    size: '大小',
    date: '日期',
    status: '状态',
    actions: '操作',
    settings: '设置',
    preferences: '偏好设置',
    help: '帮助',
    about: '关于',
    version: '版本',
    file: '文件',
    folder: '文件夹',
    files: '文件',
    folders: '文件夹',
    open: '打开',
    connect: '连接',
    connecting: '连接中...',
    default: '默认',
    or: '或',
    optional: '可选',
  },

  welcome: {
    title: 'BluePLM',
    tagline: '开源产品生命周期管理',
    selectAccountType: '选择您的账户类型',
    teamMember: '团队成员',
    teamMemberDesc: '工程师、管理员和查看者',
    supplier: '供应商',
    supplierDesc: '供应商门户访问',
    workOffline: '离线工作',
    offlineMode: '离线模式',

    teamSignIn: '团队成员登录',
    signInWithOrg: '使用您的组织账户登录',
    signInWithGoogle: '使用Google登录',
    tryAgain: '重试',
    connecting: '连接中...',
    roleSetByOrg: '您的角色（管理员、工程师、查看者）由您的组织设定',

    supplierPortal: '供应商门户',
    createAccount: '创建您的供应商账户',
    signInToAccount: '登录您的账户',
    email: '电子邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    passwordMismatch: '密码不匹配',
    phone: '电话',
    phoneNumber: '电话号码',
    fullName: '姓名',
    createAccountBtn: '创建账户',
    signIn: '登录',
    alreadyHaveAccount: '已有账户？点击登录',
    noAccount: '没有账户？创建一个',
    useEmailPassword: '使用邮箱和密码',
    useGoogleInstead: '或使用Google登录',
    sendVerificationCode: '发送验证码',
    verificationCode: '验证码',
    verifyAndSignIn: '验证并登录',
    useDifferentNumber: '使用其他号码',
    verificationSent: '验证码已发送至',
    includeCountryCode: '请包含国家代码（例如：+86 中国，+1 美国）',
    supplierInviteNote: '供应商由组织邀请。如需访问权限，请联系您的采购方。',

    connectingToOrg: '正在连接到您的组织...',
    organizationVaults: '组织保险库',
    noVaultsCreated: '未创建保险库',
    noVaultsAdminMsg: '在设置 → 组织中创建保险库以开始使用。',
    noVaultsUserMsg: '请联系组织管理员创建保险库。',
    advancedOptions: '或使用下方高级选项手动连接。',
    localVault: '本地保险库',

    madeWith: '由 Blue Robotics 用 💙 制作',
  },

  setup: {
    backendChooser: '为此 BluePLM 客户端选择后端提供商。',
    mdbDescription: 'PHP API 和 MariaDB。BluePLM 保留所有与后端无关的功能。',
    welcome: '欢迎使用 BluePLM',
    connectToBackend: '连接到您组织的 Supabase 后端以开始使用',
    imAdmin: '我是组织管理员',
    imAdminDesc: '使用您组织的 Supabase 凭据设置 BluePLM。您将获得一个代码与团队共享。',
    haveCode: '我有组织代码',
    haveCodeDesc: '输入组织管理员提供的代码进行连接。',
    needHelp: '需要 Supabase 设置帮助？',

    adminSetup: '管理员设置',
    enterCredentials: '从项目的 API 设置中输入您的 Supabase 凭据',
    projectId: '项目 ID',
    projectIdHelp: '在 Supabase 控制台顶部找到（例如 vvyhpdzqdizvorrhjhvq）',
    anonKey: '匿名（公开）密钥',
    orgSlug: '组织标识',
    orgSlugHelp: '这有助于在生成的代码中识别您的组织',
    connectToSupabase: '连接到 Supabase',
    findInDashboard: '在 Supabase 控制台 → 项目设置 → API 中找到这些值',

    connectedSuccess: '连接成功！',
    shareCode: '将此代码分享给您的团队成员，以便他们进行连接',
    organizationCode: '组织代码',
    keepCodeSecure:
      '团队成员在首次打开 BluePLM 时可以粘贴此代码。请妥善保管此代码 - 它包含您的 Supabase 凭据。',
    continueToBluePLM: '继续使用 BluePLM',

    joinOrg: '加入您的组织',
    enterCode: '输入组织管理员提供的代码',

    enterBothFields: '请输入项目 ID 和匿名密钥',
    invalidProjectId: '请输入有效的项目 ID（仅限字母和数字）',
    failedToConnect: '连接 Supabase 失败',
    enterOrgCode: '请输入组织代码',
    invalidCode: '组织代码无效。请检查后重试。',
    failedWithCode: '使用提供的代码连接 Supabase 失败',
  },

  source: {
    configTree: {
      drawings: '工程图',
      ebom: 'eBOM',
      noDrawings: '没有工程图引用此配置',
      noComponents: '此配置中没有组件',
      expand: '展开',
      collapse: '折叠',
    },
    configEdit: {
      checkOutToEdit: '签出文件以编辑',
    },
    configCommit: {
      write: '写入文件',
      writeAndSync: '写入并更新工程图',
      writeAndSyncCount: '写入并更新 {{count}} 个配置的工程图',
      pending: '尚未写入文档',
      swOffline: '启动 SolidWorks 服务以写入配置元数据',
      summary:
        '已写入配置：{{configurations}}；工程图已更新：{{updated}}，已跳过：{{skipped}}，失败：{{failed}}',
    },
    configDrawings: {
      dialogTitle: '工程图引用此配置',
      dialogBody: '部分引用的工程图未由您签出。必须先签出，才能接收更新。',
      checkOutAndUpdate: '签出并更新',
      forceModelOnly: '仅写入模型',
      heldBy: '由 {{name}} 持有',
      blocked: '由其他用户持有',
      notInVault: '不在此保险库中',
      ready: '准备更新',
      available: '可签出',
      modelOnlyWarning: '仅写入模型会使未由您签出的工程图保持不变。',
    },
  },

  settings: {
    title: '设置',
    preferences: '偏好设置',
    account: '账户',
    vault: '保险库',
    organization: '组织',
    integrations: '集成',
    solidworks: 'SolidWorks',
    backup: '备份',
    api: 'API',
    logs: '日志',
    about: '关于',
  },

  preferences: {
    title: '偏好设置',
    applicationUpdates: '应用程序更新',
    checkForUpdates: '检查更新',
    checking: '检查中...',
    upToDate: '已是最新',
    available: '可用',
    youHaveLatest: '您已使用最新版本',
    updateAvailable: '有可用更新！请查看通知。',
    couldNotCheck: '无法检查更新',
    checkForNewVersions: '检查新版本',

    appearance: '外观',
    themeDark: '深色',
    themeDarkDesc: 'VS Code Dark+ 风格',
    themeDeepBlue: '深蓝',
    themeDeepBlueDesc: '海洋蓝主题',
    themeLight: '浅色',
    themeLightDesc: 'VS Code Light+ 风格',
    themeChristmas: '🎄 圣诞节',
    themeChristmasDesc: '雪花、雪橇和铃铛的节日氛围！',
    themeHalloween: '🎃 万圣节',
    themeHalloweenDesc: '篝火火花、鬼魂和南瓜的恐怖氛围！',
    themeKenneth: '👑 Kenneth',
    themeKennethDesc: '皇家紫色优雅',
    themeWeather: '🌤️ 本地天气',
    themeWeatherDesc: '根据您当地天气动态变化的主题！',
    themeSystem: '跟随系统',
    themeSystemDesc: '跟随操作系统偏好',
    autoSeasonalThemes: '自动应用季节性主题',
    autoSeasonalThemesDesc: '在10月1日自动切换到万圣节主题，12月1日自动切换到圣诞节主题',

    language: '语言',
    displayLanguage: '显示语言',
    chooseLanguage: '选择界面语言',
    translationsNote: '注意：部分翻译可能不完整。可能需要重启应用。',

    fileExtensions: '文件扩展名',
    lowercaseExtensions: '上传时使用小写扩展名',
    lowercaseExtensionsDesc: '签入文件时将 .SLDPRT 转换为 .sldprt',

    ignorePatterns: '忽略模式（仅保留在本地）',
    ignorePatternsDesc: '匹配这些模式的文件将保留在本地，不会同步到云端。',
    ignorePlaceholder: '例如：*.tmp, .git/*, thumbs.db',
    connectVaultForPatterns: '连接到保险库以管理忽略模式。',
    noIgnorePatterns: '未配置忽略模式',

    syncSettings: '同步设置',
    autoDownloadCloudFiles: '自动下载云端文件',
    autoDownloadCloudFilesDesc: '自动下载服务器上存在但本地不存在的文件',
    autoDownloadUpdates: '自动下载文件更新',
    autoDownloadUpdatesDesc: '当服务器有新版本时自动下载',
    excludedFiles: '已排除的文件',
    excludedFilesDesc: '{{count}} 个文件已从自动下载中排除（手动删除）',
    clearExcludedFiles: '清除列表',
    autoDiscardOrphanedFiles: '自动丢弃孤立文件',
    autoDiscardOrphanedFilesDesc: '自动删除服务器上已不存在的本地文件',
    discardOrphaned: '丢弃孤立文件',
    discardOrphanedCount: '丢弃孤立文件（{{count}} 个文件）',
    orphanedFilesDescription: '这些文件之前已同步，但已被其他用户从服务器删除',
  },

  sidebar: {
    // 源文件
    explorer: '资源管理器',
    pending: '待处理',
    history: '历史记录',
    workflows: '文件工作流',
    trash: '回收站',
    // 产品
    products: '产品浏览器',
    items: '物料浏览器',
    // 变更控制
    ecr: 'ECR / 问题',
    eco: 'ECO',
    notifications: '通知',
    deviations: '偏差',
    releaseSchedule: '发布计划',
    process: '流程编辑器',
    // 供应链 - 供应商
    supplierDatabase: '供应商数据库',
    supplierPortal: '供应商门户',
    // 客户
    customers: '客户',
    // 集成
    googleDrive: 'Google 云端硬盘',
    // 系统
    terminal: '终端',
    settings: '设置',
    // 分组标题
    sourceFiles: '源文件',
    itemsSection: '物料',
    changeControl: '变更控制',
    supplyChain: '供应链',
    suppliers: '供应商',
    purchasing: '采购',
    logistics: '物流',
    production: '生产',
    quality: '质量',
    integrations: '集成',
    // 侧边栏控制
    sidebarControl: '侧边栏控制',
    expanded: '展开',
    collapsed: '折叠',
    expandOnHover: '悬停时展开',
  },

  fileBrowser: {
    name: '名称',
    fileStatus: '文件状态',
    checkedOutBy: '签出者',
    version: '版本',
    itemNumber: '物料号',
    description: '描述',
    revision: '修订',
    state: '状态',
    ecoTags: 'ECO',
    extension: '类型',
    size: '大小',
    modified: '修改时间',
    noFilesFound: '未找到文件',
    dropFilesHere: '将文件拖放到此处上传',
  },

  autoDiscard: {
    removed: {
      // Chinese has no plural inflection - the `_one`/`_other` forms are identical text,
      // selected by the same caller logic as every other locale for consistency.
      generic_one: '已移除 {{count}} 个已从保险库删除的文件',
      generic_other: '已移除 {{count}} 个已从保险库删除的文件',
      fromFolder_one: '已从 {{folder}} 移除 {{count}} 个文件（已从保险库删除）',
      fromFolder_other: '已从 {{folder}} 移除 {{count}} 个文件（已从保险库删除）',
    },
    directoriesRemoved: {
      // Chinese has no plural inflection - see the note above.
      generic_one: '也移除了 {{count}} 个遗留的空文件夹',
      generic_other: '也移除了 {{count}} 个遗留的空文件夹',
    },
    directoriesTrackedByServer: {
      // Chinese has no plural inflection - see the note above.
      generic_one:
        '{{count}} folder is empty here but still listed on the server, so it was left in place',
      generic_other:
        '{{count}} folders are empty here but still listed on the server, so they were left in place',
    },
    failed: {
      generic_one: '无法自动丢弃 {{count}} 个孤立文件',
      generic_other: '无法自动丢弃 {{count}} 个孤立文件',
    },
  },

  fileOps: {
    serverPathUpdateFailed:
      '部分重命名未同步到服务器，服务器仍记录旧路径。受影响的文件显示为已移动；请运行 reconcile-moved-paths 进行更新。',
    cloudRenameFailed: '无法在服务器上重命名',
    movedAwayBlocked: '文件已移动 - 请先解决待处理的移动',
    checkIn: '签入',
    checkOut: '签出',
    download: '下载',
    getLatest: '获取最新版本',
    upload: '上传',
    delete: '删除',
    rename: '重命名',
    move: '移动',
    copy: '复制',
    paste: '粘贴',
    openFile: '打开文件',
    openFolder: '打开文件夹',
    openInExplorer: '在资源管理器中打开',
    viewHistory: '查看历史',
    compare: '比较',
    rollback: '回滚',
    discard: '放弃更改',
    forceRelease: '强制释放',
  },

  syncError: {
    toast: '同步失败：{{reason}}',
    toastWithMore: '同步失败：{{reason}}（另有 {{count}} 个错误）',
    failed: '同步失败',
    unknown: '未知错误',
    pathCaseConflict:
      '服务器上已有另一个文件占用该路径，仅大小写不同。请刷新文件列表以显示该文件。',
  },

  // Not yet translated — served from the English dictionary via getTranslation's per-key
  // fallback (see newKeys.test.ts). Keys exist here so structural checks pass; retranslate when
  // confident.
  sync: {
    likelyMoved: {
      title_one: 'This file may already be on the server elsewhere',
      title_other: '{{count}} files may already be on the server elsewhere',
      message_one:
        'This file has the same name and size as a file already on the server at a different path. Uploading it now creates a new copy there instead of moving the existing one. If you moved this file, use Move or Resolve Pending Moves instead so its history is kept.',
      message_other:
        '{{count}} of these files have the same name and size as files already on the server at different paths. Uploading them now creates new copies instead of moving the existing ones. If you moved these files, use Move or Resolve Pending Moves instead so their history is kept.',
      item: '{{path}} \u2192 matches existing server file at {{existingPath}}',
      confirmText: 'Upload Anyway',
      skippedToast_one:
        'Skipped 1 file that looked like a move - use Move or Resolve Pending Moves instead',
      skippedToast_other:
        'Skipped {{count}} files that looked like a move - use Move or Resolve Pending Moves instead',
    },
  },

  status: {
    ready: '就绪',
    syncing: '同步中...',
    uploading: '上传中...',
    downloading: '下载中...',
    processing: '处理中...',
    connected: '已连接',
    disconnected: '已断开',
    offline: '离线',
    online: '在线',
  },

  fileState: {
    released: '已发布',
    inWork: '进行中',
    pending: '待处理',
    obsolete: '已废弃',
    checkedOut: '已签出',
    checkedIn: '已签入',
  },

  diffStatus: {
    added: '已添加',
    modified: '已修改',
    deleted: '已删除',
    outdated: '已过期',
    cloud: '云端',
    cloudNew: '新增（云端）',
    moved: '已移动',
    movedAway: '已移出',
    ignored: '已忽略',
  },

  fileStatus: {
    deletedFromServer: '已从服务器删除',
    movedTooltip: '此文件现在位于这里，但库仍记录其旧路径',
    movedAwayTooltip: '库仍将此文件列在此处，但它已被移动',
    movedAwayTooltipTo: '已移动到 {{path}}',
  },

  explorer: {
    pendingMovesBadgeTitle_one: '{{count}} 个待处理的文件移动 — 点击查看',
    pendingMovesBadgeTitle_other: '{{count}} 个待处理的文件移动 — 点击查看',
    disconnectWarningMoved_one: '{{count}} 个文件已移动，库仍记录其旧路径',
    disconnectWarningMoved_other: '{{count}} 个文件已移动，库仍记录其旧路径',
    disconnectWarningMovedHint: '更新库以匹配，或将文件移回原处',
  },

  vaultSetup: {
    title: '设置您的保险库',
    subtitle: '配置文件如何同步到您的计算机',
    fileCount: '{{count}} 个文件',
    fileCountSingular: '1 个文件',
    totalSize: '共 {{size}}',
    autoDownloadCloudTitle: '自动下载云端文件',
    autoDownloadCloudDesc: '自动下载存在于服务器但不在您计算机上的文件',
    autoDownloadUpdatesTitle: '自动下载文件更新',
    autoDownloadUpdatesDesc: '当服务器上的文件更新时自动下载较新版本',
    summary: '连接后，BluePLM 将下载 {{count}} 个文件（{{size}}）',
    summaryNoDownload: '文件仅在您请求时才会下载',
    connect: '连接保险库',
    skip: '跳过设置',
  },

  solidworksVersion: {
    title: '选择您的 SOLIDWORKS 版本',
    subtitle: '此计算机上安装了多个版本',
    explanation:
      'BluePLM 一次只能连接一个 SOLIDWORKS 版本。请选择您实际使用的版本，否则即使 SOLIDWORKS 已打开，BluePLM 也可能提示无法连接。',
    windowsDefault: 'Windows 默认',
    confirm: '使用此版本',
    decideLater: '稍后决定',
    settingTitle: 'SOLIDWORKS 版本',
    settingLabel: '要连接的版本',
    settingDescription: 'BluePLM 与哪个 SOLIDWORKS 版本通信',
    settingHint: '更改此设置会重启 SOLIDWORKS 服务。请选择您用来打开文件的版本。',
    automatic: '自动',
    automaticDescription: '使用 Windows 注册为默认的版本',
  },

  reconcileMovedPaths: {
    offline: '离线状态下无法校正已移动的路径',
    notSignedIn: '请先登录',
    noOrganization: '未连接任何组织',
    noVault: '未连接任何库',
    nothingToReconcile: '没有文件等待更新其服务器路径',

    reportHeading: '有 {{count}} 个文件在本机被移动或重命名，而服务器仍记录着它们的旧路径。',
    reportEligible: '其中 {{count}} 个现在可以写入服务器路径。',
    reportBlocked: '有 {{count}} 个已被他人签出，将不会写入：',
    reportHolder: '{{count}} 个由 {{user}} 持有',
    unknownHolder: '其他用户',
    reportConflict: '跳过 {{count}} 个 — 另一条文件记录已占用新路径：',
    reportUnverified:
      '跳过 {{count}} 个 — 文件内容与服务器所记录的不再一致，因此无法验证此次移动：',
    reportItem: '{{from}} → {{to}}',
    reportAndMore: '… 还有 {{count}} 个',

    dryRunSummary: '仅预检：{{total}} 个服务器路径中有 {{eligible}} 个可写入。未写入任何内容。',
    dryRunNote: '仅生成报告。未加 --apply 不会写入任何内容。',

    refused:
      '未写入任何内容：其中 {{count}} 个文件已被他人签出（{{holders}}）。请他们签入后重新运行，或使用 --skip-checked-out 重新运行以校正其余文件并保留他们的文件不变。',
    nothingEligible: '无法写入任何内容：{{blocked}} 个已被他人签出，{{skipped}} 个被跳过。',
    confirmUnavailable: '未写入任何内容：此命令需要确认对话框，但当前无可用对话框。',

    confirmTitle: '更新 {{count}} 个服务器路径？',
    confirmMessage:
      '将把 {{count}} 个文件的服务器路径更新为它们目前在磁盘上的位置。这会为每个文件写入一条记录并记录一次移动，组织中其他所有计算机将在下次同步时获取新路径。',
    confirmRemainder: '另有 {{count}} 个保持不变（{{detail}}）。',
    confirmText: '更新 {{count}} 个路径',
    declined: '已取消。未写入任何内容。',

    progress: '正在更新 {{count}} 个服务器路径…',
    failureItem: '{{path}}：{{error}}',
    unknownError: '未知错误',

    summaryComplete: '已校正 {{count}} 个服务器路径。',
    summaryPartial:
      '已校正 {{total}} 个服务器路径中的 {{succeeded}} 个 — {{leftovers}}。请再次运行以完成。',
    summaryFailed: '{{count}} 个失败',
    summaryNotAttempted: '{{count}} 个未尝试',
    summaryBlocked: '{{count}} 个被他人签出',
    summarySkipped: '{{count}} 个已跳过',
  },

  adoptServerPaths: {
    notSignedIn: '请先登录',
    noVault: '未连接任何库',
    nothingToAdopt: '没有文件等待重命名回服务器记录的路径',

    reportHeading: '有 {{count}} 个文件所在的本地路径已与服务器为其记录的路径不一致。',
    reportEligible: '其中 {{count}} 个现在可以重命名回服务器路径。',
    reportBlocked: '有 {{count}} 个已被他人签出，除非强制执行，否则将保持不变：',
    reportHolder: '{{count}} 个由 {{user}} 持有',
    unknownHolder: '其他用户',
    reportConflict: '跳过 {{count}} 个 — 磁盘上的目标位置已被另一个文件占用：',
    reportUnverified:
      '跳过 {{count}} 个 — 文件内容与服务器所记录的不再一致，因此无法验证此次移动：',
    reportItem: '{{from}} → {{to}}',
    reportAndMore: '… 还有 {{count}} 个',

    dryRunSummary:
      '仅预检：{{total}} 个文件中有 {{eligible}} 个可以重命名回服务器路径。未写入任何内容。',
    dryRunNote: '仅生成报告。未加 --apply 不会写入任何内容。',

    refused:
      '未重命名任何文件：其中 {{count}} 个文件已被他人签出（{{holders}}）。此重命名只影响您自己的磁盘，无论如何都是安全的 — 请先询问他们，或使用 --force 重新运行以同时重命名这些文件。',
    nothingEligible: '无法重命名任何文件：{{skipped}} 个被跳过。',
    confirmUnavailable: '未重命名任何文件：此命令需要确认对话框，但当前无可用对话框。',

    confirmTitle: '将 {{count}} 个文件重命名回服务器路径？',
    confirmMessage:
      '此计算机上的 {{count}} 个文件将被重命名为服务器已为其记录的路径。这只会更改您的本地磁盘 — 不会向服务器写入任何内容。',
    confirmRemainder: '另有 {{count}} 个保持不变（{{detail}}）。',
    confirmText: '重命名 {{count}} 个文件',
    declined: '已取消。未重命名任何文件。',

    progress: '正在将 {{count}} 个文件重命名回服务器路径…',
    failureItem: '{{path}}：{{error}}',
    unknownError: '未知错误',
    destinationAppeared: '预检之后，另一个文件出现在了 "{{path}}"',
    createFolderFailed: '无法创建目标文件夹 — {{error}}',

    summaryComplete: '已将 {{count}} 个文件重命名回服务器路径。',
    summaryPartial:
      '已重命名 {{total}} 个文件中的 {{succeeded}} 个 — {{leftovers}}。请再次运行以完成。',
    summaryFailed: '{{count}} 个失败',
    summaryNotAttempted: '{{count}} 个未尝试',
    summaryBlocked: '{{count}} 个被他人签出',
    summarySkipped: '{{count}} 个已跳过',
  },

  terminal: {
    confirmationPending:
      'Waiting for confirmation — press Enter to confirm, Esc or Ctrl+C to cancel.',
    confirmationCancelled: 'Confirmation cancelled.',
  },

  resolveMoves: {
    title: '解决待处理的移动',
    subtitle: '有些文件所在的路径与库记录的不同。请选择应以哪一侧为准。',
    noPendingMoves: '没有需要解决的内容 — 未找到待处理的移动。',

    scopeLabel: '显示',
    scopeFile: '此文件',
    scopeFolder: '此文件夹',
    scopeVault: '整个库',
    vaultWideNote: '解决操作始终会处理库中所有待处理的移动，而不仅仅是上面显示的这些。',

    listHeading_one: '已显示 {{count}} 个待处理的移动',
    listHeading_other: '已显示 {{count}} 个待处理的移动',
    noMovesInScope: '此范围内没有待处理的移动。',
    moreFiles: '… 还有 {{count}} 个',

    reconcileOptionTitle: '保留新位置，并更新库以匹配',
    reconcileOptionDescription: '将您磁盘上的路径写入服务器。其他人会在下次同步时获得新位置。',
    adoptOptionTitle: '将文件放回库所记录的位置',
    adoptOptionDescription: '将磁盘上的文件重命名回服务器已记录的路径。不会向服务器写入任何内容。',

    eligibleCount_one: '{{count}} 个文件已就绪',
    eligibleCount_other: '{{count}} 个文件已就绪',
    blockedCount_one: '{{count}} 个文件被他人签出',
    blockedCount_other: '{{count}} 个文件被他人签出',
    conflictCount_one: '跳过 {{count}} 个 — 目标位置已被占用',
    conflictCount_other: '跳过 {{count}} 个 — 目标位置已被占用',
    unverifiedCount_one: '跳过 {{count}} 个 — 内容已不再匹配',
    unverifiedCount_other: '跳过 {{count}} 个 — 内容已不再匹配',
    noEligible: '目前这里还没有可以解决的内容。',
    unknownHolder: '其他用户',

    skipCheckedOutLabel_one: '跳过被他人签出的文件，并更新其余文件',
    skipCheckedOutLabel_other: '跳过被他人签出的 {{count}} 个文件，并更新其余文件',
    forceLabel_one: '同时重命名被他人签出的文件',
    forceLabel_other: '同时重命名被他人签出的 {{count}} 个文件',

    runReconcile: '更新库',
    runAdopt: '还原本地文件',

    contextMenuItem: '解决已移动的文件…',
  },

  // Not yet translated — served from the English dictionary via getTranslation's per-key
  // fallback (see newKeys.test.ts). Keys exist here so structural checks pass; retranslate when
  // confident.
  realign: {
    section: {
      heading: 'Re-align with Server',
      title: 'Check your vault against the server',
      description:
        "See what's different between your computer and the server, and fix what's safe to fix automatically.",
      button: 'Check Alignment',
    },

    dialog: {
      title: 'Re-align with Server',
      subtitle:
        "Compares your files against the server and shows what's different before anything changes.",
      waitingForConfirmation: 'Waiting for you to confirm the next change.',
    },

    runButton: 'Fix Selected Items',
    moreFiles: '…and {{count}} more',

    headline: {
      aligned: 'Your vault is aligned with the server.',
      notAligned: 'Your vault has files that disagree with the server.',
    },

    orientation: {
      local_one: '{{count}} file on your computer',
      local_other: '{{count}} files on your computer',
      server_one: '{{count}} file on the server',
      server_other: '{{count}} files on the server',
      inSync_one: '{{count}} file in sync',
      inSync_other: '{{count}} files in sync',
    },

    group: {
      repairable: 'Can be fixed now',
      needsDecision: 'Needs your decision',
      needsDecisionNote: 'Re-align will not touch any of these — they need your decision.',
      needsDecisionEmpty: 'Nothing here needs a decision.',
      informational: 'For information',
    },

    syncIndex: {
      label: "Also refresh BluePLM's internal record of what's synced",
      description: "Housekeeping only — this doesn't touch any files.",
    },

    pendingMove: {
      label_one: '{{count}} file moved on disk but not in the vault',
      label_other: '{{count}} files moved on disk but not in the vault',
      description:
        'Choose per file whether to restore the vault path or keep the path on this computer.',
      keepServer: 'Keep server path',
      keepLocal: 'Keep local path',
      keepServerAll: 'Keep server path for all',
      keepLocalAll: 'Keep local path for all',
      keepLocalNote:
        'Keep local path writes this computer’s location to the vault, so everyone else will see the rename.',
      adoptSummary_one: '{{count}} file will be restored to the server path',
      adoptSummary_other: '{{count}} files will be restored to the server path',
      reconcileSummary_one: '{{count}} file will update the vault',
      reconcileSummary_other: '{{count}} files will update the vault',
    },
    orphaned: {
      label_one: '{{count}} file the server no longer has',
      label_other: '{{count}} files the server no longer has',
      description:
        'Moves the file to the Recycle Bin. The server copy is already gone, so there is nothing left to keep it in sync with.',
    },
    outdated: {
      label_one: '{{count}} file with a newer version on the server',
      label_other: '{{count}} files with a newer version on the server',
      description: "Downloads the server's current version to replace the outdated local copy.",
    },

    localOnly: {
      label_one: '{{count}} file that only exists on your computer',
      label_other: '{{count}} files that only exist on your computer',
      description: 'Never checked in to the vault. Re-align leaves these exactly as they are.',
      actionButton: 'Go check them in…',
      actionToast: 'Select these files in the file browser and check them in when ready.',
    },
    modified: {
      label_one: '{{count}} file with local changes not yet on the server',
      label_other: '{{count}} files with local changes not yet on the server',
      description:
        'Your edits are kept. Re-align never discards local changes — check them in to share the update.',
      actionButton: 'Go check in your changes…',
      actionToast: 'Select these files in the file browser and check in your changes when ready.',
    },
    ghost: {
      label_one: '{{count}} file checked out by you but missing from disk',
      label_other: '{{count}} files checked out by you but missing from disk',
      description:
        'Something removed the file after you checked it out. Decide whether to check in a replacement or release the checkout.',
    },

    cloudOnly: {
      label_one: '{{count}} file on the server only',
      label_other: '{{count}} files on the server only',
      whyNote:
        'Not downloaded — re-align is not a bulk download. Turn on auto-download, or download files individually, if you want a local copy.',
    },
    ignored: {
      label_one: '{{count}} file matching an ignore pattern',
      label_other: '{{count}} files matching an ignore pattern',
      whyNote: 'Never touched by re-align, or by anything else that syncs the vault.',
    },
    blockedCheckout: {
      label_one: '{{count}} file blocked by a checkout',
      label_other: '{{count}} files blocked by a checkout',
      whyNote: 'Re-align leaves any file under an active checkout alone.',
      selfHeld_one: 'You have this checked out yourself.',
      selfHeld_other: 'You have {{count}} of these checked out yourself.',
      otherHeld_one: 'Someone else has this checked out.',
      otherHeld_other: 'Someone else has {{count}} of these checked out.',
    },

    outcome: {
      heading: 'Result',
      abortedHeading: 'Re-align did not run.',
      abortNoVault: 'No vault is connected.',
      abortOffline: "You're offline — try again once you're back online.",
      abortOperationInFlight:
        'Another sync operation is already running — try again once it finishes.',
      abortCancelled: 'Cancelled.',
      abortUnexpectedError:
        'Something went wrong. Try again, and contact support if it keeps happening.',

      step_resolvePendingMoves: 'Pending moves',
      step_recycleOrphans: 'Orphaned files',
      step_pullOutdated: 'Outdated files',
      step_rebuildSyncIndex: 'Sync index',

      ok_one: 'Fixed {{count}} file',
      ok_other: 'Fixed {{count}} files',
      partial: 'Fixed {{succeeded}} of {{attempted}} — {{failed}} failed',
      failedResult: 'Could not complete this step',
      nothingToDo: 'Nothing to do',
      refused: 'Skipped for safety — try again in a moment',
    },
  },

  hiddenFolders: {
    hideFromNonAdmins: '对非管理员隐藏',
    showToEveryone: '对所有人显示',
    notAccessControl: '在界面中对非管理员隐藏此文件夹。这不是访问限制，文件仍然可读。',
    badgeLabel: '已对非管理员隐藏',
    hidden: '文件夹已对非管理员隐藏',
    unhidden: '文件夹已对所有人可见',
    updateFailed: '更新文件夹可见性失败',
    updateNotPermitted: '您可能没有权限更改文件夹可见性',
    scanSkipped: '已跳过对非管理员隐藏的文件夹中的 {{count}} 个文件',
  },
}
