import type { TranslationDict } from '../types'
import { reviewsUiStrings } from './reviewsUi'
import { reviewPackageStrings } from './reviewPackage'

// Portuguese translations (Português)
export const pt: TranslationDict = {
  solidworksSettings: {
    previewMode: 'Modo de pré-visualização',
    embeddedThumbnail: 'Miniatura incorporada',
    embeddedThumbnailDescription:
      'Extrair e mostrar a imagem de pré-visualização do ficheiro SolidWorks',
    externalEDrawings: 'eDrawings (externo)',
    externalEDrawingsDescription: 'Abrir ficheiros na aplicação eDrawings externa',
    embeddedEDrawings: 'Pré-visualização 3D do eDrawings (Windows, opcional)',
    embeddedEDrawingsAvailable:
      'Visualizador 3D interativo dentro do BluePLM. Funcionalidade experimental do Windows.',
    embeddedEDrawingsUnavailable:
      'Requer Windows, eDrawings com o controlo ActiveX, Microsoft .NET 8 Desktop Runtime (x64) e o módulo de pré-visualização opcional.',
    previewStarting: 'A iniciar a pré-visualização incorporada do eDrawings…',
    previewStartFailed: 'Não foi possível iniciar a pré-visualização incorporada do eDrawings.',
    previewUnavailable:
      'A pré-visualização opcional do eDrawings para Windows não está disponível neste computador.',
    previewServiceUnavailable: 'O serviço de pré-visualização do eDrawings não está disponível.',
    previewSessionUnavailable: 'A sessão de pré-visualização do eDrawings já não está ativa.',
    previewHostUnavailable:
      'O anfitrião da pré-visualização incorporada do eDrawings não está disponível. É necessário o Microsoft .NET 8 Desktop Runtime (x64).',
    previewHostTimeout: 'A pré-visualização incorporada do eDrawings demorou demasiado a iniciar.',
    previewDocumentLoadFailed: 'Não foi possível carregar o documento selecionado no eDrawings.',
    previewFileUnavailable: 'Este ficheiro não está disponível para a pré-visualização incorporada do eDrawings.',
    previewNotLocal: 'Transfira este ficheiro antes de abrir a pré-visualização incorporada do eDrawings.',
    previewVaultOnNetwork:
      'Este cofre está numa partilha de rede. A pré-visualização incorporada só abre ficheiros deste computador, por isso utilize Abrir no eDrawings.',
    previewBoundsUnavailable: 'Não foi possível posicionar a pré-visualização incorporada do eDrawings.',
    openInEDrawings: 'Abrir no eDrawings',
    openInEDrawingsFailed: 'Não foi possível abrir o ficheiro no eDrawings.',
  },
  ...reviewsUiStrings.pt,
  reviewPackage: reviewPackageStrings.pt,
  checkoutDisplay: {
    you: 'Você',
    loadingOwner: 'A carregar o proprietário do checkout',
    ownerUnavailable: 'Proprietário do checkout indisponível',
    checkedOutBy: 'Em checkout por {{name}}',
    checkedOutByOnComputer: 'Em checkout por {{name}} em {{computer}}',
    anotherComputer: 'outro computador',
    differentComputer: 'computador diferente',
    otherComputer: 'outro PC',
  },
  fileReadonly: {
    blocked: 'Este ficheiro é só de leitura no disco, por isso nada foi escrito.',
    unknown: 'Não foi possível saber se este ficheiro é só de leitura, por isso nada foi escrito.',
    stillCheckedOut: 'Em checkout, mas continua só de leitura no disco: {{names}}',
    madeWritable: '{{count}} ficheiro(s) já estavam em checkout e agora podem ser gravados.',
    solidWorksStillReadonly:
      'Em checkout e gravável no disco, mas o SolidWorks ainda tem o ficheiro aberto como só de leitura. No SolidWorks: Editar → Só de leitura, ou feche e volte a abrir o ficheiro.',
    syncBlocked:
      'Só de leitura no disco, por isso não foram escritos metadados em: {{names}}. Faça checkout do ficheiro novamente para o tornar gravável.',
  },
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Adicionar',
    remove: 'Remover',
    close: 'Fechar',
    search: 'Pesquisar',
    loading: 'A carregar...',
    error: 'Erro',
    success: 'Sucesso',
    warning: 'Aviso',
    info: 'Informação',
    yes: 'Sim',
    no: 'Não',
    ok: 'OK',
    confirm: 'Confirmar',
    back: 'Voltar',
    next: 'Seguinte',
    refresh: 'Atualizar',
    reset: 'Repor',
    apply: 'Aplicar',
    clear: 'Limpar',
    select: 'Selecionar',
    selectAll: 'Selecionar tudo',
    none: 'Nenhum',
    all: 'Todos',
    name: 'Nome',
    description: 'Descrição',
    type: 'Tipo',
    size: 'Tamanho',
    date: 'Data',
    status: 'Estado',
    actions: 'Ações',
    settings: 'Definições',
    preferences: 'Preferências',
    help: 'Ajuda',
    about: 'Sobre',
    version: 'Versão',
    file: 'Ficheiro',
    folder: 'Pasta',
    files: 'Ficheiros',
    folders: 'Pastas',
    open: 'Abrir',
    connect: 'Ligar',
    connecting: 'A ligar...',
    default: 'Predefinido',
    or: 'ou',
    optional: 'opcional',
  },

  welcome: {
    title: 'BluePLM',
    tagline: 'Gestão de ciclo de vida de produto open source',
    selectAccountType: 'Selecione o tipo de conta',
    teamMember: 'Membro da Equipa',
    teamMemberDesc: 'Engenheiros, administradores e visualizadores',
    supplier: 'Fornecedor',
    supplierDesc: 'Acesso ao portal de fornecedores',
    workOffline: 'Trabalhar Offline',
    offlineMode: 'Modo Offline',

    teamSignIn: 'Início de Sessão de Membro da Equipa',
    signInWithOrg: 'Inicie sessão com a sua conta da organização',
    signInWithGoogle: 'Iniciar sessão com Google',
    tryAgain: 'Tentar novamente',
    connecting: 'A ligar...',
    roleSetByOrg: 'O seu papel (Admin, Engenheiro, Visualizador) é definido pela sua organização',

    supplierPortal: 'Portal do Fornecedor',
    createAccount: 'Crie a sua conta de fornecedor',
    signInToAccount: 'Inicie sessão na sua conta',
    email: 'Email',
    password: 'Palavra-passe',
    confirmPassword: 'Confirmar palavra-passe',
    passwordMismatch: 'As palavras-passe não coincidem',
    phone: 'Telefone',
    phoneNumber: 'Número de telefone',
    fullName: 'Nome completo',
    createAccountBtn: 'Criar Conta',
    signIn: 'Iniciar Sessão',
    alreadyHaveAccount: 'Já tem uma conta? Inicie sessão',
    noAccount: 'Não tem conta? Crie uma',
    useEmailPassword: 'Usar email e palavra-passe',
    useGoogleInstead: 'Ou iniciar sessão com Google',
    sendVerificationCode: 'Enviar Código de Verificação',
    verificationCode: 'Código de Verificação',
    verifyAndSignIn: 'Verificar e Iniciar Sessão',
    useDifferentNumber: 'Usar outro número',
    verificationSent: 'Foi enviado um código de verificação para',
    includeCountryCode: 'Inclua o código do país (ex: +351 para Portugal, +55 para Brasil)',
    supplierInviteNote:
      'Os fornecedores são convidados pelas organizações. Contacte o seu comprador se precisar de acesso.',

    connectingToOrg: 'A ligar à sua organização...',
    organizationVaults: 'Cofres da Organização',
    noVaultsCreated: 'Nenhum Cofre Criado',
    noVaultsAdminMsg: 'Crie um cofre em Definições → Organização para começar.',
    noVaultsUserMsg: 'Peça a um administrador da organização para criar um cofre.',
    advancedOptions: 'Ou use as opções avançadas abaixo para ligar manualmente.',
    localVault: 'Cofre Local',

    madeWith: 'Feito com 💙 pela Blue Robotics',
  },

  setup: {
    welcome: 'Bem-vindo ao BluePLM',
    connectToBackend: 'Ligue-se ao backend Supabase da sua organização para começar',
    imAdmin: 'Sou Administrador da Organização',
    imAdminDesc:
      'Configure o BluePLM com as credenciais Supabase da sua organização. Receberá um código para partilhar com a sua equipa.',
    haveCode: 'Tenho um Código de Organização',
    haveCodeDesc: 'Introduza o código fornecido pelo administrador da sua organização para ligar.',
    needHelp: 'Precisa de ajuda a configurar o Supabase?',

    adminSetup: 'Configuração de Administrador',
    enterCredentials: 'Introduza as suas credenciais Supabase das definições de API do seu projeto',
    projectId: 'ID do Projeto',
    projectIdHelp: 'Encontra-se no topo do seu Painel Supabase (ex. vvyhpdzqdizvorrhjhvq)',
    anonKey: 'Chave Anónima (Pública)',
    orgSlug: 'Slug da Organização',
    orgSlugHelp: 'Isto ajuda a identificar a sua organização no código gerado',
    connectToSupabase: 'Ligar ao Supabase',
    findInDashboard: 'Encontre estes valores no seu Painel Supabase → Definições do Projeto → API',

    connectedSuccess: 'Ligado com Sucesso!',
    shareCode: 'Partilhe este código com os membros da sua equipa para que possam ligar',
    organizationCode: 'Código da Organização',
    keepCodeSecure:
      'Os membros da equipa podem colar este código quando abrirem o BluePLM pela primeira vez. Mantenha este código seguro - contém as suas credenciais Supabase.',
    continueToBluePLM: 'Continuar para o BluePLM',

    joinOrg: 'Juntar-se à Sua Organização',
    enterCode: 'Introduza o código fornecido pelo administrador da sua organização',

    enterBothFields: 'Por favor introduza o ID do Projeto e a Chave Anónima',
    invalidProjectId: 'Por favor introduza um ID de Projeto válido (apenas letras e números)',
    failedToConnect: 'Falha ao ligar ao Supabase',
    enterOrgCode: 'Por favor introduza o Código da Organização',
    invalidCode: 'Código de Organização inválido. Por favor verifique e tente novamente.',
    failedWithCode: 'Falha ao ligar ao Supabase com o código fornecido',
  },

  source: {
    configTree: {
      drawings: 'Desenhos',
      ebom: 'eBOM',
      noDrawings: 'Nenhum desenho referencia esta configuração',
      noComponents: 'Não há componentes nesta configuração',
      expand: 'Expandir',
      collapse: 'Recolher',
    },
    configEdit: {
      checkOutToEdit: 'Faça check-out do ficheiro para editar',
    },
    configCommit: {
      write: 'Escrever no ficheiro',
      writeAndSync: 'Escrever e atualizar desenhos',
      writeAndSyncCount: 'Escrever e atualizar desenhos para {{count}} configurações',
      pending: 'Ainda não escrito no documento',
      swOffline: 'Inicie o serviço do SolidWorks para escrever os metadados da configuração',
      summary:
        'Configurações escritas: {{configurations}}; desenhos atualizados: {{updated}}, ignorados: {{skipped}}, falhados: {{failed}}',
    },
    configDrawings: {
      dialogTitle: 'Desenhos referenciam esta configuração',
      dialogBody:
        'Alguns desenhos referenciados não estão em checkout por si. Têm de ser colocados em checkout para receber a atualização.',
      checkOutAndUpdate: 'Fazer checkout e atualizar',
      forceModelOnly: 'Escrever apenas o modelo',
      heldBy: 'Em checkout por {{name}}',
      blocked: 'Em checkout por outra pessoa',
      notInVault: 'Não está neste cofre',
      ready: 'Pronto para atualizar',
      available: 'Disponível para checkout',
      modelOnlyWarning:
        'Escrever apenas o modelo deixa inalterados os desenhos que não estão em checkout por si.',
    },
  },

  settings: {
    title: 'Definições',
    preferences: 'Preferências',
    account: 'Conta',
    vault: 'Cofre',
    organization: 'Organização',
    integrations: 'Integrações',
    solidworks: 'SolidWorks',
    backup: 'Cópia de Segurança',
    api: 'API',
    logs: 'Registos',
    about: 'Sobre',
    navigation: 'Navegação das definições',
    profile: 'Perfil',
    keybindings: 'Atalhos de teclado',
    sidebar: 'Barra lateral',
    deleteAccount: 'Eliminar conta',
    supabase: 'Supabase',
    backups: 'Cópias de segurança',
    vaults: 'Cofres',
    membersAndTeams: 'Membros e equipas',
    moduleAccess: 'Acesso aos módulos',
    companyProfile: 'Perfil da empresa',
    signInMethods: 'Métodos de início de sessão',
    serialization: 'Serialização',
    exportOptions: 'Opções de exportação',
    fileMetadata: 'Metadados dos ficheiros',
    itemDesignations: 'Designações de artigos',
    rfqSettings: 'Definições de RFQ',
    recoveryCodes: 'Códigos de recuperação',
    extensions: 'Extensões',
    extensionStore: 'Loja de extensões',
    googleDrive: 'Google Drive',
    odooErp: 'Odoo ERP',
    restApi: 'API REST',
    webhooks: 'Webhooks',
    system: 'Sistema',
    performance: 'Desempenho',
    devTools: 'Ferramentas de desenvolvimento',
    connected: 'Ligado',
    partiallyConnected: 'Parcialmente ligado',
    offline: 'Offline',
    notConfigured: 'Não configurado',
    comingSoon: 'Brevemente',
    checkingStatus: 'A verificar o estado...',
    backupsWorking: 'As cópias de segurança estão a funcionar',
    needsAttention: 'Requer atenção',
    backupFailed: 'Falha na cópia de segurança',
  },

  accountSettings: {
    notSignedIn: 'Sessão não iniciada',
    profile: 'Perfil',
    noName: 'Sem nome',
    role: 'Função',
    sessions: 'Sessões',
    sessionsDescription: 'Dispositivos em que tem sessão iniciada',
    loadingSessions: 'A carregar sessões...',
    noActiveSessions: 'Nenhuma sessão ativa',
    thisDevice: 'Este dispositivo',
    unknown: 'Desconhecido',
    unknownLastSeen: 'Desconhecido',
    justNow: 'Agora mesmo',
    minutesAgo: 'há {{count}} min',
    signOut: 'Terminar sessão',
    signOutDevice: 'Terminar sessão neste dispositivo',
  },

  preferences: {
    title: 'Preferências',
    applicationUpdates: 'Atualizações da Aplicação',
    checkForUpdates: 'Verificar Atualizações',
    checking: 'A verificar...',
    upToDate: 'Atualizado',
    available: 'Disponível',
    youHaveLatest: 'Tem a versão mais recente',
    updateAvailable: 'Atualização disponível! Verifique a notificação.',
    couldNotCheck: 'Não foi possível verificar atualizações',
    checkForNewVersions: 'Verificar novas versões',

    appearance: 'Aparência',
    themeDark: 'Escuro',
    themeDarkDesc: 'Estilo VS Code Dark+',
    themeDeepBlue: 'Azul Profundo',
    themeDeepBlueDesc: 'Tema azul oceano',
    themeLight: 'Claro',
    themeLightDesc: 'Estilo VS Code Light+',
    themeChristmas: '🎄 Natal',
    themeChristmasDesc: 'Festivo com neve, trenós e sinos!',
    themeHalloween: '🎃 Halloween',
    themeHalloweenDesc: 'Assustador com fagulhas de fogueira, fantasmas e abóboras!',
    themeKenneth: '👑 Kenneth',
    themeKennethDesc: 'Elegância púrpura real',
    themeWeather: '🌤️ Clima Local',
    themeWeatherDesc: 'Tema dinâmico que se adapta ao seu clima local!',
    themeSystem: 'Sistema',
    themeSystemDesc: 'Seguir preferência do sistema',
    autoSeasonalThemes: 'Aplicar temas sazonais automaticamente',
    autoSeasonalThemesDesc: 'Mudar automaticamente para Halloween (1º out.) e Natal (1º dez.)',

    language: 'Idioma',
    displayLanguage: 'Idioma de Exibição',
    chooseLanguage: 'Escolha o idioma da interface',
    translationsNote:
      'Nota: Algumas traduções podem estar incompletas. Poderá ser necessário reiniciar.',

    fileExtensions: 'Extensões de Ficheiro',
    lowercaseExtensions: 'Extensões em minúsculas ao carregar',
    lowercaseExtensionsDesc: 'Converter .SLDPRT para .sldprt ao fazer check-in',

    ignorePatterns: 'Padrões a Ignorar (Manter Apenas Local)',
    ignorePatternsDesc:
      'Ficheiros que correspondam a estes padrões permanecerão locais e não serão sincronizados.',
    ignorePlaceholder: 'ex: *.tmp, .git/*, thumbs.db',
    connectVaultForPatterns: 'Ligue-se a um cofre para gerir padrões a ignorar.',
    noIgnorePatterns: 'Nenhum padrão de exclusão configurado',

    syncSettings: 'Configurações de Sincronização',
    autoDownloadCloudFiles: 'Descarregar ficheiros da nuvem automaticamente',
    autoDownloadCloudFilesDesc:
      'Descarregar automaticamente ficheiros que existem no servidor mas não localmente',
    autoDownloadUpdates: 'Descarregar atualizações automaticamente',
    autoDownloadUpdatesDesc:
      'Descarregar automaticamente quando o servidor tem versões mais recentes',
    excludedFiles: 'Ficheiros excluídos',
    excludedFilesDesc:
      '{{count}} ficheiro(s) excluído(s) do download automático (removidos manualmente)',
    clearExcludedFiles: 'Limpar lista',
    autoDiscardOrphanedFiles: 'Descartar ficheiros órfãos automaticamente',
    autoDiscardOrphanedFilesDesc:
      'Remover automaticamente ficheiros locais que já não existem no servidor',
    discardOrphaned: 'Descartar órfãos',
    discardOrphanedCount: 'Descartar órfãos ({{count}} ficheiro{{plural}})',
    orphanedFilesDescription:
      'Estes ficheiros foram sincronizados anteriormente mas foram eliminados do servidor por outro utilizador',
  },

  sidebar: {
    // Source Files
    explorer: 'Explorador',
    pending: 'Pendentes',
    history: 'Histórico',
    workflows: 'Fluxos de Trabalho de Ficheiros',
    trash: 'Lixo',
    // Products
    products: 'Explorador de Produtos',
    items: 'Navegador de Artigos',
    // Change Control
    ecr: 'ECRs / Problemas',
    eco: 'ECOs',
    notifications: 'Notificações',
    deviations: 'Desvios',
    releaseSchedule: 'Calendário de Lançamentos',
    process: 'Editor de Processos',
    // Supply Chain - Suppliers
    supplierDatabase: 'Base de Dados de Fornecedores',
    supplierPortal: 'Portal de Fornecedores',
    // Integrations
    googleDrive: 'Google Drive',
    // System
    terminal: 'Terminal',
    settings: 'Definições',
    // Section Headers
    sourceFiles: 'Ficheiros Fonte',
    itemsSection: 'Artigos',
    changeControl: 'Controlo de Alterações',
    supplyChain: 'Cadeia de Abastecimento',
    suppliers: 'Fornecedores',
    purchasing: 'Compras',
    logistics: 'Logística',
    production: 'Produção',
    quality: 'Qualidade',
    integrations: 'Integrações',
    // Sidebar control
    sidebarControl: 'Controlo da barra lateral',
    expanded: 'Expandida',
    collapsed: 'Recolhida',
    expandOnHover: 'Expandir ao passar',
  },

  fileBrowser: {
    name: 'Nome',
    fileStatus: 'Estado do Ficheiro',
    checkedOutBy: 'Extraído Por',
    version: 'Ver',
    itemNumber: 'Número do Artigo',
    description: 'Descrição',
    revision: 'Rev',
    state: 'Estado',
    ecoTags: 'ECOs',
    extension: 'Tipo',
    size: 'Tamanho',
    modified: 'Modificado',
    noFilesFound: 'Nenhum ficheiro encontrado',
    dropFilesHere: 'Largue ficheiros aqui para carregar',
  },

  autoDiscard: {
    removed: {
      generic_one: '{{count}} ficheiro eliminado do cofre',
      generic_other: '{{count}} ficheiros eliminados do cofre',
      fromFolder_one: '{{count}} ficheiro eliminado de {{folder}} (eliminado do cofre)',
      fromFolder_other: '{{count}} ficheiros eliminados de {{folder}} (eliminados do cofre)',
    },
    failed: {
      generic_one: 'Não foi possível descartar automaticamente {{count}} ficheiro órfão',
      generic_other: 'Não foi possível descartar automaticamente {{count}} ficheiros órfãos',
    },
    directoriesRemoved: {
      generic_one: 'Também foi eliminada {{count}} pasta vazia que ficou',
      generic_other: 'Também foram eliminadas {{count}} pastas vazias que ficaram',
    },
    directoriesTrackedByServer: {
      generic_one:
        '{{count}} folder is empty here but still listed on the server, so it was left in place',
      generic_other:
        '{{count}} folders are empty here but still listed on the server, so they were left in place',
    },
  },

  fileOps: {
    serverPathUpdateFailed:
      'Algumas mudanças de nome não chegaram ao servidor, que continua a registar os caminhos antigos. Os ficheiros afetados aparecem como movidos; execute reconcile-moved-paths para os atualizar.',
    cloudRenameFailed: 'Não foi possível mudar o nome no servidor',
    movedAwayBlocked: 'O ficheiro foi movido - resolva primeiro a mudança pendente',
    moveTargetExists: '"{{name}}" já existe na pasta de destino, por isso não foi movido',
    mergeKeptConflicts: '{{count}} arquivos existem nas duas pastas, por isso foram deixados em {{folder}}',
    checkIn: 'Check-In',
    checkOut: 'Check-Out',
    download: 'Transferir',
    downloadSkippedNoHash_one: '1 ficheiro não tinha um hash transferível',
    downloadSkippedNoHash_other: '{{count}} ficheiros não tinham um hash transferível',
    getLatest: 'Obter a versão mais recente',
    upload: 'Carregar',
    delete: 'Eliminar',
    rename: 'Renomear',
    move: 'Mover',
    copy: 'Copiar',
    paste: 'Colar',
    openFile: 'Abrir Ficheiro',
    openFolder: 'Abrir Pasta',
    openInExplorer: 'Abrir no Explorador',
    viewHistory: 'Ver Histórico',
    compare: 'Comparar',
    rollback: 'Reverter',
    discard: 'Descartar Alterações',
    forceRelease: 'Forçar Libertação',
  },

  syncError: {
    toast: 'Falha na sincronização: {{reason}}',
    toastWithMore: 'Falha na sincronização: {{reason}} (+{{count}} mais)',
    failed: 'Falha na sincronização',
    unknown: 'Erro desconhecido',
    pathCaseConflict:
      'Outro ficheiro já ocupa este caminho no servidor e difere apenas em maiúsculas e minúsculas. Atualize a lista de ficheiros para o ver.',
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
    ready: 'Pronto',
    syncing: 'A sincronizar...',
    uploading: 'A carregar...',
    downloading: 'A transferir...',
    processing: 'A processar...',
    connected: 'Ligado',
    disconnected: 'Desligado',
    offline: 'Offline',
    online: 'Online',
  },

  fileState: {
    released: 'Publicado',
    inWork: 'Em Trabalho',
    pending: 'Pendente',
    obsolete: 'Obsoleto',
    checkedOut: 'Extraído',
    checkedIn: 'Registado',
  },

  diffStatus: {
    added: 'Adicionado',
    modified: 'Modificado',
    deleted: 'Eliminado',
    outdated: 'Desatualizado',
    cloud: 'Nuvem',
    cloudNew: 'Novo (Nuvem)',
    moved: 'Movido',
    movedAway: 'Movido (anterior)',
    ignored: 'Ignorado',
  },

  fileStatus: {
    deletedFromServer: 'Eliminado do servidor',
    movedTooltip: 'Este ficheiro está aqui agora, mas o cofre ainda regista o caminho anterior',
    movedAwayTooltip: 'O cofre ainda lista este ficheiro aqui, mas ele foi movido',
    movedAwayTooltipTo: 'Movido para {{path}}',
  },

  explorer: {
    pendingMovesBadgeTitle_one: '{{count}} movimentação de ficheiro pendente — clique para rever',
    pendingMovesBadgeTitle_other:
      '{{count}} movimentações de ficheiros pendentes — clique para rever',
    disconnectWarningMoved_one:
      '{{count}} ficheiro foi movido, e o cofre ainda regista o caminho anterior',
    disconnectWarningMoved_other:
      '{{count}} ficheiros foram movidos, e o cofre ainda regista os caminhos anteriores',
    disconnectWarningMovedHint: 'Atualize o cofre para corresponder, ou devolva os ficheiros',
  },

  vaultOperations: {
    createFailed: 'Não foi possível criar o cofre: {{error}}',
  },

  vaultSetup: {
    title: 'Configurar o seu cofre',
    subtitle: 'Configure como os ficheiros são sincronizados para o seu computador',
    fileCount: '{{count}} ficheiros',
    fileCountSingular: '1 ficheiro',
    totalSize: '{{size}} no total',
    autoDownloadCloudTitle: 'Descarregar ficheiros da nuvem automaticamente',
    autoDownloadCloudDesc:
      'Descarregar automaticamente ficheiros que existem no servidor mas não no seu computador',
    autoDownloadUpdatesTitle: 'Descarregar atualizações de ficheiros automaticamente',
    autoDownloadUpdatesDesc:
      'Descarregar automaticamente versões mais recentes quando os ficheiros são atualizados no servidor',
    summary: 'Após conectar, o BluePLM irá descarregar {{count}} ficheiros ({{size}})',
    summaryNoDownload: 'Os ficheiros só serão descarregados quando os solicitar',
    connect: 'Conectar cofre',
    skip: 'Ignorar configuração',
  },

  solidworksVersion: {
    title: 'Escolha a sua versão do SOLIDWORKS',
    subtitle: 'Existem várias versões instaladas neste computador',
    explanation:
      'O BluePLM só consegue ligar-se a uma versão do SOLIDWORKS de cada vez. Escolha aquela que realmente usa, caso contrário o BluePLM pode indicar que o SOLIDWORKS está indisponível mesmo estando aberto.',
    windowsDefault: 'Predefinição do Windows',
    confirm: 'Usar esta versão',
    decideLater: 'Decidir mais tarde',
    settingTitle: 'Versão do SOLIDWORKS',
    settingLabel: 'Versão à qual ligar',
    settingDescription: 'Com que versão do SOLIDWORKS o BluePLM comunica',
    settingHint:
      'Esta alteração reinicia o serviço SOLIDWORKS. Escolha a versão em que abre os seus ficheiros.',
    automatic: 'Automática',
    automaticDescription: 'Usar a versão que o Windows registou como predefinida',
  },

  reconcileMovedPaths: {
    offline: 'Não é possível reconciliar caminhos movidos offline',
    notSignedIn: 'Faça login primeiro',
    noOrganization: 'Nenhuma organização conectada',
    noVault: 'Nenhum cofre conectado',
    nothingToReconcile: 'Nenhum arquivo está aguardando a atualização do seu caminho no servidor',

    reportHeading:
      '{{count}} arquivos foram movidos ou renomeados neste computador enquanto o servidor continuou registrando os caminhos antigos.',
    reportEligible: 'Em {{count}} o caminho do servidor pode ser gravado agora.',
    reportBlocked: '{{count}} estão com check-out feito por outras pessoas e não serão gravados:',
    reportHolder: '{{count}} em posse de {{user}}',
    unknownHolder: 'outro usuário',
    reportConflict: '{{count}} ignorados — outro registro de arquivo já ocupa o novo caminho:',
    reportUnverified:
      '{{count}} ignorados — o conteúdo do arquivo já não corresponde ao que o servidor registrou para ele, portanto a movimentação não pode ser verificada:',
    reportItem: '{{from}} → {{to}}',
    reportAndMore: '… e mais {{count}}',

    dryRunSummary:
      'Apenas verificação prévia: {{eligible}} de {{total}} caminhos do servidor podem ser gravados. Nada foi gravado.',
    dryRunNote: 'Apenas relatório. Nada é gravado sem --apply.',

    refused:
      'Nada foi gravado: {{count}} desses arquivos estão com check-out feito por outras pessoas ({{holders}}). Peça que façam check-in e execute novamente, ou execute com --skip-checked-out para reconciliar os demais e deixar os deles intactos.',
    nothingEligible:
      'Nada pode ser gravado: {{blocked}} estão com check-out feito por outras pessoas e {{skipped}} foram ignorados.',
    confirmUnavailable:
      'Nada foi gravado: este comando precisa de uma caixa de diálogo de confirmação e nenhuma estava disponível.',

    confirmTitle: 'Atualizar {{count}} caminhos do servidor?',
    confirmMessage:
      'O caminho no servidor de {{count}} arquivos será atualizado para onde eles estão agora no disco. Isto grava um registro e anota uma movimentação para cada um, e todos os outros computadores da organização receberão os novos caminhos na próxima sincronização.',
    confirmRemainder: '{{count}} outros permanecem inalterados ({{detail}}).',
    confirmText: 'Atualizar {{count}} caminhos',
    declined: 'Cancelado. Nada foi gravado.',

    progress: 'Atualizando {{count}} caminhos do servidor…',
    failureItem: '{{path}}: {{error}}',
    unknownError: 'Erro desconhecido',

    autoApplied: '{{name}} foi movido para {{path}} no cofre, acompanhando sua movimentação neste computador.',
    autoAppliedMany: '{{count}} arquivos com check-out seu foram movidos no cofre, acompanhando suas movimentações neste computador.',
    summaryComplete: '{{count}} caminhos do servidor reconciliados.',
    summaryPartial:
      '{{succeeded}} de {{total}} caminhos do servidor reconciliados — {{leftovers}}. Execute novamente para concluir.',
    summaryFailed: '{{count}} com falha',
    summaryNotAttempted: '{{count}} não tentados',
    summaryBlocked: '{{count}} com check-out de outros',
    summarySkipped: '{{count}} ignorados',
  },

  adoptServerPaths: {
    notSignedIn: 'Faça login primeiro',
    noVault: 'Nenhum cofre conectado',
    nothingToAdopt: 'Nenhum arquivo está aguardando ser renomeado para o caminho do servidor',

    reportHeading:
      '{{count}} arquivos estão num caminho local que já não corresponde ao que o servidor registra para eles.',
    reportEligible: '{{count}} já podem ser renomeados para o caminho do servidor.',
    reportBlocked:
      '{{count}} estão com check-out feito por outras pessoas e serão deixados intactos, a menos que forçado:',
    reportHolder: '{{count}} em posse de {{user}}',
    unknownHolder: 'outro usuário',
    reportConflict: '{{count}} ignorados — já existe outro arquivo no destino, no disco:',
    reportUnverified:
      '{{count}} ignorados — o conteúdo do arquivo já não corresponde ao que o servidor registrou para ele, portanto a movimentação não pode ser verificada:',
    reportItem: '{{from}} → {{to}}',
    reportAndMore: '… e mais {{count}}',

    dryRunSummary:
      'Apenas verificação prévia: {{eligible}} de {{total}} arquivos podem ser renomeados para o caminho do servidor. Nada foi gravado.',
    dryRunNote: 'Apenas relatório. Nada é gravado sem --apply.',

    refused:
      'Nada foi renomeado: {{count}} desses arquivos estão com check-out feito por outras pessoas ({{holders}}). A renomeação afeta apenas o seu próprio disco e é segura de qualquer forma — peça a eles primeiro, ou execute novamente com --force para renomeá-los também.',
    nothingEligible: 'Nada pode ser renomeado: {{skipped}} foram ignorados.',
    confirmUnavailable:
      'Nada foi renomeado: este comando precisa de uma caixa de diálogo de confirmação e nenhuma estava disponível.',

    confirmTitle: 'Renomear {{count}} arquivos para o caminho do servidor?',
    confirmMessage:
      '{{count}} arquivos neste computador serão renomeados para o caminho que o servidor já registra para eles. Isto altera apenas o seu disco local — nada é gravado no servidor.',
    confirmRemainder: '{{count}} outros permanecem inalterados ({{detail}}).',
    confirmText: 'Renomear {{count}} arquivos',
    declined: 'Cancelado. Nada foi renomeado.',

    progress: 'Renomeando {{count}} arquivos para o caminho do servidor…',
    failureItem: '{{path}}: {{error}}',
    unknownError: 'Erro desconhecido',
    destinationAppeared: 'Outro arquivo apareceu em "{{path}}" desde a verificação prévia',
    createFolderFailed: 'Não foi possível criar a pasta de destino — {{error}}',

    summaryComplete: '{{count}} arquivos renomeados para o caminho do servidor.',
    summaryPartial:
      '{{succeeded}} de {{total}} arquivos renomeados — {{leftovers}}. Execute novamente para concluir.',
    summaryFailed: '{{count}} com falha',
    summaryNotAttempted: '{{count}} não tentados',
    summaryBlocked: '{{count}} com check-out de outros',
    summarySkipped: '{{count}} ignorados',
  },

  terminal: {
    confirmationPending: 'Waiting for confirmation — press Enter to confirm, Esc or Ctrl+C to cancel.',
    confirmationCancelled: 'Confirmation cancelled.',
    cadPreviewModeHelp: 'Valores de cadPreviewMode: thumbnail, edrawings, edrawings-embedded',
    cadPreviewModeInvalid:
      'cadPreviewMode deve ser um destes valores: "thumbnail", "edrawings" ou "edrawings-embedded".',
  },

  resolveMoves: {
    title: 'Resolver movimentações pendentes',
    subtitle:
      'Alguns arquivos estão num caminho diferente do que o cofre registra. Escolha qual lado deve prevalecer.',
    noPendingMoves: 'Não há nada para resolver — nenhuma movimentação pendente encontrada.',

    scopeLabel: 'Mostrar',
    scopeFile: 'Este arquivo',
    scopeFolder: 'Esta pasta',
    scopeVault: 'Todo o cofre',
    vaultWideNote:
      'Resolver sempre processa todas as movimentações pendentes do cofre, não apenas as mostradas acima.',

    listHeading_one: '{{count}} movimentação pendente exibida',
    listHeading_other: '{{count}} movimentações pendentes exibidas',
    noMovesInScope: 'Nenhuma movimentação pendente neste âmbito.',
    moreFiles: '… e mais {{count}}',

    reconcileOptionTitle: 'Manter o novo local e atualizar o cofre para corresponder',
    reconcileOptionDescription:
      'Grava o caminho do seu disco no servidor. Todos os outros recebem o novo local na próxima sincronização.',
    adoptOptionTitle: 'Colocar os arquivos de volta onde o cofre os tem',
    adoptOptionDescription:
      'Renomeia os arquivos do seu disco de volta ao caminho que o servidor já registra. Nada é gravado no servidor.',

    eligibleCount_one: '{{count}} arquivo pronto',
    eligibleCount_other: '{{count}} arquivos prontos',
    blockedCount_one: '{{count}} arquivo com check-out de outra pessoa',
    blockedCount_other: '{{count}} arquivos com check-out de outros',
    conflictCount_one: '{{count}} arquivo ignorado — destino já ocupado',
    conflictCount_other: '{{count}} arquivos ignorados — destino já ocupado',
    unverifiedCount_one: '{{count}} arquivo ignorado — o conteúdo já não corresponde',
    unverifiedCount_other: '{{count}} arquivos ignorados — o conteúdo já não corresponde',
    noEligible: 'Ainda não há nada aqui que possa ser resolvido.',
    unknownHolder: 'outro usuário',

    skipCheckedOutLabel_one:
      'Ignorar o arquivo com check-out de outra pessoa e atualizar o restante',
    skipCheckedOutLabel_other:
      'Ignorar os {{count}} arquivos com check-out de outros e atualizar o restante',
    forceLabel_one: 'Renomear também o arquivo com check-out de outra pessoa',
    forceLabel_other: 'Renomear também os {{count}} arquivos com check-out de outros',

    runReconcile: 'Atualizar o cofre',
    runAdopt: 'Restaurar arquivos locais',

    contextMenuItem: 'Resolver arquivos movidos…',
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
      needsDecisionNote: "Re-align will not touch any of these — they need your decision.",
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
    hideFromNonAdmins: 'Ocultar de não administradores',
    showToEveryone: 'Mostrar a todos',
    notAccessControl:
      'Oculta esta pasta na interface para quem não é administrador. Não é uma restrição de acesso, os ficheiros continuam legíveis.',
    badgeLabel: 'Oculta de não administradores',
    hidden: 'Pasta oculta de não administradores',
    unhidden: 'Pasta visível para todos',
    updateFailed: 'Não foi possível atualizar a visibilidade da pasta',
    updateNotPermitted: 'Pode não ter permissão para alterar a visibilidade da pasta',
    scanSkipped: 'Foram ignorados {{count}} ficheiros em pastas ocultas de não administradores',
  },

  metadataRestore: {
    noOrganization: 'Sem sessão iniciada numa organização.',
    noVault: 'Nenhum cofre ligado.',
    adminOnly:
      'Apenas um administrador pode aplicar um restauro de metadados. Execute sem --apply para ver o que seria escrito.',
    alreadyRunning: 'Já está a decorrer um restauro de metadados.',
    scanning:
      'A ler os ficheiros SolidWorks apenas em leitura para encontrar números de artigo e descrições vazios. Ainda nada é escrito.',
    cancelled: 'A análise foi cancelada. Nada foi escrito.',
    unread:
      'Não foi possível ler {{count}} ficheiros (em falta, ilegíveis ou abertos no SolidWorks) e não estão incluídos.',
    planLine: '  {{path}}: {{values}}',
    fieldValue: '{{field}} = "{{value}}"',
    field: {
      part_number: 'Número de artigo',
      description: 'Descrição',
    },
    heldByOther: '  {{path}} ignorado: com check-out por outro utilizador.',
    summary:
      '{{files}} ficheiros, {{values}} valores a preencher. Excluídos: {{excluded}}. Com check-out por outros: {{held}}. Edições pendentes mantidas: {{pending}}.',
    dryRun:
      'Simulação. Nada foi escrito. Execute novamente com --apply para preencher estes valores.',
    fileFailed: 'Não foi possível atualizar {{path}}: {{reason}}',
    fileRefused: 'A base de dados não permitiu a atualização de {{path}}.',
    applied:
      '{{filled}} valores preenchidos. Já definidos por outra pessoa: {{alreadySet}}. Não permitidos: {{refused}}. Ficheiros com falha: {{failed}}.',
    failed: 'O restauro de metadados falhou: {{reason}}',
  },

  divergence: {
    emptyColumnHeading:
      '4. Números de artigo e descrições vazios no BluePLM mas ainda no ficheiro - PREENCHER APENAS A PEDIDO',
    emptyColumnNone: '  Nenhum encontrado.',
    emptyColumnSummary:
      '  {{count}} valores em {{files}} peças e montagens: o BluePLM não tem número de artigo nem descrição, e o ficheiro ainda tem um sob uma chave que o BluePLM escreve. Antes da 4.4.5, um envio ou uma atualização a partir do ficheiro podia esvaziar estas colunas, por isso pode ser um valor perdido - ou um que o BluePLM nunca teve. Nada aqui é preenchido automaticamente.',
    emptyColumnLine: '  {{path}} {{field}}: ficheiro "{{value}}"',
    emptyColumnHow:
      '  Para os preencher, use "Preencher vazios a partir do ficheiro" em Definições > Vault Audit, ou execute restore-metadata-from-files. Só são escritas as colunas que continuam vazias.',
  },

  vaultAudit: {
    category: {
      emptyInDatabase: 'Vazio no BluePLM, ainda no ficheiro',
      emptyInDatabaseDescription:
        'Números de artigo e descrições sem valor no BluePLM, enquanto a peça ou montagem ainda tem um sob uma chave que o BluePLM escreve. Antes da 4.4.5, um envio ou uma atualização a partir do ficheiro podia esvaziá-los, por isso muitos são perdas - mas alguns talvez nunca tenham sido do BluePLM. Nada aqui é preenchido a menos que o decida.',
    },
    resolution: {
      fillEmptyFromFile: 'Preencher vazios a partir do ficheiro',
      fillEmptyFromFileHint:
        'Escreve o valor do ficheiro no BluePLM apenas enquanto a coluna continuar vazia. Não é criada nenhuma versão nova e nenhum documento é alterado.',
    },
    blocked: {
      unsavedLocalEdit: 'tem uma alteração não guardada a este campo neste computador',
    },
    fill: {
      guarantee:
        'Cada valor só é escrito se a coluna do BluePLM ainda estiver vazia nesse momento, por isso tudo o que foi preenchido desde a análise é mantido. Não é criada nenhuma versão nova, nenhum documento é alterado e os ficheiros com check-out de outra pessoa são ignorados. Cada ficheiro preenchido fica registado no registo de atividade.',
      adminOnly: 'Só um administrador pode preencher valores a partir de ficheiros.',
      selectPrompt: 'Assinale os valores que devem ser copiados do ficheiro para o BluePLM.',
      selectedSummary: '{{values}} valores selecionados em {{files}} ficheiros.',
      review: 'Rever {{count}} valores',
      previewHeading: 'Estes {{values}} valores serão escritos em {{files}} ficheiros no BluePLM:',
      previewLine: '{{path}} — {{field}}: "{{value}}"',
      previewMore: 'e mais {{count}}',
      cancel: 'Cancelar',
      apply: 'Preencher {{count}} valores',
      applying: 'A preencher…',
      receiptFilled: '{{count}} valores preenchidos.',
      receiptAlreadySet: '{{count}} já tinham sido definidos por outra pessoa e ficaram como estavam.',
      receiptHeld: '{{count}} ficheiros têm check-out de outra pessoa e foram ignorados.',
      receiptRefused:
        'A base de dados não permitiu {{refused}} valores e {{failed}} ficheiros falharam. Nada mais mudou neles.',
      appliedToast: '{{count}} valores preenchidos a partir de ficheiros.',
    },
  },

  nativeExtensions: {
    modulesTitle: "Módulos de extensões",
    modulesDescription: "Áreas de trabalho adicionadas pelas extensões da sua organização. Ative ou desative para mostrá-las ou ocultá-las na barra lateral e escolha onde cada uma fica; por padrão, são posicionadas pelo próprio grupo.",
    moduleRestricted: "Restrito pelo seu administrador",
    moduleFrom: "de {{extension}}",
    modulePosition: "Posição de {{workspace}}",
    modulePositionDefault: "Pelo grupo",
    modulePositionTop: "No topo",
    modulePositionAfter: "Depois de {{module}}",
    crashedTitle: "Esta extensão parou de funcionar",
    crashedBody: "A extensão {{id}} encontrou um erro nesta área. O restante do BluePLM não foi afetado.",
    retry: "Tentar novamente",
    notLoaded: "Esta extensão não está carregada.",
    permissionsGroup: "Extensões",
    sectionTitle: "Extensões da organização",
    sectionDescription: "Extensões nativas são executadas com acesso total para todos na organização, em cada computador e no servidor da API. Instale apenas pacotes confiáveis. Cada uma é executada somente a partir do pacote exato instalado aqui, verificado por SHA-256.",
    installButton: "Instalar para a organização",
    reload: "Recarregar",
    installed: "{{name}} {{version}} instalada",
    confirmInstallTitle: "Instalar {{name}} {{version}} para a organização?",
    confirmInstallBody: "Ela será executada com acesso total no BluePLM para cada membro, e no servidor da API quando ele recarregar suas extensões.",
    confirm: "Instalar",
    cancel: "Cancelar",
    sqlTitle: "Aplique estes arquivos SQL",
    sqlBody: "Esta extensão traz alterações no banco de dados. Aplique cada arquivo no editor SQL do Supabase, em ordem. O BluePLM nunca executa SQL por conta própria.",
    copy: "Copiar",
    copied: "Copiado",
    enable: "Ativar",
    disable: "Desativar",
    uninstall: "Desinstalar",
    confirmUninstall: "Desinstalar {{name}} para todos",
    statusActive: "Em execução",
    statusLoading: "Carregando",
    statusError: "Falha ao carregar",
    statusDisabled: "Desativada",
    statusNotLoaded: "Não carregada neste computador",
    none: "Nenhuma extensão da organização instalada.",
    error: "Erro: {{message}}",
  },
  extensionRuntime: {
    notice:
      "Extensões da loja ou de um arquivo ficam neste computador, mas não são executadas: o ambiente isolado não está disponível. As extensões da organização, instaladas acima por um administrador, são executadas.",
    installedNotRunning: 'Instalada (não executada)',
    adminOnly: 'Somente administradores podem instalar ou remover extensões.',
    notAdminError: 'Somente administradores podem instalar extensões.',
  },
  strandedEdits: {
    checkoutLost:
      'O seu check-out de {{name}} foi libertado enquanto tinha alterações de metadados não guardadas. Já não podem ser enviadas por check-in. Ao fazer check-out do ficheiro novamente, será perguntado antes de as descartar - anote-as se precisar delas.',
    confirmTitle: 'Descartar alterações não guardadas em {{count}} ficheiros?',
    confirmMessage:
      'Estes ficheiros foram libertados enquanto tinha alterações de metadados não guardadas, por isso as alterações nunca foram enviadas por check-in. Fazer check-out novamente descarta as alterações abaixo e elas não são restauradas - alguém pode ter feito check-in de valores mais recentes entretanto. Cancele para as manter neste computador e anotá-las primeiro.',
    confirmContinue: 'Descartar alterações e fazer check-out',
    cancelled: 'Check-out cancelado. As suas alterações não guardadas em {{count}} ficheiros foram mantidas.',
    item: '{{path}}: {{edits}}',
    valueEdit: '{{field}} "{{value}}"',
    clearedEdit: '{{field}} limpo',
    configurationEdit: '{{field}} em {{count}} configurações',
    field: {
      part_number: 'Número de artigo',
      tab_number: 'Número de separador',
      description: 'Descrição',
      revision: 'Revisão',
      config_tabs: 'Números de separador das configurações',
      config_descriptions: 'Descrições das configurações',
    },
  },
  // Top-bar SOLIDWORKS status: the signed-in user's own license
  solidworksLicense: {
    title: 'A sua licença do SOLIDWORKS',
    noneAssigned: 'Nenhuma atribuída a si',
    checking: 'A verificar…',
    match: 'O SOLIDWORKS neste computador usa a sua licença.',
    mismatch: 'O SOLIDWORKS neste computador não está a usar a licença que lhe foi atribuída.',
    unassigned: 'O SOLIDWORKS neste computador está licenciado, mas o BluePLM não lhe atribuiu nenhuma licença.',
    unknown: 'Não foi possível ler que licença o SOLIDWORKS usa neste computador.',
    askAdmin: 'Peça a um administrador para verificar a atribuição da sua licença.',
    warningBadge: 'Aviso de licença',
  },
  settingsPages: {
    export: {
      title: 'Definições de exportação',
      description: 'Configure como são nomeados os ficheiros exportados',
      loading: 'A carregar definições de exportação...',
      savedPersonal: 'Guardado como preferência pessoal',
      resetOrganization: 'Reposto o padrão da organização',
      savedOrganization: 'Padrão da organização guardado',
      saveFailed: 'Não foi possível guardar',
      unknownError: 'Erro desconhecido',
      resetDefault: 'Repor padrão',
      saveForMe: 'Guardar para mim',
      organizationWideDefault: 'Definir como padrão da organização',
      saveOrganizationDefault: 'Guardar para a organização',
      usingPersonal: 'A usar a sua preferência pessoal',
      usingOrganization: 'A usar o padrão da organização',
      filenamePattern: 'Padrão do nome do ficheiro',
      tokenHelp: 'Use marcadores para criar nomes de ficheiro dinâmicos ({{examples}})',
      preview: 'Pré-visualização',
      quickPresets: 'Predefinições rápidas',
      availableTokens: 'Marcadores disponíveis (clique para inserir)',
      exampleAbbreviation: 'ex.',
      additionalOptions: 'Opções adicionais',
      includeConfiguration: 'Incluir o nome da configuração em exportações individuais',
      includeConfigurationHelp: 'Adiciona o nome ao exportar uma configuração',
      defaultFormat: 'Formato de exportação predefinido',
      defaultFormatHelp: 'Formato predefinido no menu de contexto do navegador',
      stlOptions: 'Opções de exportação STL',
      resolutionQuality: 'Qualidade da resolução',
      deviation: 'Desvio (mm)',
      deviationHelp: 'Distância máxima entre a malha e a superfície real',
      angleTolerance: 'Tolerância angular (graus)',
      angleToleranceHelp: 'Resolução angular para superfícies curvas',
      binaryFormat: 'Formato STL binário',
      binaryFormatHelp:
        'Os ficheiros binários são menores e mais rápidos. Desative para usar ASCII legível.',
      tokenReference: 'Referência de marcadores',
      token: 'Marcador',
      tokenDescription: 'Descrição',
      example: 'Exemplo',
      tokens: {
        fileName: 'Nome do ficheiro',
        fileNameDescription: 'Nome original sem extensão',
        configuration: 'Configuração',
        configurationDescription: 'Nome da configuração do SolidWorks',
        partNumber: 'Número da peça',
        partNumberDescription: 'Número da peça ou artigo das propriedades',
        numberAlternate: 'Número (alternativo)',
        sameAsPartNumber: 'Igual a {partNumber}',
        tabNumber: 'Número da variante',
        tabNumberDescription: 'Sufixo numérico da variante de configuração',
        tabAlternate: 'Variante (alternativa)',
        sameAsTab: 'Igual a {tab}',
        revision: 'Revisão',
        revisionDescription: 'Revisão das propriedades',
        revisionAlternate: 'Revisão (alternativa)',
        sameAsRevision: 'Igual a {revision}',
        description: 'Descrição',
        descriptionDescription: 'Descrição das propriedades',
        descriptionAlternate: 'Descrição (alternativa)',
        sameAsDescription: 'Igual a {description}',
        date: 'Data',
        dateDescription: 'Data atual (AAAA-MM-DD)',
        time: 'Hora',
        timeDescription: 'Hora atual (HH-MM-SS)',
        dateTime: 'Data e hora',
        dateTimeDescription: 'Data e hora atuais',
      },
      presets: {
        fileAndConfig: 'Ficheiro + configuração',
        partNumberOnly: 'Apenas número da peça',
        partAndRevision: 'Peça + revisão',
        partAndTab: 'Peça + variante',
        partTabAndRevision: 'Peça + variante + revisão',
        partAndConfig: 'Peça + configuração',
        partConfigAndRevision: 'Peça + configuração + revisão',
        fileAndDate: 'Ficheiro + data',
      },
      resolution: {
        coarse: 'Baixa',
        fine: 'Alta',
        custom: 'Personalizada',
        coarseHelp: 'Triângulos maiores e ficheiro menor. Adequado para visualização.',
        fineHelp: 'Triângulos menores e maior precisão. Recomendado para impressão 3D.',
        customHelp: 'Defina tolerâncias personalizadas de desvio e ângulo.',
      },
    },
    metadata: {
      typeText: 'Texto',
      typeNumber: 'Número',
      typeDate: 'Data',
      typeBoolean: 'Sim/Não',
      typeSelect: 'Menu suspenso',
      personalDefaultsSaved: 'Salvo como seus padrões pessoais',
      defaultsSaveFailed: 'Falha ao salvar os padrões',
      personalDefaultsLoaded: 'Carregado seus padrões pessoais',
      defaultsLoadFailed: 'Falha ao carregar os padrões',
      organizationDefaultsSaved: 'Salvo como padrões da organização',
      organizationDefaultsLoaded: 'Padrões da organização carregados',
      applicationDefaultsRestored: 'Reiniciado para padrões do aplicativo',
      layoutPushed: 'Layout de colunas enviado a todos os usuários',
      layoutPushFailed: 'Falha ao enviar o layout de colunas',
      loadFailed: 'Falha ao carregar as colunas de metadados',
      nameRequired: 'O nome da coluna é obrigatório',
      labelRequired: 'A etiqueta da coluna é obrigatória',
      invalidName:
        'O nome deve começar com uma letra e conter apenas letras minúsculas, números e underscores',
      columnUpdated: 'Coluna atualizada',
      columnCreated: 'Coluna criada',
      duplicateName: 'Uma coluna com este nome já existe',
      columnSaveFailed: 'Falha ao salvar a coluna',
      columnDeleted: 'Coluna "{{label}}" excluída',
      columnDeleteFailed: 'Falha ao excluir a coluna',
      columnUpdateFailed: 'Falha ao atualizar a coluna',
      reorderFailed: 'Falha ao reordenar colunas',
      optionExists: 'Esta opção já existe',
      builtInColumns: 'Colunas embutidas',
      standardColumns: 'Colunas padrão.',
      adminBuiltInHelp: 'Define a largura e visibilidade padrão para sua organização.',
      memberBuiltInHelp: 'Alternar visibilidade para mostrar/ocultar.',
      column: 'Coluna',
      width: 'Largura',
      visible: 'Visível',
      hideColumn: 'Ocultar coluna',
      showColumn: 'Mostrar coluna',
      customColumns: 'Colunas personalizadas',
      adminCustomHelp: 'Define propriedades personalizadas que aparecem no navegador de arquivos.',
      memberCustomHelp:
        'Propriedades personalizadas definidas pelo administrador da sua organização.',
      addColumn: 'Adicionar coluna',
      newColumn: 'Nova coluna',
      editColumn: 'Editar coluna',
      internalName: 'Nome interno',
      internalNamePlaceholder: 'ex.: material, weight',
      internalNameHelp:
        'Usado no armazenamento de dados. Apenas letras minúsculas, números, underscores.',
      displayLabel: 'Rótulo de exibição',
      displayLabelPlaceholder: 'ex.: Material, Weight (kg)',
      dataType: 'Tipo de dado',
      columnWidth: 'Largura da coluna (px)',
      defaultValue: 'Valor padrão',
      optional: 'Opcional',
      dropdownOptions: 'Opções do menu suspenso',
      addOptionPlaceholder: 'Adicionar uma opção…',
      visibleByDefault: 'Visível por padrão',
      sortable: 'Ordenável',
      required: 'Obrigatório',
      cancel: 'Cancelar',
      saving: 'Salvando…',
      createColumn: 'Criar coluna',
      saveChanges: 'Salvar alterações',
      connectOrganization: 'Conectar a uma organização para ver colunas personalizadas',
      noCustomColumns: 'Nenhuma coluna personalizada definida',
      noCustomColumnsHelp:
        'Clique em “Adicionar coluna” para criar propriedades personalizadas como Material, Weight, etc.',
      type: 'Tipo',
      actions: 'Ações',
      requiredShort: 'req',
      deleteColumn: 'Excluir coluna',
      saveMyDefaults: 'Salvar como meus padrões',
      loading: 'Carregando…',
      loadMyDefaults: 'Carregar meus padrões',
      resetAppDefaults: 'Reiniciar para padrões do aplicativo',
      saveOrgDefaults: 'Salvar como padrões da organização',
      pushing: 'Enviando…',
      pushAllUsers: 'Enviar para todos os usuários',
      loadOrgDefaults: 'Carregar padrões da organização',
      personalDefaultsHelp:
        '"Salvar como meus padrões" salva seu layout de colunas na nuvem para que ele se sincronize entre dispositivos.',
      organizationDefaultsHelp:
        '"Salvar como padrões da organização" define a configuração inicial para novos membros da equipe. "Enviar para todos os usuários" substitui o layout atual de cada usuário.',
      deleteConfirm: 'Tem certeza que deseja excluir a coluna "{{label}}"?',
      deleteHelp:
        'Isso removerá a coluna do navegador de arquivos. Metadados de arquivo existentes que usam esta coluna permanecerão no armazenamento, mas não serão exibidos.',
      deleting: 'Excluindo…',
      pushConfirm:
        'Isso substituirá o layout de colunas de cada usuário com sua configuração atual.',
      pushEmphasis: 'cada usuário',
      pushHelp:
        'Todos os usuários conectados receberão a atualização imediatamente. Usuários offline receberão quando abrirem o app novamente.',
    },
    serialization: {
      disabled: 'Desativado',
      previewFailed: 'Falha ao buscar a pré-visualização do número de série',
      saved: 'Configurações de serialização salvas',
      saveFailed: 'Falha ao salvar as configurações de serialização',
      invalidRange: 'Faixa inválida: o fim deve ser maior ou igual ao início',
      overlap: 'Esta faixa sobrepõe uma zona de exclusão existente',
      reservedRange: 'Faixa reservada {{start}}-{{end}}',
      highestFoundToast: 'Maior encontrado: {{partNumber}} (contador: {{counter}})',
      noMatchToast:
        '{{count}} arquivos escaneados, nenhum número de série correspondente encontrado',
      scanFailed: 'Falha ao escanear arquivos',
      counterSet: 'Contador definido para {{counter}}',
      title: 'Configurações de Número de Série',
      description:
        'Configure como os números sequenciais de item/parâmetro são gerados para sua organização.',
      readOnly:
        'Somente administradores podem modificar as configurações de serialização. Você está visualizando em modo somente leitura.',
      nextPreview: 'Próxima Pré-visualização de Número de Série',
      fetchPreview: 'Buscar do servidor',
      serverPreview: 'Pré-visualização do servidor:',
      enable: 'Ativar Serialização Automática',
      enableHelp: 'Gera automaticamente números de parte sequenciais para novos arquivos',
      fileTypes: 'Tipos de Arquivo Auto-Aplicáveis',
      fileTypesHelp:
        'Selecione quais tipos de arquivos devem receber automaticamente um número de série ao serem criados',
      custom: 'Personalizado:',
      add: 'Adicionar',
      enabledFor: 'Serialização automática habilitada para:',
      noFileTypes:
        'Nenhum tipo de arquivo selecionado. A serialização automática não será aplicada a nenhum arquivo.',
      numberFormat: 'Formato do Número',
      prefix: 'Prefixo',
      prefixHelp: 'Texto antes do número',
      suffix: 'Sufixo',
      suffixHelp: 'Texto após o número',
      letterPrefix: 'Prefixo de Letra',
      letterPrefixHelp: 'Letras entre prefixo e número (ex.: AB em PN-AB00001)',
      numberPadding: 'Preenchimento do Número',
      digitsOption: '{{digits}} dígitos ({{sample}})',
      numberPaddingHelp: 'Preenchimento com zeros para a parte numérica',
      currentCounter: 'Valor Atual do Contador',
      currentCounterHelp: 'O próximo número gerado será este valor + 1',
      nextNumber: 'Próximo número será:',
      counterWarning:
        'Alterar este valor pode causar números duplicados ou pulados. Use com cautela.',
      detectHighest: 'Detectar Número Mais Alto Usado',
      detectHighestHelp:
        'Escaneie arquivos do cofre para encontrar o número de série mais alto em uso',
      scanVault: 'Escanear Cofre',
      scannedFiles: '{{count}} arquivos escaneados',
      highestFound: 'Maior encontrado:',
      counterValue: 'Valor do Contador: {{counter}}',
      apply: 'Aplicar',
      noMatches: 'Nenhum número de série correspondente encontrado',
      tabNumbers: 'Números de Aba',
      tabNumbersHelp: 'Adicionar sufixos variantes aos números base (ex.: BR101101-104)',
      tabSeparator: 'Separador de Aba',
      tabSeparatorHelp: 'Caractere(s) entre a base e a aba (ex.: "-")',
      tabDigits: 'Dígitos de Aba',
      tabDigitsOption: '{{digits}} dígitos ({{first}}-{{last}})',
      tabDigitsOptionOne: '{{digits}} dígitos ({{first}}-{{last}})',
      tabDigitsHelp: 'Preenchimento com zeros para o número da aba',
      autoPad: 'Auto-preencher com zeros',
      autoPadHelp: '"1" → "001" ao perder foco',
      tabRequired: 'Aba obrigatória',
      tabRequiredHelp: 'A aba deve ser especificada',
      tabOptionalHelp: 'Aba opcional',
      allowedCharacters: 'Caracteres Permitidos',
      allowNumbers: 'Permitir números (0-9)',
      allowLetters: 'Permitir letras (A-Z)',
      allowSpecial: 'Permitir caracteres especiais',
      allowedSpecial: 'Caracteres especiais permitidos',
      noCharacters: 'Nenhum caractere permitido. A entrada da aba será desativada.',
      exampleWithTab: 'Exemplo com aba:',
      baseOnly: 'Somente base (sem aba):',
      keepoutZones: 'Zonas de Exclusão',
      keepoutZonesHelp: 'Faixas de números reservados que serão ignoradas durante a auto-geração',
      addZone: 'Adicionar Zona',
      start: 'Início',
      end: 'Fim',
      zoneDescription: 'Descrição',
      zonePlaceholder: 'Números de parte legados',
      noKeepoutZones:
        'Nenhuma zona de exclusão definida. Todos os números estarão disponíveis para atribuição.',
      numberCount: '({{count}} números)',
      removeZone: 'Remover zona',
      examplePatterns: 'Padrões de Exemplo',
      examplePrefixDigits: 'Prefixo: "PN-", 5 dígitos',
      examplePrefixLetters: 'Prefixo: "BR-", Letras: "AB"',
      exampleNoPrefix: 'Sem prefixo, 6 dígitos',
      exampleSuffix: 'Com sufixo: "-REV"',
    },
    noOrganization: 'Nenhuma organização ligada',
    noOrganizationSelected: 'Nenhuma organização ligada',
    saveSettings: 'Guardar definições',
    moduleAccess: {
      title: 'Acesso a módulos',
      description:
        'Restrinja um módulo a equipas ou pessoas específicas. Os módulos sem restrição permanecem visíveis para toda a organização. Os administradores mantêm sempre o acesso.',
      adminOnly: 'Apenas os administradores da organização podem configurar o acesso a módulos.',
      loadFailed: 'Não foi possível carregar o acesso a módulos',
      saveFailed: 'Não foi possível guardar o acesso a módulos',
      updated: 'Acesso a módulos atualizado',
      everyone: 'Todos',
      teams: 'Equipas',
      noTeams: 'Ainda não existem equipas.',
      individualPeople: 'Pessoas individuais',
      allowEveryone: 'Permitir a todos',
      allowEveryoneHelp: 'Remover a restrição para que todos possam ver este módulo',
      visibleToAll: 'Visível para toda a organização.',
      restrictedHelp:
        'As restantes pessoas verão este módulo desativado nas definições da barra lateral.',
    },
    authProviders: {
      title: 'Métodos de início de sessão',
      description: 'Controle os métodos de autenticação disponíveis para a sua organização',
      adminOnly: 'Apenas os administradores podem gerir as definições de autenticação',
      loadFailed: 'Não foi possível carregar as definições de autenticação',
      saveFailed: 'Não foi possível guardar as definições de autenticação',
      saved: 'Definições de autenticação guardadas',
      userMethodRequired:
        'Tem de estar ativo pelo menos um método de início de sessão para os utilizadores',
      supplierMethodRequired:
        'Tem de estar ativo pelo menos um método de início de sessão para os fornecedores',
      teamMembers: 'Membros da equipa',
      teamDescription: 'Escolha os métodos que os membros podem usar para aceder ao BluePLM.',
      suppliers: 'Fornecedores',
      supplierDescription:
        'Escolha os métodos que os fornecedores e parceiros externos podem usar.',
      google: 'Conta Google',
      emailPassword: 'E-mail e palavra-passe',
      phoneSms: 'Número de telefone (SMS)',
      securityNote: 'Nota de segurança',
      securityDescription:
        'Desativar um método impede novas sessões através desse método. As sessões existentes permanecem ativas até expirarem.',
    },
    rfq: {
      title: 'Predefinições do modelo RFQ',
      readOnly:
        'Apenas os administradores podem alterar as definições RFQ. Está no modo só de leitura.',
      saved: 'Definições RFQ guardadas',
      saveFailed: 'Não foi possível guardar as definições RFQ',
      paymentTerms: 'Condições de pagamento',
      incoterms: 'Incoterms',
      validDays: 'Proposta válida (dias)',
      documentColumns: 'Colunas do documento RFQ',
      showLogo: 'Mostrar logótipo da empresa',
      showRevision: 'Mostrar coluna de revisão',
      showMaterial: 'Mostrar coluna de material',
      showFinish: 'Mostrar coluna de acabamento',
      showNotes: 'Mostrar coluna de notas',
      terms: 'Termos e condições',
      termsPlaceholder: 'Introduza os termos e condições padrão para documentos RFQ...',
      footer: 'Texto do rodapé',
      footerPlaceholder: 'Texto personalizado para o rodapé dos documentos RFQ',
    },
  },
}
