/**
 * Every word the app says, in French.
 *
 * Typed against `en.ts`, so this file cannot go out of step with it: a key
 * added in English and missed here is a typecheck failure, not a stray English
 * sentence in a French screen.
 *
 * Two conventions worth knowing before editing:
 *
 * - The apostrophe is the typographic one (’), not the ASCII quote, to match
 *   the English catalogue and the rest of the design system.
 * - French typography wants a narrow no-break space before `? ! ; :` and `%`.
 *   We use an ordinary space instead, deliberately: an invisible U+202F in a
 *   source file is a trap for the next person to edit a sentence, and the
 *   difference is a few pixels of tracking.
 *
 * Running vocabulary is the one runners use, not the dictionary's: *footing*
 * for an easy run, *sortie longue* for a long run, *affûtage* for a taper,
 * *allure* for pace, *splits* for splits.
 */
import type { Messages, Translated } from "./en";

export const fr: Translated<Messages> = {
  common: {
    loading: "Chargement…",
    km: "km",
    perKm: "/km",
    dash: "—",
  },

  nav: {
    home: "Accueil Vivace",
    overview: "Aperçu",
    activities: "Activités",
    coach: "Coach",
    signOut: "Se déconnecter",
  },

  theme: {
    switchToLight: "Passer au thème clair",
    switchToDark: "Passer au thème sombre",
  },

  language: {
    label: "Langue",
    change: "Changer de langue",
  },

  soon: "Bientôt",

  login: {
    titleLine1: "Chaque course,",
    titleLine2: "une histoire.",
    body: "Vos activités Strava, rejouées en film vertical à regarder et à partager. Rien à saisir, rien à configurer.",
    continueWithStrava: "Continuer avec Strava",
    footnote:
      "Strava est la seule porte d’entrée. Nous ne publions jamais à votre place.",
    failedTitle: "Échec de la connexion",
    failedFallback: "Échec de la connexion",
    runsToday: "La course aujourd’hui",
    moreSoon: "Vélo, muscu & natation bientôt",
    plateLabel: "Replay 9:16",
    plateCaption: "Sortie du soir · 5 août 2026",
  },

  home: {
    connectedToStrava: "Connecté à Strava",
    connectedToStravaIn: "Connecté à Strava · {{location}}",
    watchYourRuns: "Voir vos courses",
    seasonTotals: "Totaux {{year}}",
    seasonTotalsFallback: "Totaux de la saison",
    statDistance: "Distance · {{year}}",
    statRuns: "Courses",
    statMovingTime: "Temps en mouvement",
    statAvgPace: "Allure moy.",
    truncated:
      "Les totaux couvrent les {{count}} courses les plus récentes renvoyées par Strava.",
    latestActivities: "Dernières activités",
    seeAll: "Tout voir →",
    runsErrorTitle: "Impossible de charger vos courses",
    noRuns:
      "Aucune course pour l’instant — allez en enregistrer une sur Strava et revenez.",
    replay: "Replay →",
    fromStrava: "Depuis Strava",
    profileErrorTitle: "Impossible de charger votre profil",
    loadingProfile: "Chargement de votre profil Strava",
    factAthleteId: "Identifiant athlète",
    factUsername: "Nom d’utilisateur",
    factSex: "Sexe",
    factWeight: "Poids",
    factSubscription: "Abonnement",
    factMemberSince: "Membre depuis",
    stravaSubscriber: "Abonné Strava",
    freePlan: "Offre gratuite",
    moreSports: "Plus de sports",
    moreSportsBody:
      "Les replays sont pensés pour la course d’abord. Le même traitement arrive ensuite pour ceux-ci.",
  },

  sports: {
    run: "Course",
    runs: "Courses",
    ride: "Vélo",
    rides: "Vélo",
    weights: "Musculation",
    swim: "Natation",
    hike: "Rando",
  },

  runs: {
    backToOverview: "Retour à l’aperçu",
    backToList: "Retour à toutes les courses",
    title: "Vos courses",
    syncCount_one: "{{count}} activité · synchronisée depuis Strava",
    syncCount_other: "{{count}} activités · synchronisées depuis Strava",
    listLabel: "Courses",
    replayLabel: "Replay de la course",
    errorTitle: "Impossible de charger vos courses",
    noRuns:
      "Aucune course pour l’instant — allez en enregistrer une sur Strava et revenez.",
    loadRunError: "Impossible de charger cette course",
    loadingReplay: "Chargement du replay…",
    noMapboxToken:
      "Aucun jeton Mapbox configuré — le replay dessine le tracé sur un fond uni. Renseignez <code>VITE_MAPBOX_TOKEN</code> dans <code>apps/web/.env</code> pour obtenir la carte complète.",
  },

  player: {
    play: "Lire le replay",
    pause: "Mettre le replay en pause",
    seek: "Se déplacer dans le replay",
    enterTheatre: "Passer en mode cinéma",
    leaveTheatre: "Quitter le mode cinéma",
    askCoach: "Demander au coach",
    share: "Partager",
    linkCopied: "Lien copié",
    linkCopiedBody: "Toute personne connectée peut ouvrir cette course.",
    shareFailed: "Impossible de partager cette course",
  },

  videoOptions: {
    section: "Options de la vidéo",
    edit: "Modifier",
    hide: "Masquer",
    themeGroup: "Thème de la vidéo",
    templateSelect: "Modèle de vidéo",
    runAsAvatar: "Courir avec votre avatar",
    avatarReady: "Votre photo Strava ouvre le tracé à la place du point.",
    avatarPending: "Vérification de votre profil Strava…",
    avatarFailed: "Votre profil Strava n’a pas pu être lu.",
    avatarMissing: "Ajoutez une photo sur Strava pour l’utiliser.",
  },

  video: {
    template: {
      "run-video": {
        label: "Replay du tracé",
        description:
          "Le tracé se dessine sous les données en direct, caméra sur le coureur. Un seul plan, 9:16.",
      },
      "split-rush": {
        label: "Rush des splits",
        description:
          "Chaque kilomètre en barre, le plus rapide isolé, un verdict pour finir. Aucun GPS nulle part — un tapis de course a droit au même film qu’un tour de parc.",
      },
      "living-poster": {
        label: "Affiche du tracé",
        description:
          "Le tracé dessiné sur une plaque nue, nord en haut, puis figé. Les deux dernières secondes et demie sont une image à encadrer.",
      },
      "minimal-numbers": {
        label: "Chiffres essentiels",
        description:
          "Un chiffre à la fois, plein écran. Ne demande qu’une distance et un temps, donc il s’affiche pour n’importe quelle course.",
      },
    },
    theme: {
      charcoal: {
        label: "Anthracite",
        description:
          "Typo blanche sur noir, illustration cobalt. Le look maison.",
      },
      cream: {
        label: "Crème",
        description:
          "Encre sur papier. Celui qui ressemble à un tirage, pas à un écran.",
      },
      accent: {
        label: "Cobalt",
        description:
          "Les chiffres en cobalt de la marque sur fond noir. Le plus voyant.",
      },
    },
    eligibility: {
      "needs-route": "Nécessite un tracé GPS — absent ici",
      "needs-two-km": "Nécessite au moins 2 km",
      "needs-distance-time": "Nécessite distance et temps de la montre",
    },
  },

  render: {
    loadErrorTitle: "Impossible de charger l’état de la vidéo",
    preparing: "Préparation de votre vidéo…",
    progressLabel: "Progression de la préparation de la vidéo",
    downloadVideo: "Télécharger la vidéo",
    failedTitle: "Impossible de préparer cette vidéo",
    paused: "Les téléchargements vidéo sont en pause pour le moment. Revenez d’ici peu.",
    lastRendered: "Votre dernière vidéo a été créée {{options}}.",
    retry: "Réessayer",
    downloadLast: "Télécharger la dernière vidéo",
    optionTheme: "en {{theme}}",
    optionAvatar: "avec votre avatar",
    optionDot: "avec le point simple",
    optionOther: "avec d’autres options",
  },

  coach: {
    section: "Coach",
    range6: "6 dernières semaines",
    range12: "12 dernières semaines",
    rangeSeason: "Cette saison",
    reading_one: "Lecture de {{count}} course · {{range}}",
    reading_other: "Lecture de {{count}} courses · {{range}}",
    newConversation: "Nouvelle conversation",
    openError: "Impossible d’ouvrir cette conversation",
    loadingConversation: "Chargement de votre conversation…",
    briefingError: "Impossible de lire votre entraînement",

    emptyTitle: "On s’entraîne pour quoi ?",
    emptyBody:
      "Demandez un plan, un affûtage, ou un avis franc sur la semaine passée. Je vois toutes les courses que vous avez synchronisées depuis Strava.",
    errorTitle: "Le coach n’a pas pu répondre",
    grounded: "Fondé sur votre historique Strava · vérifiez ce qui compte",
    planAccepted: "C’est votre semaine. Elle est dans le rail.",
    copy: "Copier",
    copied: "Copié",
    tryAgain: "Réessayer",
    sources: "D’après",
    toolFailed: "{{title}} a échoué : {{error}}",
    workingReading: "Lecture de votre historique Strava",
    workingWriting: "Rédaction",

    suggestions: {
      month: "Comment s’est passé mon entraînement le mois dernier ?",
      planWeek: "Planifie ma semaine",
      easyTooFast: "Mes footings sont-ils trop rapides ?",
      readLongRunSplits: "Analyse ma dernière sortie longue, split par split",
    },
    followUps: {
      readSplitBySplit: "Analyse split par split",
      rampingTooFast: "Est-ce que je monte trop vite ?",
      whyFade: "Pourquoi ai-je faibli ?",
      raceToday: "Quel chrono je vaux aujourd’hui ?",
      capNextWeek: "Plafonne la semaine prochaine",
      raceShape: "Suis-je en forme de course ?",
      missWednesday: "Et si je saute le mercredi ?",
      volumeRamp: "Montre-moi ma montée en volume",
      writeTaper: "Écris mon affûtage",
      paceSunday: "Quelle allure pour dimanche ?",
      readLongRun: "Analyse ma dernière sortie longue",
    },
    tools: {
      getAthleteProfile: "Lecture de votre profil",
      getAthleteContext: "Vérification de votre objectif",
      setAthleteContext: "Mémorisation",
      listRuns: "Lecture de vos courses récentes",
      summariseTraining: "Addition de vos semaines",
      getRunDebrief: "Lecture de cette course",
      getRunSplits: "Lecture split par split",
      getTrainingSignals: "Mesure de votre entraînement",
      predictRaces: "Lecture de vos meilleurs efforts",
      proposeWeek: "Rédaction de votre semaine",
    },
  },

  threads: {
    newConversation: "Nouvelle conversation",
    empty:
      "Rien pour l’instant. Posez une question au coach et elle apparaîtra ici.",
    listLabel: "Conversations",
    today: "Aujourd’hui",
    delete: "Supprimer {{title}}",
    untitled: "conversation",
  },

  composer: {
    placeholder: "Posez une question sur une course, ou / pour les commandes",
    attachRun: "Joindre une course",
    runShort: "Course",
    attachFile: "Joindre un fichier",
    removeAttached: "Retirer la course jointe",
    noRunsSynced: "Aucune course synchronisée depuis Strava.",
    commands: {
      week: { name: "/semaine", desc: "Écrire les sept prochains jours" },
      review: {
        name: "/analyse",
        desc: "Analyser ma dernière sortie longue, split par split",
      },
      race: {
        name: "/chrono",
        desc: "Prédire mes chronos d’après mes meilleurs efforts",
      },
      load: {
        name: "/charge",
        desc: "Vérifier ma montée en volume et mon ratio de charge",
      },
      goal: { name: "/objectif", desc: "Définir ou changer la course objectif" },
    },
  },

  cards: {
    watchReplay: "Voir le replay",
    readSplitBySplit: "Analyse split par split",
    askReadSplits: "Analyse cette course split par split",
    noRouteLine1: "Sans",
    noRouteLine2: "tracé",
    pace: "Allure",
    hr: "FC",
    kmFirst: "Km 1",
    kmLast: "Km {{n}}",
    fadeSlower:
      "La seconde moitié a tourné {{seconds}} s/km plus lentement que la première.",
    negativeSplit:
      "Un negative split — la seconde moitié a tourné {{seconds}} s/km plus vite.",
    evenPacing: "Allure régulière du début à la fin.",
    decoupling: " Découplage aérobie de {{pct}} %",
    decouplingHigh:
      " — la fréquence cardiaque a continué de monter pour tenir cette allure.",
    decouplingOk: ", soit un effort aérobie bien tenu.",
    splitTooltip: "Km {{km}} · {{pace}} /km",
    splitTooltipHr: "Km {{km}} · {{pace}} /km · {{bpm}} bpm",

    weeklyVolume: "Volume hebdomadaire · {{count}} semaines",
    safeRamp: "Montée sûre · moins de {{limit}} % / semaine",
    loadRatio:
      "Le ratio charge aiguë/chronique est de {{ratio}} — {{acute}} km cette semaine contre une moyenne de {{chronic}} km sur quatre semaines.",
    notEnoughHistory: "Pas encore assez d’historique pour un ratio de charge.",
    weekJumped: " La semaine du {{week}} a bondi de {{pct}} %.",

    racePrediction: "Prédiction de chrono",
    fromBestEfforts: "D’après vos meilleurs efforts Strava",
    pr: "RP · {{date}}",
    headlineToday: "{{name}}, aujourd’hui",
    yourTarget: "Votre objectif",
    goalPace: "Allure cible",
    gapToFind:
      "{{gap}} à trouver{{window}}, d’après {{name}} en {{time}} le {{date}}.",
    gapWindow_one: " en {{count}} semaine",
    gapWindow_other: " en {{count}} semaines",
    aheadOfTarget: "Vous avez déjà {{gap}} d’avance sur l’objectif.",
    riegel: "Riegel d’après votre meilleur effort, pas une estimation.",
    setGoalRace: "Définir une course objectif",
    askGoalRace: "Je prépare une course — laisse-moi t’en parler",
    gapSeconds_one: "{{count}} seconde",
    gapSeconds_other: "{{count}} secondes",

    weekOf: "Semaine du {{week}}",
    weekTotals: "{{km}} km · {{quality}} clés",
    accepted: "Acceptée · dans votre semaine",
    acceptWeek: "Accepter cette semaine",
    swapDay: "Changer {{day}}",
    askSwapDay: "Remplace {{day}} par autre chose",
    longRunTo: "Sortie longue → {{day}}",
    askMoveLongRun: "Déplace la sortie longue au {{day}}",
  },

  rail: {
    goalRace: "Course objectif",
    goalRaceEmpty:
      "Le coach planifie autour d’une date. Dites-lui une fois ce que vous préparez et chaque conversation le saura.",
    change: "Changer",
    askChangeGoal: "Je veux changer ma course objectif",
    setGoalRace: "Définir une course objectif",
    askGoalRace: "Je prépare une course — laisse-moi t’en parler",
    noDate: "Pas encore de date",
    toGo: "Reste",
    target: "Objectif",
    longDay: "Jour long",
    weeks: "{{count}} sem.",
    remembers:
      "Le coach s’en souvient dans chaque conversation — vous ne réexpliquez jamais ce que vous préparez.",
    thisWeek: "Cette semaine",
    noWeek:
      "Aucune semaine acceptée. Demandez-en une et elle arrive ici en séances, pas en paragraphe.",
    planMyWeek: "Planifie ma semaine",
    weekProgress: "{{actual}} sur {{planned}} km · ",
    weekComplete: "semaine terminée",
    sessionsLeft_one: "{{count}} séance restante",
    sessionsLeft_other: "{{count}} séances restantes",
    dayTooltip: "{{day}} · {{type}} · {{actual}} sur {{planned}} km",
    signals: "Signaux",
    tapSignal: "Touchez un signal pour poser la question.",
    queue: "File du coach",
  },

  days: {
    short: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
    initial: ["L", "M", "M", "J", "V", "S", "D"],
    long: [
      "lundi",
      "mardi",
      "mercredi",
      "jeudi",
      "vendredi",
      "samedi",
      "dimanche",
    ],
  },

  ai: {
    thinking: "Réflexion…",
    thoughtFor: "A réfléchi pendant {{count}} secondes",
    thoughtBriefly: "A réfléchi quelques secondes",
    send: "Envoyer",
    stop: "Arrêter",
    addAttachments: "Ajouter des photos ou des fichiers",
    uploadFiles: "Téléverser des fichiers",
    removeAttachment: "Retirer",
    noAttachments: "Aucune pièce jointe",
    filesTooLarge: "Tous les fichiers dépassent la taille maximale.",
    tooManyFiles: "Trop de fichiers. Certains n’ont pas été ajoutés.",
    filesNotAccepted: "Aucun fichier ne correspond aux types acceptés.",
  },

  errorBoundary: {
    title: "Une erreur est survenue",
    body: "La page a cessé de fonctionner. Nous avons enregistré ce qui s’est passé — recharger suffit généralement à repartir.",
    reload: "Recharger l’application",
  },
};
