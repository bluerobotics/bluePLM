/** One namespace: keys to strings, or one level of groups (`error.*`). */
type NamespaceDict = Record<string, string | Record<string, string>>

/**
 * `dbUpgrade.*`: the blocking screens of the 5.0 database upgrade and forced update
 * (`src/features/dbUpgrade`). Spread into each locale as `dbUpgrade`; `dbUpgradeKeys.test.ts`
 * checks every key in every locale.
 */

const en: NamespaceDict = {
  checking: 'Checking the database...',
  adminTitle: 'Database upgrade required',
  setupTitle: 'Set up the BluePLM database',
  adminIntro:
    "Your organization's database is at schema {{from}}. This version of BluePLM needs schema {{to}}. As an administrator you can upgrade it from here.",
  adminIntroUnknown:
    'This database has no BluePLM schema yet. Set it up here: BluePLM installs the database for a new organization. You need the database connection string from the Supabase project.',
  pendingHeading: 'What will run',
  stepLegacy: 'Bring the database to BluePLM 4.10 (schema 112)',
  stepBaseline: 'Install the BluePLM 5.0 database',
  stepAdopt: 'Record the migrations the database already has',
  stepVerify: 'Verify the database and record its version',
  stepUnknown: 'The exact steps are listed after Check database.',
  connectionLabel: 'Database connection string',
  connectionHelp:
    'In Supabase, open your project, choose Connect and copy the Session pooler connection string (port 5432). Replace [YOUR-PASSWORD] with the database password. It is used only to connect to your database: it is not shown again, not logged and not sent to any server.',
  openDashboard: 'Open the Supabase dashboard',
  remember:
    'Remember on this computer (encrypted). Later upgrades then apply automatically when you start BluePLM.',
  rememberUnavailable:
    'This computer cannot store it encrypted, so it is kept only until BluePLM closes.',
  usingRemembered: 'Using the connection saved on this computer.',
  forget: 'Forget the saved connection',
  check: 'Check database',
  apply: 'Apply upgrade',
  planning: 'Reading the database...',
  waitingForLock: 'Another administrator is upgrading the database. Waiting for it to finish...',
  progressStep: 'Step {{index}} of {{count}}: {{name}}',
  automaticNotice:
    'Applying the database upgrade automatically with the connection saved on this computer.',
  succeeded: 'The database is now at schema {{version}}. BluePLM reloads now.',
  upToDate: 'The database is already up to date.',
  refused: 'Nothing was run: {{message}}',
  failedTitle: 'The upgrade stopped',
  failedRolledBack:
    'The failing step was rolled back; the steps before it stay applied. Fix the cause and apply again.',
  errorStep: 'Step: {{name}}',
  errorFile: 'File: {{file}}, line {{line}}',
  errorFileNoLine: 'File: {{file}}',
  errorDetail: 'Detail: {{detail}}',
  errorHint: 'Hint: {{hint}}',
  errorWhere: 'Context: {{where}}',
  errorStatement: 'Failing statement',
  releaseManaged:
    'Your organization upgrades its database when a release is published, so this upgrade normally runs before the update reaches you. Check the release workflow, or upgrade from this computer.',
  upgradeHereInstead: 'Upgrade from this computer instead',
  showConnection: 'Show the connection string',
  hideConnection: 'Hide the connection string',
  savedConnectionFailed:
    'This used the connection saved on this computer. If the password changed, choose Forget the saved connection and enter the new one.',
  passwordRefused:
    'The database refused the password. Use the database password (Supabase: Database, Settings), not your Supabase sign-in, with no [ ] around it.',
  settingReleaseLabel: 'Upgrade the database from the release pipeline',
  settingReleaseHelp:
    'On: the release workflow applies schema upgrades before each release is published, and BluePLM never upgrades the database on its own. Off: an administrator upgrades it from the app.',
  settingSaveFailed: 'Could not save the setting: {{message}}',
  behindAdmin:
    'An administrator can upgrade the database from the app, or the next release applies it.',
  error: {
    format: 'That is not a Postgres connection string. It starts with postgresql://',
    transactionPooler:
      'That is the transaction pooler (port 6543). Use the Session pooler connection string (port 5432).',
    noPassword:
      'The connection string has no password. Replace [YOUR-PASSWORD] with the database password.',
    passwordBrackets:
      'The password is still inside the square brackets. Remove [ and ] so only the password is between : and @.',
    projectMismatch:
      'That connection string is for a different Supabase project than the one BluePLM is signed in to.',
    noCredential: 'Enter the connection string first.',
    connect: 'Could not connect to the database: {{message}}',
    running: 'An upgrade is already running.',
  },
  waitTitle: 'Database upgrade needed',
  waitBody:
    "Your organization's database needs an upgrade by an organization administrator before this version of BluePLM can use it. The administrator runs it from the BluePLM desktop app.",
  waitBodyWebAdmin:
    'You are an administrator: open the BluePLM desktop app to run the upgrade. BluePLM Web cannot run it.',
  recheck: 'Check again',
  signOut: 'Sign out',
  updateTitle: 'Update required',
  updateBody: 'Your organization requires BluePLM {{min}} or later. This is BluePLM {{current}}.',
  updateChecking: 'Looking for the update...',
  updateDownloading: 'Downloading BluePLM {{version}}: {{percent}}%',
  updateInstalling: 'Installing BluePLM {{version}} in {{seconds}} s. BluePLM restarts on its own.',
  updateNoUpdate:
    'No update to {{min}} or later is published yet. Try again later, or ask your administrator.',
  updateError: 'The update failed: {{message}}',
  updateManual: 'Download and install the new version, then start BluePLM again.',
  updateDownloadPage: 'Open the download page',
  updateRetry: 'Try again',
  updateWebBody: 'Reload the page to get the new version.',
  updateReload: 'Reload',
}

