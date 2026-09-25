import type { TranslationDict } from '../types'

// German translations
export const de: TranslationDict = {
  solidworksSettings: {
    previewMode: 'Vorschaumodus',
    embeddedThumbnail: 'Eingebettete Miniaturansicht',
    embeddedThumbnailDescription:
      'Vorschaubild aus der SolidWorks-Datei extrahieren und anzeigen',
    externalEDrawings: 'eDrawings (extern)',
    externalEDrawingsDescription: 'Dateien in der externen eDrawings-Anwendung öffnen',
    embeddedEDrawings: 'eDrawings-3D-Vorschau (Windows, optional)',
    embeddedEDrawingsAvailable:
      'Interaktiver 3D-Viewer in BluePLM. Experimentelle Windows-Funktion.',
    embeddedEDrawingsUnavailable:
      'Erfordert Windows, installiertes eDrawings und das optionale Vorschaumodul.',
    previewStarting: 'Die eingebettete eDrawings-Vorschau wird gestartet…',
    previewStartFailed: 'Die eingebettete eDrawings-Vorschau konnte nicht gestartet werden.',
    previewUnavailable:
      'Die optionale Windows-eDrawings-Vorschau ist auf diesem Computer nicht verfügbar.',
    openInEDrawings: 'In eDrawings öffnen',
  },
  checkoutDisplay: {
    you: 'Du',
    loadingOwner: 'Checkout-Besitzer wird geladen',
    ownerUnavailable: 'Checkout-Besitzer nicht verfügbar',
    checkedOutBy: 'Ausgecheckt von {{name}}',
    checkedOutByOnComputer: 'Ausgecheckt von {{name}} auf {{computer}}',
    anotherComputer: 'einem anderen Computer',
    differentComputer: 'anderer Computer',
    otherComputer: 'anderer PC',
  },
  fileReadonly: {
    blocked: 'Diese Datei ist auf dem Datenträger schreibgeschützt, daher wurde nichts geschrieben.',
    unknown:
      'Es ließ sich nicht feststellen, ob diese Datei schreibgeschützt ist, daher wurde nichts geschrieben.',
    stillCheckedOut: 'Ausgecheckt, aber auf dem Datenträger weiterhin schreibgeschützt: {{names}}',
    madeWritable: '{{count}} Datei(en) waren bereits ausgecheckt und sind jetzt beschreibbar.',
    solidWorksStillReadonly:
      'Ausgecheckt und auf dem Datenträger beschreibbar, aber SolidWorks hat die Datei noch schreibgeschützt geöffnet. In SolidWorks: Bearbeiten → Schreibgeschützt, oder die Datei schließen und erneut öffnen.',
  },
  common: {
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    add: 'Hinzufügen',
    remove: 'Entfernen',
    close: 'Schließen',
    search: 'Suchen',
    loading: 'Wird geladen...',
    error: 'Fehler',
    success: 'Erfolg',
    warning: 'Warnung',
    info: 'Info',
    yes: 'Ja',
    no: 'Nein',
    ok: 'OK',
    confirm: 'Bestätigen',
    back: 'Zurück',
    next: 'Weiter',
    refresh: 'Aktualisieren',
    reset: 'Zurücksetzen',
    apply: 'Anwenden',
    clear: 'Löschen',
    select: 'Auswählen',
    selectAll: 'Alle auswählen',
    none: 'Keine',
    all: 'Alle',
    name: 'Name',
    description: 'Beschreibung',
    type: 'Typ',
    size: 'Größe',
    date: 'Datum',
    status: 'Status',
    actions: 'Aktionen',
    settings: 'Einstellungen',
    preferences: 'Einstellungen',
    help: 'Hilfe',
    about: 'Über',
    version: 'Version',
    file: 'Datei',
    folder: 'Ordner',
    files: 'Dateien',
    folders: 'Ordner',
    open: 'Öffnen',
    connect: 'Verbinden',
    connecting: 'Verbindung wird hergestellt...',
    default: 'Standard',
    or: 'oder',
    optional: 'optional',
  },

  welcome: {
    title: 'BluePLM',
    tagline: 'Open-Source-Produktlebenszyklusmanagement',
    selectAccountType: 'Wählen Sie Ihren Kontotyp',
    teamMember: 'Teammitglied',
    teamMemberDesc: 'Ingenieure, Administratoren und Betrachter',
    supplier: 'Lieferant',
    supplierDesc: 'Zugang zum Lieferantenportal',
    workOffline: 'Offline arbeiten',
    offlineMode: 'Offline-Modus',

    teamSignIn: 'Teammitglied-Anmeldung',
    signInWithOrg: 'Melden Sie sich mit Ihrem Organisationskonto an',
    signInWithGoogle: 'Mit Google anmelden',
    tryAgain: 'Erneut versuchen',
    connecting: 'Verbindung wird hergestellt...',
    roleSetByOrg:
      'Ihre Rolle (Admin, Ingenieur, Betrachter) wird von Ihrer Organisation festgelegt',

    supplierPortal: 'Lieferantenportal',
    createAccount: 'Erstellen Sie Ihr Lieferantenkonto',
    signInToAccount: 'Bei Ihrem Konto anmelden',
    email: 'E-Mail',
    password: 'Passwort',
    confirmPassword: 'Passwort bestätigen',
    passwordMismatch: 'Passwörter stimmen nicht überein',
    phone: 'Telefon',
    phoneNumber: 'Telefonnummer',
    fullName: 'Vollständiger Name',
    createAccountBtn: 'Konto erstellen',
    signIn: 'Anmelden',
    alreadyHaveAccount: 'Haben Sie bereits ein Konto? Anmelden',
    noAccount: 'Kein Konto? Erstellen Sie eins',
    useEmailPassword: 'E-Mail und Passwort verwenden',
    useGoogleInstead: 'Oder mit Google anmelden',
    sendVerificationCode: 'Bestätigungscode senden',
    verificationCode: 'Bestätigungscode',
    verifyAndSignIn: 'Bestätigen und anmelden',
    useDifferentNumber: 'Andere Nummer verwenden',
    verificationSent: 'Ein Bestätigungscode wurde gesendet an',
    includeCountryCode: 'Landesvorwahl angeben (z.B. +49 für Deutschland, +1 für USA)',
    supplierInviteNote:
      'Lieferanten werden von Organisationen eingeladen. Kontaktieren Sie Ihren Einkäufer, wenn Sie Zugang benötigen.',

    connectingToOrg: 'Verbindung zu Ihrer Organisation wird hergestellt...',
    organizationVaults: 'Organisations-Tresore',
    noVaultsCreated: 'Keine Tresore erstellt',
    noVaultsAdminMsg:
      'Erstellen Sie einen Tresor unter Einstellungen → Organisation, um zu beginnen.',
    noVaultsUserMsg: 'Bitten Sie einen Organisationsadministrator, einen Tresor zu erstellen.',
    advancedOptions: 'Oder verwenden Sie die erweiterten Optionen unten für manuelle Verbindung.',
    localVault: 'Lokaler Tresor',

    madeWith: 'Mit 💙 von Blue Robotics erstellt',
  },

  setup: {
    welcome: 'Willkommen bei BluePLM',
    connectToBackend:
      'Verbinden Sie sich mit dem Supabase-Backend Ihrer Organisation, um zu beginnen',
    imAdmin: 'Ich bin Organisationsadministrator',
    imAdminDesc:
      'Richten Sie BluePLM mit den Supabase-Anmeldedaten Ihrer Organisation ein. Sie erhalten einen Code zum Teilen mit Ihrem Team.',
    haveCode: 'Ich habe einen Organisationscode',
    haveCodeDesc:
      'Geben Sie den Code ein, den Sie von Ihrem Organisationsadministrator erhalten haben.',
    needHelp: 'Hilfe bei der Einrichtung von Supabase benötigt?',

    adminSetup: 'Admin-Einrichtung',
    enterCredentials:
      'Geben Sie Ihre Supabase-Anmeldedaten aus den API-Einstellungen Ihres Projekts ein',
    projectId: 'Projekt-ID',
    projectIdHelp: 'Zu finden oben in Ihrem Supabase Dashboard (z.B. vvyhpdzqdizvorrhjhvq)',
    anonKey: 'Anonymer (öffentlicher) Schlüssel',
    orgSlug: 'Organisations-Slug',
    orgSlugHelp: 'Dies hilft, Ihre Organisation im generierten Code zu identifizieren',
    connectToSupabase: 'Mit Supabase verbinden',
    findInDashboard:
      'Finden Sie diese Werte in Ihrem Supabase Dashboard → Projekteinstellungen → API',

    connectedSuccess: 'Erfolgreich verbunden!',
    shareCode: 'Teilen Sie diesen Code mit Ihren Teammitgliedern, damit sie sich verbinden können',
    organizationCode: 'Organisationscode',
    keepCodeSecure:
      'Teammitglieder können diesen Code einfügen, wenn sie BluePLM zum ersten Mal öffnen. Bewahren Sie diesen Code sicher auf - er enthält Ihre Supabase-Anmeldedaten.',
    continueToBluePLM: 'Weiter zu BluePLM',

    joinOrg: 'Ihrer Organisation beitreten',
    enterCode:
      'Geben Sie den Code ein, den Sie von Ihrem Organisationsadministrator erhalten haben',

    enterBothFields: 'Bitte geben Sie sowohl die Projekt-ID als auch den anonymen Schlüssel ein',
    invalidProjectId: 'Bitte geben Sie eine gültige Projekt-ID ein (nur Buchstaben und Zahlen)',
    failedToConnect: 'Verbindung zu Supabase fehlgeschlagen',
    enterOrgCode: 'Bitte geben Sie den Organisationscode ein',
    invalidCode: 'Ungültiger Organisationscode. Bitte überprüfen und erneut versuchen.',
    failedWithCode: 'Verbindung zu Supabase mit dem angegebenen Code fehlgeschlagen',
  },

  source: {
    configTree: {
      drawings: 'Zeichnungen',
      ebom: 'eBOM',
      noDrawings: 'Keine Zeichnungen verweisen auf diese Konfiguration',
      noComponents: 'Keine Komponenten in dieser Konfiguration',
      expand: 'Erweitern',
      collapse: 'Einklappen',
    },
    configEdit: {
      checkOutToEdit: 'Datei zum Bearbeiten auschecken',
    },
    configCommit: {
      write: 'In Datei schreiben',
      writeAndSync: 'Schreiben und Zeichnungen aktualisieren',
      writeAndSyncCount: 'Schreiben und Zeichnungen für {{count}} Konfigurationen aktualisieren',
      pending: 'Noch nicht in das Dokument geschrieben',
      swOffline: 'Starten Sie den SolidWorks-Dienst, um Konfigurationsmetadaten zu schreiben',
      summary:
        'Konfigurationen geschrieben: {{configurations}}; Zeichnungen aktualisiert: {{updated}}, übersprungen: {{skipped}}, fehlgeschlagen: {{failed}}',
    },
    configDrawings: {
      dialogTitle: 'Zeichnungen referenzieren diese Konfiguration',
      dialogBody:
        'Einige referenzierte Zeichnungen sind nicht von Ihnen ausgecheckt. Sie müssen ausgecheckt sein, damit sie die Aktualisierung erhalten.',
      checkOutAndUpdate: 'Auschecken und aktualisieren',
      forceModelOnly: 'Nur Modell schreiben',
      heldBy: 'Gehalten von {{name}}',
      blocked: 'Von anderen gehalten',
      notInVault: 'Nicht in diesem Tresor',
      ready: 'Bereit zur Aktualisierung',
      available: 'Zum Auschecken verfügbar',
      modelOnlyWarning:
        'Nur das Modell zu schreiben lässt Zeichnungen, die nicht von Ihnen ausgecheckt sind, unverändert.',
    },
  },

  settings: {
    title: 'Einstellungen',
    preferences: 'Einstellungen',
    account: 'Konto',
    vault: 'Tresor',
    organization: 'Organisation',
    integrations: 'Integrationen',
    solidworks: 'SolidWorks',
    backup: 'Sicherung',
    api: 'API',
    logs: 'Protokolle',
    about: 'Über',
  },

  preferences: {
    title: 'Einstellungen',
    applicationUpdates: 'Anwendungsaktualisierungen',
    checkForUpdates: 'Nach Updates suchen',
    checking: 'Überprüfung...',
    upToDate: 'Aktuell',
    available: 'Verfügbar',
    youHaveLatest: 'Sie haben die neueste Version',
    updateAvailable: 'Update verfügbar! Überprüfen Sie die Benachrichtigung.',
    couldNotCheck: 'Konnte nicht nach Updates suchen',
    checkForNewVersions: 'Nach neuen Versionen suchen',

    appearance: 'Erscheinungsbild',
    themeDark: 'Dunkel',
    themeDarkDesc: 'VS Code Dark+ Stil',
    themeDeepBlue: 'Tiefblau',
    themeDeepBlueDesc: 'Ozeanblau-Thema',
    themeLight: 'Hell',
    themeLightDesc: 'VS Code Light+ Stil',
    themeChristmas: '🎄 Weihnachten',
    themeChristmasDesc: 'Festlich mit Schnee, Schlitten & Glocken!',
    themeHalloween: '🎃 Halloween',
    themeHalloweenDesc: 'Gruselig mit Lagerfeuerfunken, Geistern & Kürbissen!',
    themeKenneth: '👑 Kenneth',
    themeKennethDesc: 'Königliche lila Eleganz',
    themeWeather: '🌤️ Lokales Wetter',
    themeWeatherDesc: 'Dynamisches Thema, das sich an Ihr lokales Wetter anpasst!',
    themeSystem: 'System',
    themeSystemDesc: 'Systemeinstellung folgen',
    autoSeasonalThemes: 'Saisonale Themen automatisch anwenden',
    autoSeasonalThemesDesc: 'Automatisch zu Halloween (1. Okt.) und Weihnachten (1. Dez.) wechseln',

    language: 'Sprache',
    displayLanguage: 'Anzeigesprache',
    chooseLanguage: 'Wählen Sie die Sprache der Benutzeroberfläche',
    translationsNote:
      'Hinweis: Einige Übersetzungen können unvollständig sein. Neustart erforderlich.',

    fileExtensions: 'Dateierweiterungen',
    lowercaseExtensions: 'Erweiterungen beim Hochladen kleinschreiben',
    lowercaseExtensionsDesc: '.SLDPRT zu .sldprt beim Einchecken konvertieren',

    ignorePatterns: 'Ignorierte Muster (nur lokal behalten)',
    ignorePatternsDesc:
      'Dateien, die diesen Mustern entsprechen, bleiben lokal und werden nicht synchronisiert.',
    ignorePlaceholder: 'z.B. *.tmp, .git/*, thumbs.db',
    connectVaultForPatterns: 'Verbinden Sie sich mit einem Tresor, um Ignoriermuster zu verwalten.',
    noIgnorePatterns: 'Keine Ignoriermuster konfiguriert',

    syncSettings: 'Synchronisierungseinstellungen',
    autoDownloadCloudFiles: 'Cloud-Dateien automatisch herunterladen',
    autoDownloadCloudFilesDesc:
      'Dateien automatisch herunterladen, die auf dem Server, aber nicht lokal existieren',
    autoDownloadUpdates: 'Datei-Updates automatisch herunterladen',
    autoDownloadUpdatesDesc: 'Automatisch herunterladen, wenn der Server neuere Versionen hat',
    excludedFiles: 'Ausgeschlossene Dateien',
    excludedFilesDesc:
      '{{count}} Datei(en) vom automatischen Download ausgeschlossen (manuell entfernt)',
    clearExcludedFiles: 'Liste löschen',
    autoDiscardOrphanedFiles: 'Verwaiste Dateien automatisch verwerfen',
    autoDiscardOrphanedFilesDesc:
      'Lokale Dateien automatisch entfernen, die auf dem Server nicht mehr existieren',
    discardOrphaned: 'Verwaiste verwerfen',
    discardOrphanedCount: 'Verwaiste verwerfen ({{count}} Datei{{plural}})',
    orphanedFilesDescription:
      'Diese Dateien wurden zuvor synchronisiert, wurden aber von einem anderen Benutzer vom Server gelöscht',
  },

  sidebar: {
    // Source Files
    explorer: 'Explorer',
    pending: 'Ausstehend',
    history: 'Verlauf',
    workflows: 'Datei-Workflows',
    trash: 'Papierkorb',
    // Products
    products: 'Produkt-Explorer',
    items: 'Artikelbrowser',
    // Change Control
    ecr: 'ECRs / Probleme',
    eco: 'ECOs',
    notifications: 'Benachrichtigungen',
    deviations: 'Abweichungen',
    releaseSchedule: 'Freigabeplan',
    process: 'Prozess-Editor',
    // Supply Chain - Suppliers
    supplierDatabase: 'Lieferantendatenbank',
    supplierPortal: 'Lieferantenportal',
    // Customers
    customers: 'Kunden',
    // Integrations
    googleDrive: 'Google Drive',
    // System
    terminal: 'Terminal',
    settings: 'Einstellungen',
    // Section Headers
    sourceFiles: 'Quelldateien',
    itemsSection: 'Artikel',
    changeControl: 'Änderungskontrolle',
    supplyChain: 'Lieferkette',
    suppliers: 'Lieferanten',
    purchasing: 'Einkauf',
    logistics: 'Logistik',
    production: 'Produktion',
    quality: 'Qualität',
    integrations: 'Integrationen',
    // Sidebar control
    sidebarControl: 'Seitenleistensteuerung',
    expanded: 'Erweitert',
    collapsed: 'Eingeklappt',
    expandOnHover: 'Bei Hover erweitern',
  },

  fileBrowser: {
    name: 'Name',
    fileStatus: 'Dateistatus',
    checkedOutBy: 'Ausgecheckt von',
    version: 'Ver',
    itemNumber: 'Artikelnummer',
    description: 'Beschreibung',
    revision: 'Rev',
    state: 'Status',
    ecoTags: 'ECOs',
    extension: 'Typ',
    size: 'Größe',
    modified: 'Geändert',
    noFilesFound: 'Keine Dateien gefunden',
    dropFilesHere: 'Dateien hier ablegen zum Hochladen',
  },

  autoDiscard: {
    removed: {
      generic_one: '{{count}} Datei entfernt (aus dem Tresor gelöscht)',
      generic_other: '{{count}} Dateien entfernt (aus dem Tresor gelöscht)',
      fromFolder_one: '{{count}} Datei aus {{folder}} entfernt (aus dem Tresor gelöscht)',
      fromFolder_other: '{{count}} Dateien aus {{folder}} entfernt (aus dem Tresor gelöscht)',
    },
    failed: {
      generic_one: 'Automatisches Verwerfen für {{count}} verwaiste Datei fehlgeschlagen',
      generic_other: 'Automatisches Verwerfen für {{count}} verwaiste Dateien fehlgeschlagen',
    },
    directoriesRemoved: {
      generic_one: 'Außerdem {{count}} leeren, zurückgebliebenen Ordner entfernt',
      generic_other: 'Außerdem {{count}} leere, zurückgebliebene Ordner entfernt',
    },
    directoriesTrackedByServer: {
      generic_one:
        '{{count}} Ordner ist hier leer, wird aber noch auf dem Server geführt, daher belassen',
      generic_other:
        '{{count}} Ordner sind hier leer, werden aber noch auf dem Server geführt, daher belassen',
    },
  },

  fileOps: {
    serverPathUpdateFailed:
      'Einige Umbenennungen haben den Server nicht erreicht, der weiterhin die alten Pfade speichert. Betroffene Dateien werden als verschoben angezeigt; führen Sie reconcile-moved-paths aus, um sie zu aktualisieren.',
    cloudRenameFailed: 'Umbenennen auf dem Server nicht möglich',
    movedAwayBlocked: 'Datei wurde verschoben - zuerst die ausstehende Verschiebung auflösen',
    checkIn: 'Einchecken',
    checkOut: 'Auschecken',
    download: 'Herunterladen',
    getLatest: 'Neueste Version abrufen',
    upload: 'Hochladen',
    delete: 'Löschen',
    rename: 'Umbenennen',
    move: 'Verschieben',
    copy: 'Kopieren',
    paste: 'Einfügen',
    openFile: 'Datei öffnen',
    openFolder: 'Ordner öffnen',
    openInExplorer: 'Im Explorer öffnen',
    viewHistory: 'Verlauf anzeigen',
    compare: 'Vergleichen',
    rollback: 'Zurücksetzen',
    discard: 'Änderungen verwerfen',
    forceRelease: 'Freigabe erzwingen',
  },

  syncError: {
    toast: 'Synchronisierung fehlgeschlagen: {{reason}}',
    toastWithMore: 'Synchronisierung fehlgeschlagen: {{reason}} (+{{count}} weitere)',
    failed: 'Synchronisierung fehlgeschlagen',
    unknown: 'Unbekannter Fehler',
    pathCaseConflict:
      'Eine andere Datei belegt auf dem Server bereits diesen Pfad und unterscheidet sich nur in der Groß- und Kleinschreibung. Aktualisiere die Dateiliste, um sie anzuzeigen.',
  },

  sync: {
    likelyMoved: {
      title_one: 'Diese Datei könnte bereits woanders auf dem Server liegen',
      title_other: '{{count}} Dateien könnten bereits woanders auf dem Server liegen',
      message_one:
        'Diese Datei hat denselben Namen und dieselbe Größe wie eine Datei, die bereits unter einem anderen Pfad auf dem Server liegt. Ein Hochladen erstellt dort eine neue Kopie, statt die vorhandene zu verschieben. Falls du diese Datei verschoben hast, nutze stattdessen Verschieben oder Ausstehende Verschiebungen auflösen, damit der Verlauf erhalten bleibt.',
      message_other:
        '{{count}} dieser Dateien haben denselben Namen und dieselbe Größe wie Dateien, die bereits unter anderen Pfaden auf dem Server liegen. Ein Hochladen erstellt dort neue Kopien, statt die vorhandenen zu verschieben. Falls du diese Dateien verschoben hast, nutze stattdessen Verschieben oder Ausstehende Verschiebungen auflösen, damit der Verlauf erhalten bleibt.',
      item: '{{path}} \u2192 entspricht vorhandener Serverdatei unter {{existingPath}}',
      confirmText: 'Trotzdem hochladen',
      skippedToast_one:
        '1 Datei übersprungen, die wie eine Verschiebung aussah - nutze stattdessen Verschieben oder Ausstehende Verschiebungen auflösen',
      skippedToast_other:
        '{{count}} Dateien übersprungen, die wie eine Verschiebung aussahen - nutze stattdessen Verschieben oder Ausstehende Verschiebungen auflösen',
    },
  },

  status: {
    ready: 'Bereit',
    syncing: 'Synchronisierung...',
    uploading: 'Hochladen...',
    downloading: 'Herunterladen...',
    processing: 'Verarbeitung...',
    connected: 'Verbunden',
    disconnected: 'Getrennt',
    offline: 'Offline',
    online: 'Online',
  },

  fileState: {
    released: 'Freigegeben',
    inWork: 'In Arbeit',
    pending: 'Ausstehend',
    obsolete: 'Veraltet',
    checkedOut: 'Ausgecheckt',
    checkedIn: 'Eingecheckt',
  },

  diffStatus: {
    added: 'Hinzugefügt',
    modified: 'Geändert',
    deleted: 'Gelöscht',
    outdated: 'Veraltet',
    cloud: 'Cloud',
    cloudNew: 'Neu (Cloud)',
    moved: 'Verschoben',
    movedAway: 'Verschoben (alt)',
    ignored: 'Ignoriert',
  },

  fileStatus: {
    deletedFromServer: 'Vom Server gelöscht',
    movedTooltip:
      'Diese Datei befindet sich jetzt hier, aber der Tresor verzeichnet noch den alten Pfad',
    movedAwayTooltip: 'Der Tresor listet diese Datei noch hier, aber sie wurde verschoben',
    movedAwayTooltipTo: 'Verschoben nach {{path}}',
  },

  explorer: {
    pendingMovesBadgeTitle_one: '{{count}} ausstehende Dateiverschiebung — zum Überprüfen klicken',
    pendingMovesBadgeTitle_other:
      '{{count}} ausstehende Dateiverschiebungen — zum Überprüfen klicken',
    disconnectWarningMoved_one:
      '{{count}} Datei wurde verschoben, der Tresor verzeichnet noch den alten Pfad',
    disconnectWarningMoved_other:
      '{{count}} Dateien wurden verschoben, der Tresor verzeichnet noch die alten Pfade',
    disconnectWarningMovedHint: 'Tresor aktualisieren oder Dateien zurückverschieben',
  },

  vaultSetup: {
    title: 'Tresor einrichten',
    subtitle: 'Konfigurieren Sie, wie Dateien auf Ihren Computer synchronisiert werden',
    fileCount: '{{count}} Dateien',
    fileCountSingular: '1 Datei',
    totalSize: '{{size}} gesamt',
    autoDownloadCloudTitle: 'Cloud-Dateien automatisch herunterladen',
    autoDownloadCloudDesc:
      'Dateien automatisch herunterladen, die auf dem Server, aber nicht auf Ihrem Computer existieren',
    autoDownloadUpdatesTitle: 'Datei-Updates automatisch herunterladen',
    autoDownloadUpdatesDesc:
      'Automatisch neuere Versionen herunterladen, wenn Dateien auf dem Server aktualisiert werden',
    summary: 'Nach dem Verbinden wird BluePLM {{count}} Dateien ({{size}}) herunterladen',
    summaryNoDownload: 'Dateien werden nur auf Anfrage heruntergeladen',
    connect: 'Tresor verbinden',
    skip: 'Einrichtung überspringen',
  },

  solidworksVersion: {
    title: 'Wählen Sie Ihre SOLIDWORKS-Version',
    subtitle: 'Auf diesem Computer sind mehrere Versionen installiert',
    explanation:
      'BluePLM kann sich immer nur mit einer SOLIDWORKS-Version verbinden. Wählen Sie die Version, mit der Sie tatsächlich arbeiten - sonst meldet BluePLM möglicherweise, dass SOLIDWORKS nicht verfügbar ist, obwohl es geöffnet ist.',
    windowsDefault: 'Windows-Standard',
    confirm: 'Diese Version verwenden',
    decideLater: 'Später entscheiden',
    settingTitle: 'SOLIDWORKS-Version',
    settingLabel: 'Zu verbindende Version',
    settingDescription: 'Mit welcher SOLIDWORKS-Version BluePLM kommuniziert',
    settingHint:
      'Diese Änderung startet den SOLIDWORKS-Dienst neu. Wählen Sie die Version, in der Sie Ihre Dateien öffnen.',
    automatic: 'Automatisch',
    automaticDescription: 'Die von Windows als Standard registrierte Version verwenden',
  },

  reconcileMovedPaths: {
    offline: 'Verschobene Pfade können offline nicht abgeglichen werden',
    notSignedIn: 'Bitte zuerst anmelden',
    noOrganization: 'Keine Organisation verbunden',
    noVault: 'Kein Tresor verbunden',
    nothingToReconcile: 'Keine Datei wartet auf eine Aktualisierung ihres Serverpfads',

    reportHeading:
      '{{count}} Dateien wurden auf diesem Computer verschoben oder umbenannt, während der Server weiterhin die alten Pfade führte.',
    reportEligible: 'Bei {{count}} kann der Serverpfad jetzt geschrieben werden.',
    reportBlocked: '{{count}} sind von anderen Personen ausgecheckt und werden nicht geschrieben:',
    reportHolder: '{{count}} gehalten von {{user}}',
    unknownHolder: 'einem anderen Benutzer',
    reportConflict: '{{count}} übersprungen — ein anderer Dateieintrag belegt den neuen Pfad:',
    reportUnverified:
      '{{count}} übersprungen — der Inhalt der Datei stimmt nicht mehr mit dem überein, was der Server für sie aufgezeichnet hat; das Verschieben kann nicht überprüft werden:',
    reportItem: '{{from}} → {{to}}',
    reportAndMore: '… und {{count}} weitere',

    dryRunSummary:
      'Nur Vorprüfung: {{eligible}} von {{total}} Serverpfaden können geschrieben werden. Es wurde nichts geschrieben.',
    dryRunNote: 'Nur Bericht. Ohne --apply wird nichts geschrieben.',

    refused:
      'Es wurde nichts geschrieben: {{count}} dieser Dateien sind von anderen Personen ausgecheckt ({{holders}}). Bitten Sie sie einzuchecken und starten Sie erneut, oder verwenden Sie --skip-checked-out, um die übrigen abzugleichen und ihre unberührt zu lassen.',
    nothingEligible:
      'Es kann nichts geschrieben werden: {{blocked}} sind von anderen Personen ausgecheckt und {{skipped}} wurden übersprungen.',
    confirmUnavailable:
      'Es wurde nichts geschrieben: dieser Befehl benötigt einen Bestätigungsdialog, und es war keiner verfügbar.',

    confirmTitle: '{{count}} Serverpfade aktualisieren?',
    confirmMessage:
      'Bei {{count}} Dateien wird der Serverpfad auf den aktuellen Speicherort auf der Festplatte aktualisiert. Dabei wird je Datei ein Eintrag geschrieben und ein Verschieben protokolliert; alle anderen Computer der Organisation übernehmen die neuen Pfade bei der nächsten Synchronisierung.',
    confirmRemainder: '{{count}} weitere bleiben unverändert ({{detail}}).',
    confirmText: '{{count}} Pfade aktualisieren',
    declined: 'Abgebrochen. Es wurde nichts geschrieben.',

    progress: '{{count}} Serverpfade werden aktualisiert…',
    failureItem: '{{path}}: {{error}}',
    unknownError: 'Unbekannter Fehler',

    summaryComplete: '{{count}} Serverpfade abgeglichen.',
    summaryPartial:
      '{{succeeded}} von {{total}} Serverpfaden abgeglichen — {{leftovers}}. Führen Sie den Befehl erneut aus, um ihn abzuschließen.',
    summaryFailed: '{{count}} fehlgeschlagen',
    summaryNotAttempted: '{{count}} nicht versucht',
    summaryBlocked: '{{count}} von anderen ausgecheckt',
    summarySkipped: '{{count}} übersprungen',
  },

  adoptServerPaths: {
    notSignedIn: 'Bitte zuerst anmelden',
    noVault: 'Kein Tresor verbunden',
    nothingToAdopt: 'Keine Datei wartet darauf, auf den vom Server erfassten Pfad zurückbenannt zu werden',

    reportHeading:
      '{{count}} Dateien befinden sich an einem lokalen Pfad, der nicht mehr dem entspricht, was der Server für sie erfasst.',
    reportEligible: '{{count}} können jetzt auf ihren Serverpfad zurückbenannt werden.',
    reportBlocked:
      '{{count}} sind von anderen Personen ausgecheckt und werden unverändert gelassen, sofern nicht erzwungen:',
    reportHolder: '{{count}} gehalten von {{user}}',
    unknownHolder: 'einem anderen Benutzer',
    reportConflict: '{{count}} übersprungen — am Zielort liegt bereits eine andere Datei auf der Festplatte:',
    reportUnverified:
      '{{count}} übersprungen — der Inhalt der Datei stimmt nicht mehr mit dem überein, was der Server für sie aufgezeichnet hat; das Verschieben kann nicht überprüft werden:',
    reportItem: '{{from}} → {{to}}',
    reportAndMore: '… und {{count}} weitere',

    dryRunSummary:
      'Nur Vorprüfung: {{eligible}} von {{total}} Dateien können auf ihren Serverpfad zurückbenannt werden. Es wurde nichts geschrieben.',
    dryRunNote: 'Nur Bericht. Ohne --apply wird nichts geschrieben.',

    refused:
      'Es wurde nichts umbenannt: {{count}} dieser Dateien sind von anderen Personen ausgecheckt ({{holders}}). Die Umbenennung betrifft nur Ihre eigene Festplatte und ist ohnehin sicher — fragen Sie sie zuerst, oder starten Sie erneut mit --force, um auch diese umzubenennen.',
    nothingEligible: 'Es kann nichts umbenannt werden: {{skipped}} wurden übersprungen.',
    confirmUnavailable:
      'Es wurde nichts umbenannt: dieser Befehl benötigt einen Bestätigungsdialog, und es war keiner verfügbar.',

    confirmTitle: '{{count}} Dateien auf ihren Serverpfad zurückbenennen?',
    confirmMessage:
      '{{count}} Dateien auf diesem Computer werden auf den Pfad zurückbenannt, den der Server bereits für sie erfasst. Dies ändert nur Ihre lokale Festplatte — es wird nichts auf den Server geschrieben.',
    confirmRemainder: '{{count}} weitere bleiben unverändert ({{detail}}).',
    confirmText: '{{count}} Dateien umbenennen',
    declined: 'Abgebrochen. Es wurde nichts umbenannt.',

    progress: '{{count}} Dateien werden auf ihren Serverpfad zurückbenannt…',
    failureItem: '{{path}}: {{error}}',
    unknownError: 'Unbekannter Fehler',
    destinationAppeared: 'Seit der Vorprüfung ist eine andere Datei unter „{{path}}“ erschienen',
    createFolderFailed: 'Zielordner konnte nicht erstellt werden — {{error}}',

    summaryComplete: '{{count}} Dateien auf ihren Serverpfad zurückbenannt.',
    summaryPartial:
      '{{succeeded}} von {{total}} Dateien umbenannt — {{leftovers}}. Führen Sie den Befehl erneut aus, um ihn abzuschließen.',
    summaryFailed: '{{count}} fehlgeschlagen',
    summaryNotAttempted: '{{count}} nicht versucht',
    summaryBlocked: '{{count}} von anderen ausgecheckt',
    summarySkipped: '{{count}} übersprungen',
  },

  terminal: {
    confirmationPending:
      'Warten auf Bestätigung — Enter zum Bestätigen, Esc oder Strg+C zum Abbrechen.',
    confirmationCancelled: 'Bestätigung abgebrochen.',
  },

  resolveMoves: {
    title: 'Ausstehende Verschiebungen lösen',
    subtitle:
      'Einige Dateien liegen an einem anderen Pfad, als der Tresor erfasst. Wählen Sie, welche Seite gewinnen soll.',
    noPendingMoves: 'Es gibt nichts zu lösen — keine ausstehenden Verschiebungen gefunden.',

    scopeLabel: 'Anzeigen',
    scopeFile: 'Diese Datei',
    scopeFolder: 'Dieser Ordner',
    scopeVault: 'Gesamter Tresor',
    vaultWideNote:
      'Das Lösen verarbeitet immer alle ausstehenden Verschiebungen im Tresor, nicht nur die oben angezeigten.',

    listHeading_one: '{{count}} ausstehende Verschiebung angezeigt',
    listHeading_other: '{{count}} ausstehende Verschiebungen angezeigt',
    noMovesInScope: 'Keine ausstehenden Verschiebungen in diesem Bereich.',
    moreFiles: '… und {{count}} weitere',

    reconcileOptionTitle: 'Neuen Ort beibehalten und den Tresor entsprechend aktualisieren',
    reconcileOptionDescription:
      'Schreibt den Pfad auf Ihrer Festplatte auf den Server. Alle anderen übernehmen den neuen Ort bei der nächsten Synchronisierung.',
    adoptOptionTitle: 'Dateien dorthin zurücklegen, wo der Tresor sie erfasst',
    adoptOptionDescription:
      'Benennt die Dateien auf Ihrer Festplatte auf den Pfad zurück, den der Server bereits erfasst. Es wird nichts auf den Server geschrieben.',

    eligibleCount_one: '{{count}} Datei bereit',
    eligibleCount_other: '{{count}} Dateien bereit',
    blockedCount_one: '{{count}} Datei von jemand anderem ausgecheckt',
    blockedCount_other: '{{count}} Dateien von anderen ausgecheckt',
    conflictCount_one: '{{count}} Datei übersprungen — Ziel bereits belegt',
    conflictCount_other: '{{count}} Dateien übersprungen — Ziel bereits belegt',
    unverifiedCount_one: '{{count}} Datei übersprungen — Inhalt stimmt nicht mehr überein',
    unverifiedCount_other: '{{count}} Dateien übersprungen — Inhalt stimmt nicht mehr überein',
    noEligible: 'Hier kann noch nichts gelöst werden.',
    unknownHolder: 'einem anderen Benutzer',

    skipCheckedOutLabel_one:
      'Die von jemand anderem ausgecheckte Datei überspringen und den Rest aktualisieren',
    skipCheckedOutLabel_other:
      'Die {{count}} von anderen ausgecheckten Dateien überspringen und den Rest aktualisieren',
    forceLabel_one: 'Auch die von jemand anderem ausgecheckte Datei umbenennen',
    forceLabel_other: 'Auch die {{count}} von anderen ausgecheckten Dateien umbenennen',

    runReconcile: 'Tresor aktualisieren',
    runAdopt: 'Lokale Dateien wiederherstellen',

    contextMenuItem: 'Verschobene Dateien lösen…',
  },

  realign: {
    section: {
      heading: 'Mit Server abgleichen',
      title: 'Ihren Tresor mit dem Server vergleichen',
      description:
        'Zeigt Unterschiede zwischen Ihrem Computer und dem Server und behebt automatisch, was sicher behoben werden kann.',
      button: 'Abgleich prüfen',
    },

    dialog: {
      title: 'Mit Server abgleichen',
      subtitle:
        'Vergleicht Ihre Dateien mit dem Server und zeigt Unterschiede, bevor sich etwas ändert.',
      waitingForConfirmation: 'Warten auf Ihre Bestätigung der nächsten Änderung.',
    },

    runButton: 'Ausgewählte Elemente korrigieren',
    moreFiles: '…und {{count}} weitere',

    headline: {
      aligned: 'Ihr Tresor ist mit dem Server abgeglichen.',
      notAligned: 'Ihr Tresor enthält Dateien, die vom Server abweichen.',
    },

    orientation: {
      local_one: '{{count}} Datei auf Ihrem Computer',
      local_other: '{{count}} Dateien auf Ihrem Computer',
      server_one: '{{count}} Datei auf dem Server',
      server_other: '{{count}} Dateien auf dem Server',
      inSync_one: '{{count}} Datei synchron',
      inSync_other: '{{count}} Dateien synchron',
    },

    group: {
      repairable: 'Kann jetzt behoben werden',
      needsDecision: 'Erfordert Ihre Entscheidung',
      needsDecisionNote:
        'Der Abgleich fasst keine dieser Dateien an — sie erfordern Ihre Entscheidung.',
      needsDecisionEmpty: 'Hier ist keine Entscheidung nötig.',
      informational: 'Zur Information',
    },

    syncIndex: {
      label: 'Auch BluePLMs internen Sync-Status neu aufbauen',
      description: 'Nur interne Wartung — es werden keine Dateien verändert.',
    },

    pendingMove: {
      label_one: '{{count}} Datei auf der Festplatte verschoben, aber nicht im Tresor',
      label_other: '{{count}} Dateien auf der Festplatte verschoben, aber nicht im Tresor',
      description:
        'Wählen Sie pro Datei, ob der Tresorpfad wiederhergestellt oder der lokale Pfad behalten werden soll.',
      keepServer: 'Serverpfad behalten',
      keepLocal: 'Lokalen Pfad behalten',
      keepServerAll: 'Serverpfad für alle behalten',
      keepLocalAll: 'Lokalen Pfad für alle behalten',
      keepLocalNote:
        '„Lokalen Pfad behalten“ schreibt den Speicherort dieses Computers in den Tresor, sodass alle anderen die Umbenennung sehen.',
      adoptSummary_one: '{{count}} Datei wird auf den Serverpfad zurückgesetzt',
      adoptSummary_other: '{{count}} Dateien werden auf den Serverpfad zurückgesetzt',
      reconcileSummary_one: '{{count}} Datei aktualisiert den Tresor',
      reconcileSummary_other: '{{count}} Dateien aktualisieren den Tresor',
    },
    orphaned: {
      label_one: '{{count}} Datei, die der Server nicht mehr hat',
      label_other: '{{count}} Dateien, die der Server nicht mehr hat',
      description:
        'Verschiebt die Datei in den Papierkorb. Die Serverkopie ist bereits weg, es gibt also nichts mehr, mit dem synchronisiert werden könnte.',
    },
    outdated: {
      label_one: '{{count}} Datei mit einer neueren Version auf dem Server',
      label_other: '{{count}} Dateien mit einer neueren Version auf dem Server',
      description: 'Lädt die aktuelle Serverversion herunter und ersetzt die veraltete lokale Kopie.',
    },

    localOnly: {
      label_one: '{{count}} Datei, die nur auf Ihrem Computer existiert',
      label_other: '{{count}} Dateien, die nur auf Ihrem Computer existieren',
      description:
        'Nie in den Tresor eingecheckt. Der Abgleich lässt diese Dateien unverändert.',
      actionButton: 'Jetzt einchecken…',
      actionToast:
        'Wählen Sie diese Dateien im Datei-Browser aus und checken Sie sie ein, wenn Sie bereit sind.',
    },
    modified: {
      label_one: '{{count}} Datei mit lokalen Änderungen, die noch nicht auf dem Server sind',
      label_other:
        '{{count}} Dateien mit lokalen Änderungen, die noch nicht auf dem Server sind',
      description:
        'Ihre Änderungen bleiben erhalten. Der Abgleich verwirft lokale Änderungen niemals — checken Sie sie ein, um das Update zu teilen.',
      actionButton: 'Ihre Änderungen einchecken…',
      actionToast:
        'Wählen Sie diese Dateien im Datei-Browser aus und checken Sie Ihre Änderungen ein, wenn Sie bereit sind.',
    },
    ghost: {
      label_one: '{{count}} Datei, die von Ihnen ausgecheckt, aber auf der Festplatte fehlt',
      label_other:
        '{{count}} Dateien, die von Ihnen ausgecheckt, aber auf der Festplatte fehlen',
      description:
        'Etwas hat die Datei entfernt, nachdem Sie sie ausgecheckt hatten. Entscheiden Sie, ob Sie einen Ersatz einchecken oder das Auschecken aufheben.',
    },

    cloudOnly: {
      label_one: '{{count}} Datei nur auf dem Server',
      label_other: '{{count}} Dateien nur auf dem Server',
      whyNote:
        'Nicht herunterladen — der Abgleich ist kein Massen-Download. Aktivieren Sie den Auto-Download oder laden Sie Dateien einzeln herunter, wenn Sie eine lokale Kopie möchten.',
    },
    ignored: {
      label_one: '{{count}} Datei, die einem Ignorier-Muster entspricht',
      label_other: '{{count}} Dateien, die einem Ignorier-Muster entsprechen',
      whyNote: 'Wird vom Abgleich nie berührt, ebenso wie von allem anderen, das den Tresor synchronisiert.',
    },
    blockedCheckout: {
      label_one: '{{count}} Datei durch eine Auscheckung blockiert',
      label_other: '{{count}} Dateien durch eine Auscheckung blockiert',
      whyNote: 'Der Abgleich lässt jede Datei mit aktiver Auscheckung unangetastet.',
      selfHeld_one: 'Sie haben diese Datei selbst ausgecheckt.',
      selfHeld_other: 'Sie haben {{count}} davon selbst ausgecheckt.',
      otherHeld_one: 'Jemand anderes hat diese Datei ausgecheckt.',
      otherHeld_other: 'Jemand anderes hat {{count}} davon ausgecheckt.',
    },

    outcome: {
      heading: 'Ergebnis',
      abortedHeading: 'Der Abgleich wurde nicht ausgeführt.',
      abortNoVault: 'Es ist kein Tresor verbunden.',
      abortOffline: 'Sie sind offline — versuchen Sie es erneut, sobald Sie wieder online sind.',
      abortOperationInFlight:
        'Ein anderer Sync-Vorgang läuft bereits — versuchen Sie es erneut, sobald er abgeschlossen ist.',
      abortCancelled: 'Abgebrochen.',
      abortUnexpectedError:
        'Etwas ist schiefgelaufen. Versuchen Sie es erneut und kontaktieren Sie den Support, falls es weiterhin passiert.',

      step_resolvePendingMoves: 'Ausstehende Verschiebungen',
      step_recycleOrphans: 'Verwaiste Dateien',
      step_pullOutdated: 'Veraltete Dateien',
      step_rebuildSyncIndex: 'Sync-Status',

      ok_one: '{{count}} Datei behoben',
      ok_other: '{{count}} Dateien behoben',
      partial: '{{succeeded}} von {{attempted}} behoben — {{failed}} fehlgeschlagen',
      failedResult: 'Dieser Schritt konnte nicht abgeschlossen werden',
      nothingToDo: 'Nichts zu tun',
      refused: 'Aus Sicherheitsgründen übersprungen — versuchen Sie es gleich noch einmal',
    },
  },

  hiddenFolders: {
    hideFromNonAdmins: 'Vor Nicht-Administratoren ausblenden',
    showToEveryone: 'Für alle anzeigen',
    notAccessControl:
      'Blendet diesen Ordner in der Oberfläche für Nicht-Administratoren aus. Das ist keine Zugriffsbeschränkung, die Dateien bleiben lesbar.',
    badgeLabel: 'Vor Nicht-Administratoren ausgeblendet',
    hidden: 'Ordner vor Nicht-Administratoren ausgeblendet',
    unhidden: 'Ordner für alle sichtbar',
    updateFailed: 'Ordnersichtbarkeit konnte nicht aktualisiert werden',
    updateNotPermitted:
      'Sie haben möglicherweise keine Berechtigung, die Ordnersichtbarkeit zu ändern',
    scanSkipped: '{{count}} Dateien in ausgeblendeten Ordnern übersprungen',
  },
}
