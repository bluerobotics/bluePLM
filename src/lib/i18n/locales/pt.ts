import type { TranslationDict } from '../types'

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
    previewBoundsUnavailable: 'Não foi possível posicionar a pré-visualização incorporada do eDrawings.',
    openInEDrawings: 'Abrir no eDrawings',
    openInEDrawingsFailed: 'Não foi possível abrir o ficheiro no eDrawings.',
  },
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
    // Customers
    customers: 'Clientes',
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
}