const de: NamespaceDict = {
  checking: 'Datenbank wird geprüft...',
  adminTitle: 'Datenbank-Upgrade erforderlich',
  setupTitle: 'BluePLM-Datenbank einrichten',
  adminIntro:
    'Die Datenbank Ihrer Organisation hat Schema {{from}}. Diese BluePLM-Version benötigt Schema {{to}}. Als Administrator können Sie das Upgrade hier ausführen.',
  adminIntroUnknown:
    'Diese Datenbank hat noch kein BluePLM-Schema. Richten Sie sie hier ein: BluePLM installiert die Datenbank für eine neue Organisation. Sie benötigen die Datenbank-Verbindungszeichenfolge des Supabase-Projekts.',
  pendingHeading: 'Was ausgeführt wird',
  stepLegacy: 'Datenbank auf BluePLM 4.10 (Schema 112) bringen',
  stepBaseline: 'BluePLM-5.0-Datenbank installieren',
  stepAdopt: 'Bereits vorhandene Migrationen erfassen',
  stepVerify: 'Datenbank prüfen und Version erfassen',
  stepUnknown: 'Die genauen Schritte erscheinen nach „Datenbank prüfen“.',
  connectionLabel: 'Datenbank-Verbindungszeichenfolge',
  connectionHelp:
    'Öffnen Sie in Supabase Ihr Projekt, wählen Sie Connect und kopieren Sie die Session-Pooler-Verbindungszeichenfolge (Port 5432). Ersetzen Sie [YOUR-PASSWORD] durch das Datenbankpasswort. Sie wird nur für die Verbindung zu Ihrer Datenbank verwendet: nicht erneut angezeigt, nicht protokolliert und an keinen Server gesendet.',
  openDashboard: 'Supabase-Dashboard öffnen',
  remember:
    'Auf diesem Computer merken (verschlüsselt). Spätere Upgrades werden dann beim Start von BluePLM automatisch ausgeführt.',
  rememberUnavailable:
    'Dieser Computer kann sie nicht verschlüsselt speichern; sie bleibt nur bis zum Schließen von BluePLM erhalten.',
  usingRemembered: 'Die auf diesem Computer gespeicherte Verbindung wird verwendet.',
  forget: 'Gespeicherte Verbindung vergessen',
  check: 'Datenbank prüfen',
  apply: 'Upgrade ausführen',
  planning: 'Datenbank wird gelesen...',
  waitingForLock:
    'Ein anderer Administrator aktualisiert die Datenbank gerade. Warten, bis er fertig ist...',
  progressStep: 'Schritt {{index}} von {{count}}: {{name}}',
  automaticNotice:
    'Das Datenbank-Upgrade wird automatisch mit der auf diesem Computer gespeicherten Verbindung ausgeführt.',
  succeeded: 'Die Datenbank hat jetzt Schema {{version}}. BluePLM wird neu geladen.',
  upToDate: 'Die Datenbank ist bereits aktuell.',
  refused: 'Nichts wurde ausgeführt: {{message}}',
  failedTitle: 'Das Upgrade wurde angehalten',
  failedRolledBack:
    'Der fehlgeschlagene Schritt wurde zurückgerollt; die Schritte davor bleiben angewendet. Beheben Sie die Ursache und führen Sie es erneut aus.',
  errorStep: 'Schritt: {{name}}',
  errorFile: 'Datei: {{file}}, Zeile {{line}}',
  errorFileNoLine: 'Datei: {{file}}',
  errorDetail: 'Detail: {{detail}}',
  errorHint: 'Hinweis: {{hint}}',
  errorWhere: 'Kontext: {{where}}',
  errorStatement: 'Fehlgeschlagene Anweisung',
  releaseManaged:
    'Ihre Organisation aktualisiert die Datenbank, wenn ein Release veröffentlicht wird, daher läuft dieses Upgrade normalerweise vor dem Update. Prüfen Sie den Release-Workflow oder führen Sie das Upgrade von diesem Computer aus.',
  upgradeHereInstead: 'Stattdessen von diesem Computer aktualisieren',
  showConnection: 'Verbindungszeichenfolge anzeigen',
  hideConnection: 'Verbindungszeichenfolge ausblenden',
  savedConnectionFailed:
    'Dabei wurde die auf diesem Computer gespeicherte Verbindung verwendet. Wenn sich das Passwort geändert hat, wählen Sie „Gespeicherte Verbindung vergessen“ und geben Sie die neue ein.',
  passwordRefused:
    'Die Datenbank hat das Passwort abgelehnt. Verwenden Sie das Datenbankpasswort (Supabase: Database, Settings), nicht Ihre Supabase-Anmeldung, ohne [ ] darum.',
  settingReleaseLabel: 'Datenbank über die Release-Pipeline aktualisieren',
  settingReleaseHelp:
    'Ein: Der Release-Workflow wendet Schema-Upgrades an, bevor ein Release veröffentlicht wird, und BluePLM aktualisiert die Datenbank nie selbst. Aus: Ein Administrator aktualisiert sie in der App.',
  settingSaveFailed: 'Die Einstellung konnte nicht gespeichert werden: {{message}}',
  behindAdmin:
    'Ein Administrator kann die Datenbank in der App aktualisieren, oder das nächste Release übernimmt es.',
  error: {
    format: 'Das ist keine Postgres-Verbindungszeichenfolge. Sie beginnt mit postgresql://',
    transactionPooler:
      'Das ist der Transaction Pooler (Port 6543). Verwenden Sie die Session-Pooler-Verbindungszeichenfolge (Port 5432).',
    noPassword:
      'Die Verbindungszeichenfolge enthält kein Passwort. Ersetzen Sie [YOUR-PASSWORD] durch das Datenbankpasswort.',
    passwordBrackets:
      'Das Passwort steht noch in den eckigen Klammern. Entfernen Sie [ und ], sodass zwischen : und @ nur das Passwort steht.',
    projectMismatch:
      'Diese Verbindungszeichenfolge gehört zu einem anderen Supabase-Projekt als dem, bei dem BluePLM angemeldet ist.',
    noCredential: 'Geben Sie zuerst die Verbindungszeichenfolge ein.',
    connect: 'Verbindung zur Datenbank fehlgeschlagen: {{message}}',
    running: 'Ein Upgrade läuft bereits.',
  },
  waitTitle: 'Datenbank-Upgrade nötig',
  waitBody:
    'Die Datenbank Ihrer Organisation muss von einem Organisationsadministrator aktualisiert werden, bevor diese BluePLM-Version sie verwenden kann. Der Administrator führt das Upgrade in der BluePLM-Desktop-App aus.',
  waitBodyWebAdmin:
    'Sie sind Administrator: Öffnen Sie die BluePLM-Desktop-App, um das Upgrade auszuführen. BluePLM Web kann es nicht.',
  recheck: 'Erneut prüfen',
  signOut: 'Abmelden',
  updateTitle: 'Update erforderlich',
  updateBody: 'Ihre Organisation verlangt BluePLM {{min}} oder neuer. Dies ist BluePLM {{current}}.',
  updateChecking: 'Update wird gesucht...',
  updateDownloading: 'BluePLM {{version}} wird heruntergeladen: {{percent}} %',
  updateInstalling:
    'BluePLM {{version}} wird in {{seconds}} s installiert. BluePLM startet von selbst neu.',
  updateNoUpdate:
    'Es ist noch kein Update auf {{min}} oder neuer veröffentlicht. Versuchen Sie es später erneut oder fragen Sie Ihren Administrator.',
  updateError: 'Das Update ist fehlgeschlagen: {{message}}',
  updateManual: 'Laden Sie die neue Version herunter, installieren Sie sie und starten Sie BluePLM erneut.',
  updateDownloadPage: 'Download-Seite öffnen',
  updateRetry: 'Erneut versuchen',
  updateWebBody: 'Laden Sie die Seite neu, um die neue Version zu erhalten.',
  updateReload: 'Neu laden',
}

