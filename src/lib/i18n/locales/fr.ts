import type { TranslationDict } from '../types'
import { mdbLifecycleTranslations } from './mdbLifecycle'

// French translations
export const fr: TranslationDict = {
  mdbSetup: {
    title: 'BluePLM MDB',
    chooseConnection: 'Connectez une installation existante ou configurez-en une nouvelle.',
    existing: 'Se connecter à un serveur MDB existant',
    existingHelp: 'Saisissez uniquement l’adresse HTTPS publique.',
    install: 'Configurer un nouveau serveur MDB',
    installHelp: 'Déploiement FTPS guidé avec secrets privés et coffre réseau.',
    backendUrl: 'URL du backend',
    publicUrl: 'URL HTTPS publique',
    connect: 'Se connecter à MariaDB (MDB)',
    deployed: 'Serveur MDB déployé',
    deployedHelp: 'Le paquet serveur et la configuration privée ont été envoyés.',
    openSetup: 'Ouvrir la configuration serveur',
    completed: 'Configuration terminée — connecter BluePLM',
    newServer: 'Configurer un nouveau serveur BluePLM MDB',
    hosting: 'Préparation de l’hébergement',
    addressAndFtp: 'Adresse publique et FTP/FTPS',
    database: 'Connexion MariaDB pour le serveur PHP',
    secrets: 'Secrets de première installation',
    networkVault: 'Chemin du coffre archive/NAS',
    browse: 'Parcourir les dossiers…',
    storeSecrets: 'Enregistrer les secrets générés',
    generatedHelp: 'Ils ne sont affichés qu’une fois et ne sont pas conservés dans le client.',
    sessionComment: 'secret de session',
    bootstrapComment: 'jeton d’amorçage',
    maintenanceComment: 'jeton de maintenance',
    vaultHelp: 'Choisissez la racine archive ou NAS.',
    browseFolders: 'Parcourir les dossiers…',
    finishGuided: 'Terminer la configuration guidée',
    guidedStep1: 'Ouvrez la page de configuration et saisissez le jeton.',
    guidedStep2: 'Créez l’entreprise, le propriétaire, le coffre NAS et la protection facultative.',
    guidedStep3: 'Revenez ici après la réussite.',
    openServerSetup: 'Ouvrir la configuration',
    checkServer: 'Vérification du serveur MDB…',
    connectAfterSetup: 'Configuration terminée — connecter BluePLM',
    hostingPreparation: '1. Préparation de l’hébergement',
    hostingHelp: 'Créez l’utilisateur FTP et la base MariaDB.',
    documentRootConfirmed: 'J’ai confirmé que la racine pointe vers public/.',
    addressFtp: '2. Adresse publique et FTP/FTPS',
    publicHttps: 'URL HTTPS publique',
    ftpServer: 'URL du serveur FTP/FTPS',
    ftpTarget: 'Dossier FTP',
    ftpTargetPlaceholder: 'laisser vide pour la racine de l’utilisateur FTP',
    ftpUser: 'Utilisateur FTP',
    ftpPassword: 'Mot de passe FTP',
    databaseConnection: '3. Connexion MariaDB',
    databaseHost: 'Hôte de base de données',
    port: 'Port',
    databaseName: 'Nom de base de données',
    databaseUser: 'Utilisateur de base de données',
    databasePassword: 'Mot de passe de base de données',
    firstSecrets: '4. Secrets initiaux',
    generateSecrets: 'Générer des secrets sécurisés',
    secretsHelp: 'Les valeurs sont écrites uniquement dans le .env privé.',
    sessionSecret: 'Secret de session',
    bootstrapToken: 'Jeton d’amorçage',
    maintenanceToken: 'Jeton de maintenance',
    deploying: 'Déploiement du serveur MDB…',
    deploy: 'Déployer et démarrer la configuration guidée',
    testingFtp: 'Test de la connexion FTPS…',
    testFtp: 'Tester la connexion FTPS',
    ftpTestPassed: 'Connexion FTPS réussie',
    ftpTestFailed: 'Échec du test de connexion FTPS',
    ftpTestUnavailable: 'Le test FTPS n’est pas disponible dans cette version',
    ...mdbLifecycleTranslations.fr,
  },
  checkoutDisplay: {
    you: 'Vous',
    loadingOwner: 'Chargement du propriétaire du checkout',
    ownerUnavailable: 'Propriétaire du checkout indisponible',
    checkedOutBy: 'Checkout par {{name}}',
    checkedOutByOnComputer: 'Checkout par {{name}} sur {{computer}}',
    anotherComputer: 'un autre ordinateur',
    differentComputer: 'ordinateur différent',
    otherComputer: 'un autre PC',
  },
  fileReadonly: {
    blocked: 'Ce fichier est en lecture seule sur le disque, donc rien n’a été écrit.',
    unknown: 'Impossible de savoir si ce fichier est en lecture seule, donc rien n’a été écrit.',
    stillCheckedOut: 'Récupéré, mais toujours en lecture seule sur le disque : {{names}}',
    madeWritable: '{{count}} fichier(s) étaient déjà récupérés et sont maintenant modifiables.',
    solidWorksStillReadonly:
      'Récupéré et modifiable sur le disque, mais SolidWorks a encore le fichier ouvert en lecture seule. Dans SolidWorks : Edition → Lecture seule, ou fermez et rouvrez le fichier.',
  },
  common: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    add: 'Ajouter',
    remove: 'Retirer',
    close: 'Fermer',
    search: 'Rechercher',
    loading: 'Chargement...',
    error: 'Erreur',
    success: 'Succès',
    warning: 'Avertissement',
    info: 'Info',
    yes: 'Oui',
    no: 'Non',
    ok: 'OK',
    confirm: 'Confirmer',
    back: 'Retour',
    next: 'Suivant',
    refresh: 'Actualiser',
    reset: 'Réinitialiser',
    apply: 'Appliquer',
    clear: 'Effacer',
    select: 'Sélectionner',
    selectAll: 'Tout sélectionner',
    none: 'Aucun',
    all: 'Tous',
    name: 'Nom',
    description: 'Description',
    type: 'Type',
    size: 'Taille',
    date: 'Date',
    status: 'Statut',
    actions: 'Actions',
    settings: 'Paramètres',
    preferences: 'Préférences',
    help: 'Aide',
    about: 'À propos',
    version: 'Version',
    file: 'Fichier',
    folder: 'Dossier',
    files: 'Fichiers',
    folders: 'Dossiers',
    open: 'Ouvrir',
    connect: 'Connecter',
    connecting: 'Connexion...',
    default: 'Par défaut',
    or: 'ou',
    optional: 'optionnel',
  },

  welcome: {
    title: 'BluePLM',
    tagline: 'Gestion du cycle de vie des produits open source',
    selectAccountType: 'Sélectionnez votre type de compte',
    teamMember: "Membre de l'équipe",
    teamMemberDesc: 'Ingénieurs, administrateurs et observateurs',
    supplier: 'Fournisseur',
    supplierDesc: 'Accès au portail fournisseur',
    workOffline: 'Travailler hors ligne',
    offlineMode: 'Mode hors ligne',

    teamSignIn: "Connexion membre de l'équipe",
    signInWithOrg: "Connectez-vous avec votre compte d'organisation",
    signInWithGoogle: 'Se connecter avec Google',
    tryAgain: 'Réessayer',
    connecting: 'Connexion...',
    roleSetByOrg: 'Votre rôle (Admin, Ingénieur, Observateur) est défini par votre organisation',

    supplierPortal: 'Portail fournisseur',
    createAccount: 'Créez votre compte fournisseur',
    signInToAccount: 'Connectez-vous à votre compte',
    email: 'E-mail',
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    passwordMismatch: 'Les mots de passe ne correspondent pas',
    phone: 'Téléphone',
    phoneNumber: 'Numéro de téléphone',
    fullName: 'Nom complet',
    createAccountBtn: 'Créer un compte',
    signIn: 'Se connecter',
    alreadyHaveAccount: 'Vous avez déjà un compte ? Connectez-vous',
    noAccount: 'Pas de compte ? Créez-en un',
    useEmailPassword: 'Utiliser e-mail et mot de passe',
    useGoogleInstead: 'Ou se connecter avec Google',
    sendVerificationCode: 'Envoyer le code de vérification',
    verificationCode: 'Code de vérification',
    verifyAndSignIn: 'Vérifier et se connecter',
    useDifferentNumber: 'Utiliser un autre numéro',
    verificationSent: 'Un code de vérification a été envoyé à',
    includeCountryCode: "Incluez l'indicatif pays (ex: +33 pour la France, +1 pour les USA)",
    supplierInviteNote:
      "Les fournisseurs sont invités par les organisations. Contactez votre acheteur si vous avez besoin d'accès.",

    connectingToOrg: 'Connexion à votre organisation...',
    organizationVaults: "Coffres de l'organisation",
    noVaultsCreated: 'Aucun coffre créé',
    noVaultsAdminMsg: 'Créez un coffre dans Paramètres → Organisation pour commencer.',
    noVaultsUserMsg: 'Demandez à un administrateur de créer un coffre.',
    advancedOptions:
      'Ou utilisez les options avancées ci-dessous pour vous connecter manuellement.',
    localVault: 'Coffre local',

    madeWith: 'Fait avec 💙 par Blue Robotics',
  },

  setup: {
    welcome: 'Bienvenue sur BluePLM',
    backendChooser: 'Choisissez le fournisseur backend pour ce client BluePLM.',
    mdbDescription:
      'API PHP et MariaDB. BluePLM conserve toutes les fonctionnalités indépendantes du backend.',
    connectToBackend: 'Connectez-vous au backend Supabase de votre organisation pour commencer',
    imAdmin: "Je suis administrateur de l'organisation",
    imAdminDesc:
      'Configurez BluePLM avec les identifiants Supabase de votre organisation. Vous obtiendrez un code à partager avec votre équipe.',
    haveCode: "J'ai un code d'organisation",
    haveCodeDesc:
      "Entrez le code fourni par l'administrateur de votre organisation pour vous connecter.",
    needHelp: "Besoin d'aide pour configurer Supabase ?",

    adminSetup: 'Configuration administrateur',
    enterCredentials: 'Entrez vos identifiants Supabase depuis les paramètres API de votre projet',
    projectId: 'ID du Projet',
    projectIdHelp: 'Se trouve en haut de votre tableau de bord Supabase (ex. vvyhpdzqdizvorrhjhvq)',
    anonKey: 'Clé anonyme (publique)',
    orgSlug: "Slug de l'organisation",
    orgSlugHelp: 'Cela aide à identifier votre organisation dans le code généré',
    connectToSupabase: 'Se connecter à Supabase',
    findInDashboard:
      'Trouvez ces valeurs dans votre tableau de bord Supabase → Paramètres du projet → API',

    connectedSuccess: 'Connecté avec succès !',
    shareCode:
      "Partagez ce code avec les membres de votre équipe pour qu'ils puissent se connecter",
    organizationCode: "Code d'organisation",
    keepCodeSecure:
      "Les membres de l'équipe peuvent coller ce code lors de leur première ouverture de BluePLM. Gardez ce code en sécurité - il contient vos identifiants Supabase.",
    continueToBluePLM: 'Continuer vers BluePLM',

    joinOrg: 'Rejoindre votre organisation',
    enterCode: "Entrez le code fourni par l'administrateur de votre organisation",

    enterBothFields: "Veuillez entrer l'ID du Projet et la clé anonyme",
    invalidProjectId: 'Veuillez entrer un ID de Projet valide (lettres et chiffres uniquement)',
    failedToConnect: 'Échec de la connexion à Supabase',
    enterOrgCode: "Veuillez entrer le code d'organisation",
    invalidCode: "Code d'organisation invalide. Veuillez vérifier et réessayer.",
    failedWithCode: 'Échec de la connexion à Supabase avec le code fourni',
  },

  source: {
    configTree: {
      drawings: 'Mises en plan',
      ebom: 'eBOM',
      noDrawings: 'Aucune mise en plan ne fait référence à cette configuration',
      noComponents: 'Aucun composant dans cette configuration',
      expand: 'Développer',
      collapse: 'Réduire',
    },
    configEdit: {
      checkOutToEdit: 'Extraire le fichier pour modifier',
    },
    configCommit: {
      write: 'Écrire dans le fichier',
      writeAndSync: 'Écrire et mettre à jour les mises en plan',
      writeAndSyncCount: 'Écrire et mettre à jour les mises en plan pour {{count}} configurations',
      pending: 'Pas encore écrit dans le document',
      swOffline: 'Démarrez le service SolidWorks pour écrire les métadonnées de configuration',
      summary:
        'Configurations écrites : {{configurations}} ; mises en plan mises à jour : {{updated}}, ignorées : {{skipped}}, échecs : {{failed}}',
    },
    configDrawings: {
      dialogTitle: 'Des mises en plan référencent cette configuration',
      dialogBody:
        'Certaines mises en plan référencées ne sont pas en checkout par vous. Elles doivent être en checkout pour recevoir la mise à jour.',
      checkOutAndUpdate: 'Mettre en checkout et mettre à jour',
      forceModelOnly: 'Écrire uniquement le modèle',
      heldBy: 'Verrouillé par {{name}}',
      blocked: 'Verrouillé par d’autres utilisateurs',
      notInVault: 'Absent de ce coffre',
      ready: 'Prêt à être mis à jour',
      available: 'Disponible pour checkout',
      modelOnlyWarning:
        'Écrire uniquement le modèle laisse inchangées les mises en plan qui ne sont pas en checkout par vous.',
    },
  },

  settings: {
    title: 'Paramètres',
    preferences: 'Préférences',
    account: 'Compte',
    vault: 'Coffre',
    organization: 'Organisation',
    integrations: 'Intégrations',
    solidworks: 'SolidWorks',
    backup: 'Sauvegarde',
    api: 'API',
    logs: 'Journaux',
    about: 'À propos',
  },

  preferences: {
    title: 'Préférences',
    applicationUpdates: "Mises à jour de l'application",
    checkForUpdates: 'Rechercher des mises à jour',
    checking: 'Vérification...',
    upToDate: 'À jour',
    available: 'Disponible',
    youHaveLatest: 'Vous avez la dernière version',
    updateAvailable: 'Mise à jour disponible ! Consultez la notification.',
    couldNotCheck: 'Impossible de vérifier les mises à jour',
    checkForNewVersions: 'Rechercher de nouvelles versions',

    appearance: 'Apparence',
    themeDark: 'Sombre',
    themeDarkDesc: 'Style VS Code Dark+',
    themeDeepBlue: 'Bleu profond',
    themeDeepBlueDesc: 'Thème bleu océan',
    themeLight: 'Clair',
    themeLightDesc: 'Style VS Code Light+',
    themeChristmas: '🎄 Noël',
    themeChristmasDesc: 'Festif avec neige, traîneaux et cloches !',
    themeHalloween: '🎃 Halloween',
    themeHalloweenDesc: 'Effrayant avec étincelles de feu, fantômes et citrouilles !',
    themeKenneth: '👑 Kenneth',
    themeKennethDesc: 'Élégance pourpre royale',
    themeWeather: '🌤️ Météo Locale',
    themeWeatherDesc: "Thème dynamique qui s'adapte à votre météo locale !",
    themeSystem: 'Système',
    themeSystemDesc: 'Suivre les préférences du système',
    autoSeasonalThemes: 'Thèmes saisonniers automatiques',
    autoSeasonalThemesDesc:
      'Passer automatiquement aux thèmes Halloween (1er oct.) et Noël (1er déc.)',

    language: 'Langue',
    displayLanguage: "Langue d'affichage",
    chooseLanguage: "Choisissez la langue de l'interface",
    translationsNote:
      'Note : Certaines traductions peuvent être incomplètes. Un redémarrage peut être nécessaire.',

    fileExtensions: 'Extensions de fichiers',
    lowercaseExtensions: "Extensions en minuscules lors de l'envoi",
    lowercaseExtensionsDesc: "Convertir .SLDPRT en .sldprt lors de l'archivage",

    ignorePatterns: 'Modèles à ignorer (garder local uniquement)',
    ignorePatternsDesc:
      'Les fichiers correspondant à ces modèles resteront locaux et ne seront pas synchronisés.',
    ignorePlaceholder: 'ex: *.tmp, .git/*, thumbs.db',
    connectVaultForPatterns: 'Connectez-vous à un coffre pour gérer les modèles à ignorer.',
    noIgnorePatterns: "Aucun modèle d'exclusion configuré",

    syncSettings: 'Paramètres de synchronisation',
    autoDownloadCloudFiles: 'Téléchargement auto des fichiers cloud',
    autoDownloadCloudFilesDesc:
      'Télécharger automatiquement les fichiers qui existent sur le serveur mais pas localement',
    autoDownloadUpdates: 'Téléchargement auto des mises à jour',
    autoDownloadUpdatesDesc:
      'Télécharger automatiquement lorsque le serveur a des versions plus récentes',
    excludedFiles: 'Fichiers exclus',
    excludedFilesDesc:
      '{{count}} fichier(s) exclus du téléchargement automatique (supprimés manuellement)',
    clearExcludedFiles: 'Effacer la liste',
    autoDiscardOrphanedFiles: 'Supprimer auto les fichiers orphelins',
    autoDiscardOrphanedFilesDesc:
      "Supprimer automatiquement les fichiers locaux qui n'existent plus sur le serveur",
    discardOrphaned: 'Supprimer orphelins',
    discardOrphanedCount: 'Supprimer orphelins ({{count}} fichier{{plural}})',
    orphanedFilesDescription:
      'Ces fichiers ont été synchronisés précédemment mais ont été supprimés du serveur par un autre utilisateur',
  },

  sidebar: {
    // Source Files
    explorer: 'Explorateur',
    pending: 'En attente',
    history: 'Historique',
    workflows: 'Flux de travail fichiers',
    trash: 'Corbeille',
    // Products
    products: 'Explorateur de produits',
    items: "Navigateur d'articles",
    // Change Control
    ecr: 'ECRs / Problèmes',
    eco: 'ECOs',
    notifications: 'Notifications',
    deviations: 'Dérogations',
    releaseSchedule: 'Calendrier de publication',
    process: 'Éditeur de processus',
    // Supply Chain - Suppliers
    supplierDatabase: 'Base de données fournisseurs',
    supplierPortal: 'Portail fournisseurs',
    // Customers
    customers: 'Clients',
    // Integrations
    googleDrive: 'Google Drive',
    // System
    terminal: 'Terminal',
    settings: 'Paramètres',
    // Section Headers
    sourceFiles: 'Fichiers source',
    itemsSection: 'Articles',
    changeControl: 'Contrôle des modifications',
    supplyChain: "Chaîne d'approvisionnement",
    suppliers: 'Fournisseurs',
    purchasing: 'Achats',
    logistics: 'Logistique',
    production: 'Production',
    quality: 'Qualité',
    integrations: 'Intégrations',
    // Sidebar control
    sidebarControl: 'Contrôle de la barre latérale',
    expanded: 'Étendu',
    collapsed: 'Réduit',
    expandOnHover: 'Étendre au survol',
  },

  fileBrowser: {
    name: 'Nom',
    fileStatus: 'État du fichier',
    checkedOutBy: 'Extrait par',
    version: 'Ver',
    itemNumber: "Numéro d'article",
    description: 'Description',
    revision: 'Rév',
    state: 'État',
    ecoTags: 'ECOs',
    extension: 'Type',
    size: 'Taille',
    modified: 'Modifié',
    noFilesFound: 'Aucun fichier trouvé',
    dropFilesHere: 'Déposez les fichiers ici pour les télécharger',
  },

  autoDiscard: {
    removed: {
      generic_one: '{{count}} fichier supprimé du coffre',
      generic_other: '{{count}} fichiers supprimés du coffre',
      fromFolder_one: '{{count}} fichier supprimé de {{folder}} (retiré du coffre)',
      fromFolder_other: '{{count}} fichiers supprimés de {{folder}} (retirés du coffre)',
    },
    failed: {
      generic_one: 'Impossible de supprimer automatiquement {{count}} fichier orphelin',
      generic_other: 'Impossible de supprimer automatiquement {{count}} fichiers orphelins',
    },
    directoriesRemoved: {
      generic_one: '{{count}} dossier vide laissé a également été supprimé',
      generic_other: '{{count}} dossiers vides laissés ont également été supprimés',
    },
    directoriesTrackedByServer: {
      generic_one:
        '{{count}} dossier est vide ici mais encore répertorié sur le serveur, il a donc été laissé en place',
      generic_other:
        '{{count}} dossiers sont vides ici mais encore répertoriés sur le serveur, ils ont donc été laissés en place',
    },
  },

  fileOps: {
    serverPathUpdateFailed:
      'Certains renommages ne sont pas parvenus au serveur, qui enregistre toujours les anciens chemins. Les fichiers concernés apparaissent comme déplacés ; exécutez reconcile-moved-paths pour les mettre à jour.',
    cloudRenameFailed: 'Impossible de renommer sur le serveur',
    movedAwayBlocked: "Le fichier a été déplacé - résolvez d'abord le déplacement en attente",
    checkIn: 'Archiver',
    checkOut: 'Extraire',
    download: 'Télécharger',
    getLatest: 'Obtenir la dernière version',
    upload: 'Envoyer',
    delete: 'Supprimer',
    rename: 'Renommer',
    move: 'Déplacer',
    copy: 'Copier',
    paste: 'Coller',
    openFile: 'Ouvrir le fichier',
    openFolder: 'Ouvrir le dossier',
    openInExplorer: "Ouvrir dans l'explorateur",
    viewHistory: "Voir l'historique",
    compare: 'Comparer',
    rollback: 'Restaurer',
    discard: 'Annuler les modifications',
    forceRelease: 'Forcer la libération',
  },

  syncError: {
    toast: 'Échec de la synchronisation : {{reason}}',
    toastWithMore: 'Échec de la synchronisation : {{reason}} (+{{count}} autres)',
    failed: 'Échec de la synchronisation',
    unknown: 'Erreur inconnue',
    pathCaseConflict:
      "Un autre fichier occupe déjà ce chemin sur le serveur et n'en diffère que par la casse. Actualisez la liste des fichiers pour le faire apparaître.",
  },

  sync: {
    likelyMoved: {
      title_one: 'Ce fichier se trouve peut-être déjà ailleurs sur le serveur',
      title_other: '{{count}} fichiers se trouvent peut-être déjà ailleurs sur le serveur',
      message_one:
        "Ce fichier a le même nom et la même taille qu'un fichier déjà présent sur le serveur à un autre emplacement. L'envoyer maintenant y créera une nouvelle copie au lieu de déplacer le fichier existant. Si vous avez déplacé ce fichier, utilisez plutôt Déplacer ou Résoudre les déplacements en attente pour conserver son historique.",
      message_other:
        "{{count}} de ces fichiers ont le même nom et la même taille que des fichiers déjà présents sur le serveur à d'autres emplacements. Les envoyer maintenant y créera de nouvelles copies au lieu de déplacer les fichiers existants. Si vous avez déplacé ces fichiers, utilisez plutôt Déplacer ou Résoudre les déplacements en attente pour conserver leur historique.",
      item: '{{path}} \u2192 correspond au fichier existant {{existingPath}}',
      confirmText: 'Envoyer quand même',
      skippedToast_one:
        '1 fichier ignoré car il semblait déplacé - utilisez plutôt Déplacer ou Résoudre les déplacements en attente',
      skippedToast_other:
        '{{count}} fichiers ignorés car ils semblaient déplacés - utilisez plutôt Déplacer ou Résoudre les déplacements en attente',
    },
  },

  status: {
    ready: 'Prêt',
    syncing: 'Synchronisation...',
    uploading: 'Envoi en cours...',
    downloading: 'Téléchargement...',
    processing: 'Traitement...',
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    offline: 'Hors ligne',
    online: 'En ligne',
  },

  fileState: {
    released: 'Publié',
    inWork: 'En cours',
    pending: 'En attente',
    obsolete: 'Obsolète',
    checkedOut: 'Extrait',
    checkedIn: 'Archivé',
  },

  diffStatus: {
    added: 'Ajouté',
    modified: 'Modifié',
    deleted: 'Supprimé',
    outdated: 'Obsolète',
    cloud: 'Cloud',
    cloudNew: 'Nouveau (Cloud)',
    moved: 'Déplacé',
    movedAway: 'Déplacé (ancien)',
    ignored: 'Ignoré',
  },

  fileStatus: {
    deletedFromServer: 'Supprimé du serveur',
    movedTooltip:
      'Ce fichier se trouve ici maintenant, mais le coffre enregistre encore son ancien chemin',
    movedAwayTooltip: 'Le coffre indique encore ce fichier ici, mais il a été déplacé',
    movedAwayTooltipTo: 'Déplacé vers {{path}}',
  },

  explorer: {
    pendingMovesBadgeTitle_one:
      '{{count}} déplacement de fichier en attente — cliquez pour vérifier',
    pendingMovesBadgeTitle_other:
      '{{count}} déplacements de fichiers en attente — cliquez pour vérifier',
    disconnectWarningMoved_one:
      '{{count}} fichier a été déplacé, et le coffre enregistre encore son ancien chemin',
    disconnectWarningMoved_other:
      '{{count}} fichiers ont été déplacés, et le coffre enregistre encore leurs anciens chemins',
    disconnectWarningMovedHint:
      'Mettez à jour le coffre pour correspondre, ou remettez les fichiers à leur place',
  },

  vaultSetup: {
    title: 'Configurer votre coffre',
    subtitle: 'Configurez comment les fichiers sont synchronisés sur votre ordinateur',
    fileCount: '{{count}} fichiers',
    fileCountSingular: '1 fichier',
    totalSize: '{{size}} au total',
    autoDownloadCloudTitle: 'Télécharger automatiquement les fichiers cloud',
    autoDownloadCloudDesc:
      'Télécharger automatiquement les fichiers qui existent sur le serveur mais pas sur votre ordinateur',
    autoDownloadUpdatesTitle: 'Télécharger automatiquement les mises à jour',
    autoDownloadUpdatesDesc:
      'Télécharger automatiquement les versions plus récentes lorsque les fichiers sont mis à jour sur le serveur',
    summary: 'Après connexion, BluePLM téléchargera {{count}} fichiers ({{size}})',
    summaryNoDownload: 'Les fichiers ne seront téléchargés que sur demande',
    connect: 'Connecter le coffre',
    skip: 'Ignorer la configuration',
  },

  solidworksVersion: {
    title: 'Choisissez votre version de SOLIDWORKS',
    subtitle: 'Plusieurs versions sont installées sur cet ordinateur',
    explanation:
      "BluePLM ne peut se connecter qu'à une seule version de SOLIDWORKS à la fois. Choisissez celle que vous utilisez réellement, sinon BluePLM peut indiquer que SOLIDWORKS est indisponible alors qu'il est ouvert.",
    windowsDefault: 'Défaut Windows',
    confirm: 'Utiliser cette version',
    decideLater: 'Décider plus tard',
    settingTitle: 'Version de SOLIDWORKS',
    settingLabel: 'Version à laquelle se connecter',
    settingDescription: 'La version de SOLIDWORKS avec laquelle BluePLM communique',
    settingHint:
      'Ce changement redémarre le service SOLIDWORKS. Choisissez la version dans laquelle vous ouvrez vos fichiers.',
    automatic: 'Automatique',
    automaticDescription: 'Utiliser la version que Windows a enregistrée par défaut',
  },

  reconcileMovedPaths: {
    offline: 'Impossible de réconcilier les chemins déplacés hors ligne',
    notSignedIn: 'Veuillez d’abord vous connecter',
    noOrganization: 'Aucune organisation connectée',
    noVault: 'Aucun coffre connecté',
    nothingToReconcile: 'Aucun fichier n’attend la mise à jour de son chemin serveur',

    reportHeading:
      '{{count}} fichiers ont été déplacés ou renommés sur cet ordinateur alors que le serveur continuait d’enregistrer leurs anciens chemins.',
    reportEligible: 'Le chemin serveur de {{count}} d’entre eux peut être écrit maintenant.',
    reportBlocked: '{{count}} sont extraits par d’autres personnes et ne seront pas écrits :',
    reportHolder: '{{count}} détenus par {{user}}',
    unknownHolder: 'un autre utilisateur',
    reportConflict: '{{count}} ignorés — un autre enregistrement occupe déjà le nouveau chemin :',
    reportUnverified:
      '{{count}} ignorés — le contenu du fichier ne correspond plus à ce que le serveur a enregistré pour lui, le déplacement ne peut donc pas être vérifié :',
    reportItem: '{{from}} → {{to}}',
    reportAndMore: '… et {{count}} de plus',

    dryRunSummary:
      'Contrôle préalable uniquement : {{eligible}} chemins serveur sur {{total}} peuvent être écrits. Rien n’a été écrit.',
    dryRunNote: 'Rapport uniquement. Rien n’est écrit sans --apply.',

    refused:
      'Rien n’a été écrit : {{count}} de ces fichiers sont extraits par d’autres personnes ({{holders}}). Demandez-leur de les archiver puis relancez, ou relancez avec --skip-checked-out pour réconcilier les autres et laisser les leurs intacts.',
    nothingEligible:
      'Rien ne peut être écrit : {{blocked}} sont extraits par d’autres personnes et {{skipped}} ont été ignorés.',
    confirmUnavailable:
      'Rien n’a été écrit : cette commande nécessite une boîte de dialogue de confirmation et aucune n’était disponible.',

    confirmTitle: 'Mettre à jour {{count}} chemins serveur ?',
    confirmMessage:
      'Le chemin serveur de {{count}} fichiers sera mis à jour vers leur emplacement actuel sur le disque. Cela écrit un enregistrement et journalise un déplacement pour chacun, et tous les autres ordinateurs de l’organisation récupéreront les nouveaux chemins à leur prochaine synchronisation.',
    confirmRemainder: '{{count}} autres restent inchangés ({{detail}}).',
    confirmText: 'Mettre à jour {{count}} chemins',
    declined: 'Annulé. Rien n’a été écrit.',

    progress: 'Mise à jour de {{count}} chemins serveur…',
    failureItem: '{{path}} : {{error}}',
    unknownError: 'Erreur inconnue',

    summaryComplete: '{{count}} chemins serveur réconciliés.',
    summaryPartial:
      '{{succeeded}} chemins serveur sur {{total}} réconciliés — {{leftovers}}. Relancez la commande pour terminer.',
    summaryFailed: '{{count}} en échec',
    summaryNotAttempted: '{{count}} non tentés',
    summaryBlocked: '{{count}} extraits par d’autres',
    summarySkipped: '{{count}} ignorés',
  },

  adoptServerPaths: {
    notSignedIn: 'Veuillez d’abord vous connecter',
    noVault: 'Aucun coffre connecté',
    nothingToAdopt: 'Aucun fichier n’attend d’être renommé vers le chemin du serveur',

    reportHeading:
      '{{count}} fichiers se trouvent à un chemin local qui ne correspond plus à ce que le serveur enregistre pour eux.',
    reportEligible: '{{count}} peuvent être renommés vers leur chemin serveur maintenant.',
    reportBlocked:
      '{{count}} sont extraits par d’autres personnes et resteront intacts sauf en cas de forçage :',
    reportHolder: '{{count}} détenus par {{user}}',
    unknownHolder: 'un autre utilisateur',
    reportConflict:
      '{{count}} ignorés — un autre fichier occupe déjà la destination sur le disque :',
    reportUnverified:
      '{{count}} ignorés — le contenu du fichier ne correspond plus à ce que le serveur a enregistré pour lui, le déplacement ne peut donc pas être vérifié :',
    reportItem: '{{from}} → {{to}}',
    reportAndMore: '… et {{count}} de plus',

    dryRunSummary:
      'Contrôle préalable uniquement : {{eligible}} fichiers sur {{total}} peuvent être renommés vers leur chemin serveur. Rien n’a été écrit.',
    dryRunNote: 'Rapport uniquement. Rien n’est écrit sans --apply.',

    refused:
      'Rien n’a été renommé : {{count}} de ces fichiers sont extraits par d’autres personnes ({{holders}}). Le renommage n’affecte que votre propre disque et reste sûr dans tous les cas — demandez-leur d’abord, ou relancez avec --force pour les renommer aussi.',
    nothingEligible: 'Rien ne peut être renommé : {{skipped}} ont été ignorés.',
    confirmUnavailable:
      'Rien n’a été renommé : cette commande nécessite une boîte de dialogue de confirmation et aucune n’était disponible.',

    confirmTitle: 'Renommer {{count}} fichiers vers leur chemin serveur ?',
    confirmMessage:
      '{{count}} fichiers sur cet ordinateur seront renommés vers le chemin que le serveur enregistre déjà pour eux. Cela ne change que votre disque local — rien n’est écrit sur le serveur.',
    confirmRemainder: '{{count}} autres restent inchangés ({{detail}}).',
    confirmText: 'Renommer {{count}} fichiers',
    declined: 'Annulé. Rien n’a été renommé.',

    progress: 'Renommage de {{count}} fichiers vers leur chemin serveur…',
    failureItem: '{{path}} : {{error}}',
    unknownError: 'Erreur inconnue',
    destinationAppeared: 'Un autre fichier est apparu à « {{path}} » depuis le contrôle préalable',
    createFolderFailed: 'Impossible de créer le dossier de destination — {{error}}',

    summaryComplete: '{{count}} fichiers renommés vers leur chemin serveur.',
    summaryPartial:
      '{{succeeded}} fichiers sur {{total}} renommés — {{leftovers}}. Relancez la commande pour terminer.',
    summaryFailed: '{{count}} en échec',
    summaryNotAttempted: '{{count}} non tentés',
    summaryBlocked: '{{count}} extraits par d’autres',
    summarySkipped: '{{count}} ignorés',
  },

  terminal: {
    confirmationPending:
      'En attente de confirmation — appuyez sur Entrée pour confirmer, Échap ou Ctrl+C pour annuler.',
    confirmationCancelled: 'Confirmation annulée.',
  },

  resolveMoves: {
    title: 'Résoudre les déplacements en attente',
    subtitle:
      'Certains fichiers se trouvent à un chemin différent de celui enregistré par le coffre. Choisissez quel côté doit l’emporter.',
    noPendingMoves: 'Il n’y a rien à résoudre — aucun déplacement en attente trouvé.',

    scopeLabel: 'Afficher',
    scopeFile: 'Ce fichier',
    scopeFolder: 'Ce dossier',
    scopeVault: 'Tout le coffre',
    vaultWideNote:
      'La résolution traite toujours tous les déplacements en attente du coffre, pas seulement ceux affichés ci-dessus.',

    listHeading_one: '{{count}} déplacement en attente affiché',
    listHeading_other: '{{count}} déplacements en attente affichés',
    noMovesInScope: 'Aucun déplacement en attente dans ce périmètre.',
    moreFiles: '… et {{count}} de plus',

    reconcileOptionTitle:
      'Conserver le nouvel emplacement et mettre à jour le coffre en conséquence',
    reconcileOptionDescription:
      'Écrit le chemin de votre disque sur le serveur. Tous les autres récupèrent le nouvel emplacement à leur prochaine synchronisation.',
    adoptOptionTitle: 'Remettre les fichiers là où le coffre les situe',
    adoptOptionDescription:
      'Renomme les fichiers de votre disque vers le chemin déjà enregistré par le serveur. Rien n’est écrit sur le serveur.',

    eligibleCount_one: '{{count}} fichier prêt',
    eligibleCount_other: '{{count}} fichiers prêts',
    blockedCount_one: '{{count}} fichier extrait par quelqu’un d’autre',
    blockedCount_other: '{{count}} fichiers extraits par d’autres',
    conflictCount_one: '{{count}} fichier ignoré — destination déjà occupée',
    conflictCount_other: '{{count}} fichiers ignorés — destination déjà occupée',
    unverifiedCount_one: '{{count}} fichier ignoré — le contenu ne correspond plus',
    unverifiedCount_other: '{{count}} fichiers ignorés — le contenu ne correspond plus',
    noEligible: 'Il n’y a encore rien à résoudre ici.',
    unknownHolder: 'un autre utilisateur',

    skipCheckedOutLabel_one:
      'Ignorer le fichier extrait par quelqu’un d’autre et mettre à jour le reste',
    skipCheckedOutLabel_other:
      'Ignorer les {{count}} fichiers extraits par d’autres et mettre à jour le reste',
    forceLabel_one: 'Renommer aussi le fichier extrait par quelqu’un d’autre',
    forceLabel_other: 'Renommer aussi les {{count}} fichiers extraits par d’autres',

    runReconcile: 'Mettre à jour le coffre',
    runAdopt: 'Restaurer les fichiers locaux',

    contextMenuItem: 'Résoudre les fichiers déplacés…',
  },

  realign: {
    section: {
      heading: 'Réaligner avec le serveur',
      title: 'Comparer votre coffre au serveur',
      description:
        'Montre ce qui diffère entre votre ordinateur et le serveur, et corrige automatiquement ce qui peut être corrigé sans risque.',
      button: "Vérifier l'alignement",
    },

    dialog: {
      title: 'Réaligner avec le serveur',
      subtitle: 'Compare vos fichiers au serveur et montre les différences avant tout changement.',
      waitingForConfirmation: 'En attente de votre confirmation pour la prochaine modification.',
    },

    runButton: 'Corriger les éléments sélectionnés',
    moreFiles: '…et {{count}} de plus',

    headline: {
      aligned: 'Votre coffre est aligné avec le serveur.',
      notAligned: 'Votre coffre contient des fichiers qui diffèrent du serveur.',
    },

    orientation: {
      local_one: '{{count}} fichier sur votre ordinateur',
      local_other: '{{count}} fichiers sur votre ordinateur',
      server_one: '{{count}} fichier sur le serveur',
      server_other: '{{count}} fichiers sur le serveur',
      inSync_one: '{{count}} fichier synchronisé',
      inSync_other: '{{count}} fichiers synchronisés',
    },

    group: {
      repairable: 'Peut être corrigé maintenant',
      needsDecision: 'Nécessite votre décision',
      needsDecisionNote:
        'Le réalignement ne touchera à aucun de ceux-ci — ils nécessitent votre décision.',
      needsDecisionEmpty: 'Rien ici ne nécessite de décision.',
      informational: 'Pour information',
    },

    syncIndex: {
      label: 'Actualiser aussi le registre interne de synchronisation de BluePLM',
      description: 'Entretien uniquement — cela ne touche à aucun fichier.',
    },

    pendingMove: {
      label_one: '{{count}} fichier déplacé sur le disque mais pas dans le coffre',
      label_other: '{{count}} fichiers déplacés sur le disque mais pas dans le coffre',
      description:
        'Choisissez pour chaque fichier de restaurer le chemin du coffre ou de conserver le chemin de cet ordinateur.',
      keepServer: 'Conserver le chemin serveur',
      keepLocal: 'Conserver le chemin local',
      keepServerAll: 'Conserver le chemin serveur pour tous',
      keepLocalAll: 'Conserver le chemin local pour tous',
      keepLocalNote:
        'Conserver le chemin local écrit l’emplacement de cet ordinateur dans le coffre, de sorte que tout le monde verra le renommage.',
      adoptSummary_one: '{{count}} fichier sera restauré au chemin serveur',
      adoptSummary_other: '{{count}} fichiers seront restaurés au chemin serveur',
      reconcileSummary_one: '{{count}} fichier mettra à jour le coffre',
      reconcileSummary_other: '{{count}} fichiers mettront à jour le coffre',
    },
    orphaned: {
      label_one: "{{count}} fichier que le serveur n'a plus",
      label_other: "{{count}} fichiers que le serveur n'a plus",
      description:
        "Déplace le fichier vers la corbeille. La copie du serveur a déjà disparu, il n'y a donc plus rien à synchroniser.",
    },
    outdated: {
      label_one: '{{count}} fichier avec une version plus récente sur le serveur',
      label_other: '{{count}} fichiers avec une version plus récente sur le serveur',
      description:
        'Télécharge la version actuelle du serveur pour remplacer la copie locale obsolète.',
    },

    localOnly: {
      label_one: "{{count}} fichier qui n'existe que sur votre ordinateur",
      label_other: "{{count}} fichiers qui n'existent que sur votre ordinateur",
      description:
        'Jamais archivé dans le coffre. Le réalignement les laisse exactement tels quels.',
      actionButton: 'Aller les archiver…',
      actionToast:
        'Sélectionnez ces fichiers dans le navigateur de fichiers et archivez-les quand vous êtes prêt.',
    },
    modified: {
      label_one: '{{count}} fichier avec des modifications locales pas encore sur le serveur',
      label_other: '{{count}} fichiers avec des modifications locales pas encore sur le serveur',
      description:
        'Vos modifications sont conservées. Le réalignement ne supprime jamais les modifications locales — archivez-les pour partager la mise à jour.',
      actionButton: 'Aller archiver vos modifications…',
      actionToast:
        'Sélectionnez ces fichiers dans le navigateur de fichiers et archivez vos modifications quand vous êtes prêt.',
    },
    ghost: {
      label_one: '{{count}} fichier extrait par vous mais absent du disque',
      label_other: '{{count}} fichiers extraits par vous mais absents du disque',
      description:
        "Quelque chose a supprimé le fichier après son extraction. Décidez si vous archivez un remplacement ou libérez l'extraction.",
    },

    cloudOnly: {
      label_one: '{{count}} fichier uniquement sur le serveur',
      label_other: '{{count}} fichiers uniquement sur le serveur',
      whyNote:
        "Non téléchargé — le réalignement n'est pas un téléchargement massif. Activez le téléchargement automatique, ou téléchargez les fichiers individuellement, si vous voulez une copie locale.",
    },
    ignored: {
      label_one: "{{count}} fichier correspondant à un motif d'exclusion",
      label_other: "{{count}} fichiers correspondant à un motif d'exclusion",
      whyNote: "Jamais touché par le réalignement, ni par rien d'autre qui synchronise le coffre.",
    },
    blockedCheckout: {
      label_one: '{{count}} fichier bloqué par une extraction',
      label_other: '{{count}} fichiers bloqués par une extraction',
      whyNote: 'Le réalignement laisse intact tout fichier sous extraction active.',
      selfHeld_one: 'Vous avez ce fichier en extraction vous-même.',
      selfHeld_other: 'Vous avez {{count}} de ces fichiers en extraction vous-même.',
      otherHeld_one: "Quelqu'un d'autre a ce fichier en extraction.",
      otherHeld_other: "Quelqu'un d'autre a {{count}} de ces fichiers en extraction.",
    },

    outcome: {
      heading: 'Résultat',
      abortedHeading: "Le réalignement ne s'est pas exécuté.",
      abortNoVault: 'Aucun coffre connecté.',
      abortOffline: 'Vous êtes hors ligne — réessayez une fois de retour en ligne.',
      abortOperationInFlight:
        'Une autre opération de synchronisation est déjà en cours — réessayez une fois terminée.',
      abortCancelled: 'Annulé.',
      abortUnexpectedError:
        "Quelque chose s'est mal passé. Réessayez, et contactez le support si cela persiste.",

      step_resolvePendingMoves: 'Déplacements en attente',
      step_recycleOrphans: 'Fichiers orphelins',
      step_pullOutdated: 'Fichiers obsolètes',
      step_rebuildSyncIndex: 'Index de synchronisation',

      ok_one: '{{count}} fichier corrigé',
      ok_other: '{{count}} fichiers corrigés',
      partial: '{{succeeded}} sur {{attempted}} corrigés — {{failed}} échoués',
      failedResult: "Cette étape n'a pas pu être terminée",
      nothingToDo: 'Rien à faire',
      refused: 'Ignoré par sécurité — réessayez dans un instant',
    },
  },

  hiddenFolders: {
    hideFromNonAdmins: 'Masquer aux non-administrateurs',
    showToEveryone: 'Afficher pour tout le monde',
    notAccessControl:
      "Masque ce dossier dans l'interface pour les non-administrateurs. Ce n'est pas une restriction d'accès, les fichiers restent lisibles.",
    badgeLabel: 'Masqué aux non-administrateurs',
    hidden: 'Dossier masqué aux non-administrateurs',
    unhidden: 'Dossier visible par tout le monde',
    updateFailed: 'Échec de la mise à jour de la visibilité du dossier',
    updateNotPermitted:
      "Vous n'avez peut-être pas l'autorisation de modifier la visibilité du dossier",
    scanSkipped: '{{count}} fichiers ignorés dans des dossiers masqués aux non-administrateurs',
  },
}