const es: NamespaceDict = {
  checking: 'Comprobando la base de datos...',
  adminTitle: 'Se requiere actualizar la base de datos',
  setupTitle: 'Configurar la base de datos de BluePLM',
  adminIntro:
    'La base de datos de su organización está en el esquema {{from}}. Esta versión de BluePLM necesita el esquema {{to}}. Como administrador puede actualizarla desde aquí.',
  adminIntroUnknown:
    'Esta base de datos aún no tiene el esquema de BluePLM. Configúrela aquí: BluePLM instala la base de datos para una organización nueva. Necesita la cadena de conexión de la base de datos del proyecto de Supabase.',
  pendingHeading: 'Qué se ejecutará',
  stepLegacy: 'Llevar la base de datos a BluePLM 4.10 (esquema 112)',
  stepBaseline: 'Instalar la base de datos de BluePLM 5.0',
  stepAdopt: 'Registrar las migraciones que la base de datos ya tiene',
  stepVerify: 'Verificar la base de datos y registrar su versión',
  stepUnknown: 'Los pasos exactos se muestran tras Comprobar base de datos.',
  connectionLabel: 'Cadena de conexión de la base de datos',
  connectionHelp:
    'En Supabase, abra su proyecto, elija Connect y copie la cadena de conexión del Session pooler (puerto 5432). Sustituya [YOUR-PASSWORD] por la contraseña de la base de datos. Solo se usa para conectar con su base de datos: no se vuelve a mostrar, no se registra y no se envía a ningún servidor.',
  openDashboard: 'Abrir el panel de Supabase',
  remember:
    'Recordar en este equipo (cifrada). Las actualizaciones posteriores se aplicarán automáticamente al iniciar BluePLM.',
  rememberUnavailable:
    'Este equipo no puede guardarla cifrada, así que solo se conserva hasta cerrar BluePLM.',
  usingRemembered: 'Se usa la conexión guardada en este equipo.',
  forget: 'Olvidar la conexión guardada',
  check: 'Comprobar base de datos',
  apply: 'Aplicar actualización',
  planning: 'Leyendo la base de datos...',
  waitingForLock:
    'Otro administrador está actualizando la base de datos. Esperando a que termine...',
  progressStep: 'Paso {{index}} de {{count}}: {{name}}',
  automaticNotice:
    'Aplicando la actualización de la base de datos automáticamente con la conexión guardada en este equipo.',
  succeeded: 'La base de datos está ahora en el esquema {{version}}. BluePLM se recargará.',
  upToDate: 'La base de datos ya está al día.',
  refused: 'No se ejecutó nada: {{message}}',
  failedTitle: 'La actualización se detuvo',
  failedRolledBack:
    'El paso que falló se revirtió; los pasos anteriores siguen aplicados. Corrija la causa y vuelva a aplicar.',
  errorStep: 'Paso: {{name}}',
  errorFile: 'Archivo: {{file}}, línea {{line}}',
  errorFileNoLine: 'Archivo: {{file}}',
  errorDetail: 'Detalle: {{detail}}',
  errorHint: 'Sugerencia: {{hint}}',
  errorWhere: 'Contexto: {{where}}',
  errorStatement: 'Instrucción que falló',
  releaseManaged:
    'Su organización actualiza la base de datos al publicar una versión, así que esta actualización suele ejecutarse antes de que le llegue. Revise el flujo de publicación o actualice desde este equipo.',
  upgradeHereInstead: 'Actualizar desde este equipo',
  showConnection: 'Mostrar la cadena de conexión',
  hideConnection: 'Ocultar la cadena de conexión',
  savedConnectionFailed:
    'Se usó la conexión guardada en este equipo. Si la contraseña cambió, elija Olvidar la conexión guardada e introduzca la nueva.',
  passwordRefused:
    'La base de datos rechazó la contraseña. Use la contraseña de la base de datos (Supabase: Database, Settings), no su inicio de sesión de Supabase, sin [ ] alrededor.',
  settingReleaseLabel: 'Actualizar la base de datos desde el flujo de publicación',
  settingReleaseHelp:
    'Activado: el flujo de publicación aplica las actualizaciones del esquema antes de publicar cada versión y BluePLM nunca actualiza la base de datos por sí mismo. Desactivado: un administrador la actualiza desde la aplicación.',
  settingSaveFailed: 'No se pudo guardar el ajuste: {{message}}',
  behindAdmin:
    'Un administrador puede actualizar la base de datos desde la aplicación, o la próxima versión lo hará.',
  error: {
    format: 'Eso no es una cadena de conexión de Postgres. Empieza por postgresql://',
    transactionPooler:
      'Ese es el Transaction pooler (puerto 6543). Use la cadena de conexión del Session pooler (puerto 5432).',
    noPassword:
      'La cadena de conexión no tiene contraseña. Sustituya [YOUR-PASSWORD] por la contraseña de la base de datos.',
    passwordBrackets:
      'La contraseña sigue entre corchetes. Quite [ y ] para que entre : y @ quede solo la contraseña.',
    projectMismatch:
      'Esa cadena de conexión es de un proyecto de Supabase distinto del que usa BluePLM.',
    noCredential: 'Introduzca primero la cadena de conexión.',
    connect: 'No se pudo conectar con la base de datos: {{message}}',
    running: 'Ya hay una actualización en curso.',
  },
  waitTitle: 'Hace falta actualizar la base de datos',
  waitBody:
    'Un administrador de la organización debe actualizar la base de datos antes de que esta versión de BluePLM pueda usarla. El administrador la ejecuta desde la aplicación de escritorio de BluePLM.',
  waitBodyWebAdmin:
    'Usted es administrador: abra la aplicación de escritorio de BluePLM para ejecutar la actualización. BluePLM Web no puede hacerlo.',
  recheck: 'Comprobar de nuevo',
  signOut: 'Cerrar sesión',
  updateTitle: 'Actualización necesaria',
  updateBody: 'Su organización requiere BluePLM {{min}} o posterior. Esta es BluePLM {{current}}.',
  updateChecking: 'Buscando la actualización...',
  updateDownloading: 'Descargando BluePLM {{version}}: {{percent}} %',
  updateInstalling:
    'Instalando BluePLM {{version}} en {{seconds}} s. BluePLM se reiniciará solo.',
  updateNoUpdate:
    'Aún no se ha publicado una actualización a {{min}} o posterior. Inténtelo más tarde o consulte a su administrador.',
  updateError: 'La actualización falló: {{message}}',
  updateManual: 'Descargue e instale la nueva versión y vuelva a iniciar BluePLM.',
  updateDownloadPage: 'Abrir la página de descarga',
  updateRetry: 'Reintentar',
  updateWebBody: 'Recargue la página para obtener la nueva versión.',
  updateReload: 'Recargar',
}

const fr: NamespaceDict = {
  checking: 'Vérification de la base de données...',
  adminTitle: 'Mise à niveau de la base de données requise',
  setupTitle: 'Configurer la base de données BluePLM',
  adminIntro:
    'La base de données de votre organisation est au schéma {{from}}. Cette version de BluePLM nécessite le schéma {{to}}. En tant qu’administrateur, vous pouvez la mettre à niveau ici.',
  adminIntroUnknown:
    'Cette base de données n’a pas encore de schéma BluePLM. Configurez-la ici : BluePLM installe la base de données d’une nouvelle organisation. Il vous faut la chaîne de connexion de la base de données du projet Supabase.',
  pendingHeading: 'Ce qui sera exécuté',
  stepLegacy: 'Amener la base de données à BluePLM 4.10 (schéma 112)',
  stepBaseline: 'Installer la base de données BluePLM 5.0',
  stepAdopt: 'Enregistrer les migrations déjà présentes',
  stepVerify: 'Vérifier la base de données et enregistrer sa version',
  stepUnknown: 'Les étapes exactes s’affichent après Vérifier la base de données.',
  connectionLabel: 'Chaîne de connexion de la base de données',
  connectionHelp:
    'Dans Supabase, ouvrez votre projet, choisissez Connect et copiez la chaîne de connexion du Session pooler (port 5432). Remplacez [YOUR-PASSWORD] par le mot de passe de la base de données. Elle sert uniquement à se connecter à votre base : elle n’est plus affichée, n’est pas journalisée et n’est envoyée à aucun serveur.',
  openDashboard: 'Ouvrir le tableau de bord Supabase',
  remember:
    'Mémoriser sur cet ordinateur (chiffrée). Les mises à niveau suivantes s’appliqueront automatiquement au démarrage de BluePLM.',
  rememberUnavailable:
    'Cet ordinateur ne peut pas la stocker chiffrée ; elle n’est conservée que jusqu’à la fermeture de BluePLM.',
  usingRemembered: 'La connexion enregistrée sur cet ordinateur est utilisée.',
  forget: 'Oublier la connexion enregistrée',
  check: 'Vérifier la base de données',
  apply: 'Appliquer la mise à niveau',
  planning: 'Lecture de la base de données...',
  waitingForLock:
    'Un autre administrateur met à niveau la base de données. Attente de la fin...',
  progressStep: 'Étape {{index}} sur {{count}} : {{name}}',
  automaticNotice:
    'Application automatique de la mise à niveau avec la connexion enregistrée sur cet ordinateur.',
  succeeded: 'La base de données est maintenant au schéma {{version}}. BluePLM se recharge.',
  upToDate: 'La base de données est déjà à jour.',
  refused: 'Rien n’a été exécuté : {{message}}',
  failedTitle: 'La mise à niveau s’est arrêtée',
  failedRolledBack:
    'L’étape en échec a été annulée ; les étapes précédentes restent appliquées. Corrigez la cause et relancez.',
  errorStep: 'Étape : {{name}}',
  errorFile: 'Fichier : {{file}}, ligne {{line}}',
  errorFileNoLine: 'Fichier : {{file}}',
  errorDetail: 'Détail : {{detail}}',
  errorHint: 'Conseil : {{hint}}',
  errorWhere: 'Contexte : {{where}}',
  errorStatement: 'Instruction en échec',
  releaseManaged:
    'Votre organisation met à niveau sa base de données à la publication d’une version : cette mise à niveau s’exécute normalement avant que la mise à jour vous parvienne. Vérifiez le flux de publication ou mettez à niveau depuis cet ordinateur.',
  upgradeHereInstead: 'Mettre à niveau depuis cet ordinateur',
  showConnection: 'Afficher la chaîne de connexion',
  hideConnection: 'Masquer la chaîne de connexion',
  savedConnectionFailed:
    'La connexion enregistrée sur cet ordinateur a été utilisée. Si le mot de passe a changé, choisissez Oublier la connexion enregistrée et saisissez la nouvelle.',
  passwordRefused:
    'La base de données a refusé le mot de passe. Utilisez le mot de passe de la base de données (Supabase : Database, Settings), pas votre connexion Supabase, sans [ ] autour.',
  settingReleaseLabel: 'Mettre à niveau la base de données depuis le flux de publication',
  settingReleaseHelp:
    'Activé : le flux de publication applique les mises à niveau du schéma avant chaque version, et BluePLM ne met jamais la base de données à niveau lui-même. Désactivé : un administrateur la met à niveau depuis l’application.',
  settingSaveFailed: 'Impossible d’enregistrer le réglage : {{message}}',
  behindAdmin:
    'Un administrateur peut mettre la base de données à niveau depuis l’application, ou la prochaine version le fera.',
  error: {
    format: 'Ce n’est pas une chaîne de connexion Postgres. Elle commence par postgresql://',
    transactionPooler:
      'C’est le Transaction pooler (port 6543). Utilisez la chaîne de connexion du Session pooler (port 5432).',
    noPassword:
      'La chaîne de connexion n’a pas de mot de passe. Remplacez [YOUR-PASSWORD] par le mot de passe de la base de données.',
    passwordBrackets:
      'Le mot de passe est encore entre crochets. Retirez [ et ] pour qu’entre : et @ il ne reste que le mot de passe.',
    projectMismatch:
      'Cette chaîne de connexion appartient à un autre projet Supabase que celui auquel BluePLM est connecté.',
    noCredential: 'Saisissez d’abord la chaîne de connexion.',
    connect: 'Connexion à la base de données impossible : {{message}}',
    running: 'Une mise à niveau est déjà en cours.',
  },
  waitTitle: 'Mise à niveau de la base de données nécessaire',
  waitBody:
    'La base de données de votre organisation doit être mise à niveau par un administrateur avant que cette version de BluePLM puisse l’utiliser. L’administrateur la lance depuis l’application de bureau BluePLM.',
  waitBodyWebAdmin:
    'Vous êtes administrateur : ouvrez l’application de bureau BluePLM pour lancer la mise à niveau. BluePLM Web ne le peut pas.',
  recheck: 'Vérifier à nouveau',
  signOut: 'Se déconnecter',
  updateTitle: 'Mise à jour requise',
  updateBody: 'Votre organisation exige BluePLM {{min}} ou plus récent. Ceci est BluePLM {{current}}.',
  updateChecking: 'Recherche de la mise à jour...',
  updateDownloading: 'Téléchargement de BluePLM {{version}} : {{percent}} %',
  updateInstalling:
    'Installation de BluePLM {{version}} dans {{seconds}} s. BluePLM redémarre tout seul.',
  updateNoUpdate:
    'Aucune mise à jour vers {{min}} ou plus récent n’est encore publiée. Réessayez plus tard ou contactez votre administrateur.',
  updateError: 'La mise à jour a échoué : {{message}}',
  updateManual: 'Téléchargez et installez la nouvelle version, puis relancez BluePLM.',
  updateDownloadPage: 'Ouvrir la page de téléchargement',
  updateRetry: 'Réessayer',
  updateWebBody: 'Rechargez la page pour obtenir la nouvelle version.',
  updateReload: 'Recharger',
}

const pt: NamespaceDict = {
  checking: 'Verificando o banco de dados...',
  adminTitle: 'Atualização do banco de dados necessária',
  setupTitle: 'Configurar o banco de dados do BluePLM',
  adminIntro:
    'O banco de dados da sua organização está no esquema {{from}}. Esta versão do BluePLM precisa do esquema {{to}}. Como administrador, você pode atualizá-lo aqui.',
  adminIntroUnknown:
    'Este banco de dados ainda não tem o esquema do BluePLM. Configure-o aqui: o BluePLM instala o banco de dados de uma nova organização. Você precisa da string de conexão do banco de dados do projeto Supabase.',
  pendingHeading: 'O que será executado',
  stepLegacy: 'Levar o banco de dados ao BluePLM 4.10 (esquema 112)',
  stepBaseline: 'Instalar o banco de dados do BluePLM 5.0',
  stepAdopt: 'Registrar as migrações que o banco de dados já tem',
  stepVerify: 'Verificar o banco de dados e registrar sua versão',
  stepUnknown: 'Os passos exatos aparecem após Verificar banco de dados.',
  connectionLabel: 'String de conexão do banco de dados',
  connectionHelp:
    'No Supabase, abra seu projeto, escolha Connect e copie a string de conexão do Session pooler (porta 5432). Substitua [YOUR-PASSWORD] pela senha do banco de dados. Ela é usada apenas para conectar ao seu banco: não é exibida de novo, não é registrada e não é enviada a nenhum servidor.',
  openDashboard: 'Abrir o painel do Supabase',
  remember:
    'Lembrar neste computador (criptografada). As próximas atualizações serão aplicadas automaticamente ao iniciar o BluePLM.',
  rememberUnavailable:
    'Este computador não consegue guardá-la criptografada; ela fica apenas até o BluePLM fechar.',
  usingRemembered: 'Usando a conexão salva neste computador.',
  forget: 'Esquecer a conexão salva',
  check: 'Verificar banco de dados',
  apply: 'Aplicar atualização',
  planning: 'Lendo o banco de dados...',
  waitingForLock:
    'Outro administrador está atualizando o banco de dados. Aguardando a conclusão...',
  progressStep: 'Passo {{index}} de {{count}}: {{name}}',
  automaticNotice:
    'Aplicando a atualização do banco de dados automaticamente com a conexão salva neste computador.',
  succeeded: 'O banco de dados agora está no esquema {{version}}. O BluePLM será recarregado.',
  upToDate: 'O banco de dados já está atualizado.',
  refused: 'Nada foi executado: {{message}}',
  failedTitle: 'A atualização parou',
  failedRolledBack:
    'O passo que falhou foi revertido; os passos anteriores continuam aplicados. Corrija a causa e aplique novamente.',
  errorStep: 'Passo: {{name}}',
  errorFile: 'Arquivo: {{file}}, linha {{line}}',
  errorFileNoLine: 'Arquivo: {{file}}',
  errorDetail: 'Detalhe: {{detail}}',
  errorHint: 'Dica: {{hint}}',
  errorWhere: 'Contexto: {{where}}',
  errorStatement: 'Instrução que falhou',
  releaseManaged:
    'A sua organização atualiza a base de dados quando uma versão é publicada, por isso esta atualização normalmente corre antes de a atualização lhe chegar. Verifique o fluxo de publicação ou atualize a partir deste computador.',
  upgradeHereInstead: 'Atualizar a partir deste computador',
  showConnection: 'Mostrar a cadeia de ligação',
  hideConnection: 'Ocultar a cadeia de ligação',
  savedConnectionFailed:
    'Foi usada a ligação guardada neste computador. Se a senha mudou, escolha Esquecer a ligação guardada e introduza a nova.',
  passwordRefused:
    'A base de dados recusou a senha. Use a senha da base de dados (Supabase: Database, Settings), não o seu início de sessão no Supabase, sem [ ] à volta.',
  settingReleaseLabel: 'Atualizar a base de dados pelo fluxo de publicação',
  settingReleaseHelp:
    'Ligado: o fluxo de publicação aplica as atualizações do esquema antes de cada versão ser publicada, e o BluePLM nunca atualiza a base de dados sozinho. Desligado: um administrador atualiza-a na aplicação.',
  settingSaveFailed: 'Não foi possível guardar a definição: {{message}}',
  behindAdmin:
    'Um administrador pode atualizar a base de dados na aplicação, ou a próxima versão fá-lo-á.',
  error: {
    format: 'Isso não é uma string de conexão do Postgres. Ela começa com postgresql://',
    transactionPooler:
      'Esse é o Transaction pooler (porta 6543). Use a string de conexão do Session pooler (porta 5432).',
    noPassword:
      'A string de conexão não tem senha. Substitua [YOUR-PASSWORD] pela senha do banco de dados.',
    passwordBrackets:
      'A senha ainda está entre colchetes. Remova [ e ] para que entre : e @ fique só a senha.',
    projectMismatch:
      'Essa string de conexão é de um projeto do Supabase diferente daquele em que o BluePLM está conectado.',
    noCredential: 'Informe primeiro a string de conexão.',
    connect: 'Não foi possível conectar ao banco de dados: {{message}}',
    running: 'Uma atualização já está em andamento.',
  },
  waitTitle: 'O banco de dados precisa ser atualizado',
  waitBody:
    'O banco de dados da sua organização precisa ser atualizado por um administrador da organização antes que esta versão do BluePLM possa usá-lo. O administrador executa a atualização no aplicativo desktop do BluePLM.',
  waitBodyWebAdmin:
    'Você é administrador: abra o aplicativo desktop do BluePLM para executar a atualização. O BluePLM Web não consegue.',
  recheck: 'Verificar novamente',
  signOut: 'Sair',
  updateTitle: 'Atualização necessária',
  updateBody: 'Sua organização exige o BluePLM {{min}} ou mais recente. Este é o BluePLM {{current}}.',
  updateChecking: 'Procurando a atualização...',
  updateDownloading: 'Baixando o BluePLM {{version}}: {{percent}}%',
  updateInstalling:
    'Instalando o BluePLM {{version}} em {{seconds}} s. O BluePLM reinicia sozinho.',
  updateNoUpdate:
    'Ainda não há atualização para {{min}} ou mais recente publicada. Tente mais tarde ou fale com seu administrador.',
  updateError: 'A atualização falhou: {{message}}',
  updateManual: 'Baixe e instale a nova versão e inicie o BluePLM novamente.',
  updateDownloadPage: 'Abrir a página de download',
  updateRetry: 'Tentar novamente',
  updateWebBody: 'Recarregue a página para obter a nova versão.',
  updateReload: 'Recarregar',
}

const zhCN: NamespaceDict = {
  checking: '正在检查数据库...',
  adminTitle: '需要升级数据库',
  setupTitle: '设置 BluePLM 数据库',
  adminIntro:
    '您组织的数据库处于架构 {{from}}。此版本的 BluePLM 需要架构 {{to}}。作为管理员，您可以在此处升级。',
  adminIntroUnknown:
    '此数据库尚无 BluePLM 架构。请在此设置：BluePLM 将为新组织安装数据库。您需要 Supabase 项目的数据库连接字符串。',
  pendingHeading: '将要执行的内容',
  stepLegacy: '将数据库升级到 BluePLM 4.10（架构 112）',
  stepBaseline: '安装 BluePLM 5.0 数据库',
  stepAdopt: '记录数据库中已有的迁移',
  stepVerify: '验证数据库并记录其版本',
  stepUnknown: '点击“检查数据库”后会列出具体步骤。',
  connectionLabel: '数据库连接字符串',
  connectionHelp:
    '在 Supabase 中打开您的项目，选择 Connect，复制 Session pooler 连接字符串（端口 5432）。将 [YOUR-PASSWORD] 替换为数据库密码。它只用于连接您的数据库：不会再次显示、不会记录日志，也不会发送到任何服务器。',
  openDashboard: '打开 Supabase 控制台',
  remember: '在此计算机上记住（加密）。之后的升级将在启动 BluePLM 时自动执行。',
  rememberUnavailable: '此计算机无法加密保存，因此只保留到 BluePLM 关闭为止。',
  usingRemembered: '正在使用此计算机上保存的连接。',
  forget: '忘记保存的连接',
  check: '检查数据库',
  apply: '执行升级',
  planning: '正在读取数据库...',
  waitingForLock: '另一位管理员正在升级数据库。正在等待其完成...',
  progressStep: '第 {{index}} 步，共 {{count}} 步：{{name}}',
  automaticNotice: '正在使用此计算机上保存的连接自动执行数据库升级。',
  succeeded: '数据库现在处于架构 {{version}}。BluePLM 将重新加载。',
  upToDate: '数据库已是最新。',
  refused: '未执行任何操作：{{message}}',
  failedTitle: '升级已停止',
  failedRolledBack: '失败的步骤已回滚；之前的步骤保持已应用。请修复原因后重新执行。',
  errorStep: '步骤：{{name}}',
  errorFile: '文件：{{file}}，第 {{line}} 行',
  errorFileNoLine: '文件：{{file}}',
  errorDetail: '详情：{{detail}}',
  errorHint: '提示：{{hint}}',
  errorWhere: '上下文：{{where}}',
  errorStatement: '失败的语句',
  releaseManaged: '你的组织在发布新版本时升级数据库，因此此升级通常会在更新到达你之前完成。请检查发布工作流，或从这台电脑升级。',
  upgradeHereInstead: '改为从这台电脑升级',
  showConnection: '显示连接字符串',
  hideConnection: '隐藏连接字符串',
  savedConnectionFailed: '这次使用的是这台电脑上保存的连接。如果密码已更改，请选择“忘记保存的连接”并输入新的连接。',
  passwordRefused: '数据库拒绝了该密码。请使用数据库密码（Supabase：Database、Settings），而不是 Supabase 登录密码，且两侧不要有 [ ]。',
  settingReleaseLabel: '由发布流水线升级数据库',
  settingReleaseHelp: '开启：发布工作流会在每个版本发布前应用架构升级，BluePLM 不会自行升级数据库。关闭：由管理员在应用中升级。',
  settingSaveFailed: '无法保存该设置：{{message}}',
  behindAdmin: '管理员可以在应用中升级数据库，或由下一个版本完成升级。',
  error: {
    format: '这不是 Postgres 连接字符串。它以 postgresql:// 开头',
    transactionPooler: '这是 Transaction pooler（端口 6543）。请使用 Session pooler 连接字符串（端口 5432）。',
    noPassword: '连接字符串中没有密码。请将 [YOUR-PASSWORD] 替换为数据库密码。',
    passwordBrackets: '密码仍在方括号内。请删除 [ 和 ]，使 : 与 @ 之间只有密码。',
    projectMismatch: '该连接字符串属于另一个 Supabase 项目，而不是 BluePLM 当前登录的项目。',
    noCredential: '请先输入连接字符串。',
    connect: '无法连接到数据库：{{message}}',
    running: '已有升级正在运行。',
  },
  waitTitle: '需要升级数据库',
  waitBody:
    '您组织的数据库需要由组织管理员升级后，此版本的 BluePLM 才能使用。管理员在 BluePLM 桌面应用中执行升级。',
  waitBodyWebAdmin: '您是管理员：请打开 BluePLM 桌面应用执行升级。BluePLM Web 无法执行。',
  recheck: '重新检查',
  signOut: '退出登录',
  updateTitle: '需要更新',
  updateBody: '您的组织要求 BluePLM {{min}} 或更高版本。当前为 BluePLM {{current}}。',
  updateChecking: '正在查找更新...',
  updateDownloading: '正在下载 BluePLM {{version}}：{{percent}}%',
  updateInstalling: '将在 {{seconds}} 秒后安装 BluePLM {{version}}。BluePLM 会自动重启。',
  updateNoUpdate: '尚未发布 {{min}} 或更高版本的更新。请稍后再试，或联系您的管理员。',
  updateError: '更新失败：{{message}}',
  updateManual: '请下载并安装新版本，然后重新启动 BluePLM。',
  updateDownloadPage: '打开下载页面',
  updateRetry: '重试',
  updateWebBody: '重新加载页面以获取新版本。',
  updateReload: '重新加载',
}

const zhTW: NamespaceDict = {
  checking: '正在檢查資料庫...',
  adminTitle: '需要升級資料庫',
  setupTitle: '設定 BluePLM 資料庫',
  adminIntro:
    '您組織的資料庫處於結構描述 {{from}}。此版本的 BluePLM 需要結構描述 {{to}}。身為管理員，您可以在此處升級。',
  adminIntroUnknown:
    '此資料庫尚無 BluePLM 結構描述。請在此設定：BluePLM 將為新組織安裝資料庫。您需要 Supabase 專案的資料庫連線字串。',
  pendingHeading: '將要執行的內容',
  stepLegacy: '將資料庫升級到 BluePLM 4.10（結構描述 112）',
  stepBaseline: '安裝 BluePLM 5.0 資料庫',
  stepAdopt: '記錄資料庫中已有的遷移',
  stepVerify: '驗證資料庫並記錄其版本',
  stepUnknown: '點選「檢查資料庫」後會列出確切步驟。',
  connectionLabel: '資料庫連線字串',
  connectionHelp:
    '在 Supabase 中開啟您的專案，選擇 Connect，複製 Session pooler 連線字串（連接埠 5432）。將 [YOUR-PASSWORD] 替換為資料庫密碼。它只用於連線到您的資料庫：不會再次顯示、不會寫入記錄，也不會傳送到任何伺服器。',
  openDashboard: '開啟 Supabase 控制台',
  remember: '在此電腦上記住（加密）。之後的升級將在啟動 BluePLM 時自動執行。',
  rememberUnavailable: '此電腦無法加密儲存，因此只保留到 BluePLM 關閉為止。',
  usingRemembered: '正在使用此電腦上儲存的連線。',
  forget: '忘記儲存的連線',
  check: '檢查資料庫',
  apply: '執行升級',
  planning: '正在讀取資料庫...',
  waitingForLock: '另一位管理員正在升級資料庫。正在等待其完成...',
  progressStep: '第 {{index}} 步，共 {{count}} 步：{{name}}',
  automaticNotice: '正在使用此電腦上儲存的連線自動執行資料庫升級。',
  succeeded: '資料庫現在處於結構描述 {{version}}。BluePLM 將重新載入。',
  upToDate: '資料庫已是最新。',
  refused: '未執行任何操作：{{message}}',
  failedTitle: '升級已停止',
  failedRolledBack: '失敗的步驟已回復；之前的步驟保持已套用。請修正原因後重新執行。',
  errorStep: '步驟：{{name}}',
  errorFile: '檔案：{{file}}，第 {{line}} 行',
  errorFileNoLine: '檔案：{{file}}',
  errorDetail: '詳細資料：{{detail}}',
  errorHint: '提示：{{hint}}',
  errorWhere: '內容：{{where}}',
  errorStatement: '失敗的陳述式',
  releaseManaged: '你的組織在發佈新版本時升級資料庫，因此此升級通常會在更新到達你之前完成。請檢查發佈工作流程，或從這台電腦升級。',
  upgradeHereInstead: '改為從這台電腦升級',
  showConnection: '顯示連線字串',
  hideConnection: '隱藏連線字串',
  savedConnectionFailed: '這次使用的是這台電腦上儲存的連線。如果密碼已變更，請選擇「忘記儲存的連線」並輸入新的連線。',
  passwordRefused: '資料庫拒絕了該密碼。請使用資料庫密碼（Supabase：Database、Settings），而不是 Supabase 登入密碼，且兩側不要有 [ ]。',
  settingReleaseLabel: '由發佈流程升級資料庫',
  settingReleaseHelp: '開啟：發佈工作流程會在每個版本發佈前套用結構描述升級，BluePLM 不會自行升級資料庫。關閉：由管理員在應用程式中升級。',
  settingSaveFailed: '無法儲存該設定：{{message}}',
  behindAdmin: '管理員可以在應用程式中升級資料庫，或由下一個版本完成升級。',
  error: {
    format: '這不是 Postgres 連線字串。它以 postgresql:// 開頭',
    transactionPooler: '這是 Transaction pooler（連接埠 6543）。請使用 Session pooler 連線字串（連接埠 5432）。',
    noPassword: '連線字串中沒有密碼。請將 [YOUR-PASSWORD] 替換為資料庫密碼。',
    passwordBrackets: '密碼仍在方括號內。請刪除 [ 和 ]，使 : 與 @ 之間只有密碼。',
    projectMismatch: '此連線字串屬於另一個 Supabase 專案，而不是 BluePLM 目前登入的專案。',
    noCredential: '請先輸入連線字串。',
    connect: '無法連線到資料庫：{{message}}',
    running: '已有升級正在執行。',
  },
  waitTitle: '需要升級資料庫',
  waitBody:
    '您組織的資料庫需要由組織管理員升級後，此版本的 BluePLM 才能使用。管理員在 BluePLM 桌面應用程式中執行升級。',
  waitBodyWebAdmin: '您是管理員：請開啟 BluePLM 桌面應用程式執行升級。BluePLM Web 無法執行。',
  recheck: '重新檢查',
  signOut: '登出',
  updateTitle: '需要更新',
  updateBody: '您的組織要求 BluePLM {{min}} 或更新版本。目前為 BluePLM {{current}}。',
  updateChecking: '正在尋找更新...',
  updateDownloading: '正在下載 BluePLM {{version}}：{{percent}}%',
  updateInstalling: '將在 {{seconds}} 秒後安裝 BluePLM {{version}}。BluePLM 會自動重新啟動。',
  updateNoUpdate: '尚未發布 {{min}} 或更新版本的更新。請稍後再試，或聯絡您的管理員。',
  updateError: '更新失敗：{{message}}',
  updateManual: '請下載並安裝新版本，然後重新啟動 BluePLM。',
  updateDownloadPage: '開啟下載頁面',
  updateRetry: '重試',
  updateWebBody: '重新載入頁面以取得新版本。',
  updateReload: '重新載入',
}

export const dbUpgradeStrings = { en, de, es, fr, pt, zhCN, zhTW }
