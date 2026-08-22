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
    close: "Fermer",
  },

  nav: {
    home: "Accueil Vivace",
    overview: "Aperçu",
    // *Replays* est le mot déjà employé partout ailleurs dans l’app — sur la
    // ligne d’activité, sur la plaque de connexion — et il n’est pas traduit :
    // les coureurs francophones disent replay.
    replays: "Replays",
    coach: "Coach",
    account: "Compte",
    help: "Aide",
    signOut: "Se déconnecter",
    menu: "Menu",
  },

  footer: {
    about: "À propos",
    privacy: "Confidentialité",
    terms: "Conditions",
    stravaData: "Vos données Strava",
    contact: "Contact",
    poweredByStrava: "Propulsé par Strava",
  },

  notFound: {
    eyebrow: "404",
    title: "Il n’y a rien à cette adresse.",
    body: "Le lien est peut-être périmé, ou l’adresse comporte une faute de frappe. Tout ce que fait Vivace se trouve derrière l’un de ces boutons.",
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
  new: "Nouveau",

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
    watchYourRuns: "Voir vos replays",
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
    replay: "Replay →",

    coachEyebrow: "Coach IA",
    coachTitle: "Votre entraînement, relu pour vous",
    coachBody:
      "Il a déjà lu vos dernières semaines — volume, splits, fréquence cardiaque. Demandez-lui où en est le bloc, ou quoi courir cette semaine.",
    coachBodyRace:
      "Chaque réponse est calée sur cette date. Posez-lui n’importe quelle question.",
    coachStart: "Parler à votre coach",
    coachOpen: "Ouvrir le coach",

    emptyTitle: "Rien de synchronisé depuis Strava",
    emptyBody:
      "Vos courses apparaissent ici dans la minute qui suit leur enregistrement sur Strava — il n’y a rien à importer. Le coach fonctionne déjà sans elles.",
    emptyOpenStrava: "Ouvrir Strava",
    emptyAskCoach: "Parler à votre coach",

    fromStrava: "Depuis Strava",
    profileErrorTitle: "Impossible de charger votre profil",
    loadingProfile: "Chargement de votre profil Strava",
    factUsername: "Nom d’utilisateur",
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

  replays: {
    backToOverview: "Retour à l’aperçu",
    backToList: "Retour à toutes les courses",
    title: "Vos replays",
    syncCount_one: "{{count}} activité · synchronisée depuis Strava",
    syncCount_other: "{{count}} activités · synchronisées depuis Strava",
    listLabel: "Courses",
    replayLabel: "Replay de la course",
    errorTitle: "Impossible de charger vos courses",
    emptyTitle: "Aucun replay pour l’instant",
    emptyBody:
      "Un replay se fabrique à partir d’une course : le premier arrivera avec votre prochaine activité sur Strava.",
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
    themeGroup: "Thème de la vidéo",
    templateSelect: "Modèle de vidéo",
    runAsAvatar: "Courir avec votre avatar",
    avatarReady: "Votre photo Strava ouvre le tracé à la place du point.",
    avatarPending: "Vérification de votre profil Strava…",
    avatarFailed: "Votre profil Strava n’a pas pu être lu.",
    avatarMissing: "Ajoutez une photo sur Strava pour l’utiliser.",
    you: "Vous",
    greenscreen: "Fond vert",
    greenscreenHint:
      "Rend le fond en vert incrustable : détourez-le et mettez votre propre vidéo derrière la course.",
    greenscreenMap:
      "Remplace la carte par du vert incrustable : détourez-le et faites courir le tracé sur votre propre vidéo.",
  },

  video: {
    template: {
      "run-video": {
        label: "Replay du tracé",
        description:
          "Le tracé se dessine sous les données en direct, caméra sur le coureur. Un seul plan, 9:16.",
      },
      "duo-replay": {
        label: "Replay à deux",
        description:
          "Vos deux tracés se dessinent en même temps sur une seule carte, chaque prénom accroché à son tracé, avec une barre de données en direct pour chacun en dessous. Nécessite que quelqu’un ait accepté l’invitation sur cette sortie.",
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
      "needs-partner": "Nécessite qu’un partenaire accepte l’invitation",
    },
  },

  invite: {
    action: "Ajouter votre partenaire de course",
    creating: "Création du lien…",
    createFailed: "Impossible de créer le lien d’invitation",
    linkCopied: "Lien d’invitation copié",
    linkCopiedBody:
      "Envoyez-le à la personne avec qui vous avez couru. Elle confirme sa sortie, et la vidéo vous réunit tous les deux.",
    shareTitle: "Rejoignez ma vidéo de course",
    hint: "Ajoutez ici votre partenaire de course",
    pendingTitle: "En attente de votre partenaire",
    pendingBody:
      "Le lien reste actif {{days}} jours. La personne qui l’ouvre confirme quelle sortie était la sienne.",
    copyAgain: "Copier le lien",
    check: "Vérifier la réponse",
    checkPending: "Toujours pas de réponse",
    revoke: "Annuler l’invitation",
    revokeFailed: "Impossible d’annuler l’invitation",
    acceptedTitle: "{{name}} est de la partie",
    acceptedBody:
      "Sa sortie est confirmée, et la vidéo vous réunit tous les deux.",
    remove: "Retirer {{name}}",
    removed: "{{name}} n’apparaît plus dans cette vidéo",
    removedBody:
      "Invitez plutôt la personne avec qui vous avez couru — elle confirme sa propre sortie, comme précédemment.",
    removeFailed: "Impossible de retirer {{name}}",
    declinedTitle: "{{name}} a refusé",
    declinedBody:
      "Rien n’a été partagé. Vous pouvez inviter quelqu’un d’autre.",
    expiredTitle: "Ce lien a expiré",
    expiredBody: "Vous pouvez en créer un nouveau quand vous voulez.",

    accept: {
      loading: "Ouverture de l’invitation…",
      invalidTitle: "Cette invitation n’est pas valide",
      invalidBody:
        "Le lien a peut-être été retiré, déjà utilisé, ou mal recopié. Demandez-en un nouveau.",
      title: "{{name}} veut vous voir dans sa vidéo de course",
      runLine: "{{name}} · {{date}} · {{distance}} km · {{duration}}",
      whatHappens:
        "Vivace crée une courte vidéo à partir d’une sortie. Pour vous y intégrer, il nous faut votre sortie depuis votre propre Strava — vous devez donc vous connecter avec Strava.",
      connect: "Continuer avec Strava",
      decline: "Non merci",
      declineFailed: "Impossible de refuser cette invitation",

      pickTitle: "Quelle sortie était la vôtre ?",
      pickBody: "Choisissez la sortie que vous avez faite ensemble.",
      pickEmptyTitle: "Aucune sortie correspondante",
      pickEmptyBody:
        "Rien dans votre Strava ne correspond à ce jour et à cette heure. Si vous l’avez enregistrée ailleurs, il n’y a rien à associer ici.",
      pickFailed: "Impossible de lire vos sorties",

      consent:
        "J’accepte que la distance, le temps, l’allure et le tracé de ma sortie apparaissent dans la vidéo de {{name}}.",
      confirm: "Créer la vidéo ensemble",
      confirming: "Configuration…",
      confirmFailed: "Impossible d’accepter cette invitation",

      doneTitle: "C’est fait",
      doneBody:
        "{{name}} peut maintenant créer la vidéo avec vos deux sorties. Vous la retrouverez aussi dans vos propres replays.",
      goToApp: "Voir mes replays",

      closedTitle: "Cette invitation est close",
      closedBody: "Elle a déjà reçu une réponse, a été retirée, ou a expiré.",
      ownTitle: "C’est votre propre invitation",
      ownBody: "Envoyez plutôt le lien à la personne avec qui vous avez couru.",
      withdrawNote:
        "Vous changez d’avis plus tard ? Déconnecter Strava de Vivace retire aussi cet accord.",
    },
  },

  render: {
    loadErrorTitle: "Impossible de charger l’état de la vidéo",
    preparing: "Préparation de votre vidéo…",
    preparingPercent: "Préparation de votre vidéo… {{percent}} %",
    progressLabel: "Progression de la préparation de la vidéo",
    downloadVideo: "Télécharger la vidéo",
    failedTitle: "Impossible de préparer cette vidéo",
    paused:
      "Les téléchargements vidéo sont en pause pour le moment. Revenez d’ici peu.",
    retry: "Réessayer",
  },

  coach: {
    section: "Coach",
    rangeSelect: "Jusqu’où le coach remonte",
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
    errors: {
      notConfigured:
        "Le coach n’est pas disponible dans cette application pour le moment.",
      rateLimited:
        "Le coach répond à beaucoup de questions en ce moment. Patientez une minute et redemandez.",
      unavailable:
        "Le coach est injoignable pour le moment. Réessayez dans un instant.",
      failed:
        "Une erreur s’est produite pendant la rédaction de la réponse. Reposez votre question.",
    },
    planAccepted: "C’est votre semaine. Elle est dans le rail.",
    copy: "Copier",
    copied: "Copié",
    tryAgain: "Réessayer",
    edit: "Modifier",
    editLabel: "Modifier votre message",
    editCancel: "Annuler",
    editSend: "Redemander",
    helpful: "Utile",
    notHelpful: "Pas utile",
    feedbackPlaceholder: "Qu’est-ce qui n’allait pas ? (facultatif)",
    feedbackSend: "Envoyer",
    feedbackThanks: "Merci — c’est noté.",
    sources: "D’après",
    steps_one: "{{count}} étape",
    steps_other: "{{count}} étapes",
    toolFailed: "{{title}} a échoué",
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
      askAthlete: "Une question pour vous",
    },
  },

  threads: {
    newConversation: "Nouvelle conversation",
    empty:
      "Rien pour l’instant. Posez une question au coach et elle apparaîtra ici.",
    listLabel: "Conversations",
    today: "Aujourd’hui",
    pin: "Épingler {{title}}",
    unpin: "Désépingler {{title}}",
    delete: "Supprimer {{title}}",
    menu: {
      options: "Options pour {{title}}",
      pin: "Épingler",
      unpin: "Désépingler",
      delete: "Supprimer",
    },
    confirmDelete: {
      title: "Supprimer cette conversation ?",
      body: "Cela supprime {{title}} et tous ses messages. C’est définitif.",
      confirm: "Supprimer",
      cancel: "Annuler",
    },
    untitled: "conversation",
    pinned: "Épinglées",
    recent: "Récentes",
  },

  composer: {
    placeholder:
      "Posez une question — @ pour citer une course, / pour les commandes",
    attachRun: "Joindre une course",
    runShort: "Course",
    attachFile: "Joindre un fichier",
    removeAttached: "Retirer la course jointe",
    noRunsSynced: "Aucune course synchronisée depuis Strava.",
    noRunsMatch: "Aucune course ne correspond à « {{query}} ».",
    runList: "Courses à joindre",
    commandList: "Commandes du coach",
    keyMove: "Naviguer",
    keySelect: "Choisir",
    keyClose: "Fermer",
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
      goal: {
        name: "/objectif",
        desc: "Définir ou changer la course objectif",
      },
    },
    dictation: {
      start: "Dicter",
      stop: "Arrêter la dictée",
      listening: "Écoute en cours",
      errors: {
        denied:
          "L’accès au micro est bloqué. Autorisez-le dans les réglages du navigateur pour dicter.",
        noMicrophone: "Aucun micro détecté.",
        network: "La dictée a besoin d’une connexion, et celle-ci a lâché.",
        failed: "La dictée s’est arrêtée. Écrivez la question à la place.",
      },
    },
  },

  help: {
    label: "Qu’est-ce que je regarde ?",

    week: {
      title: "Votre semaine",
      ran: "Ce que vous avez couru",
      todo: "Encore à courir",
      missed: "Manquée — ce jour est passé",
      note: "Chaque séance est écrite sous le graphique avec sa distance et son allure.",
    },
    goal: {
      title: "Votre course objectif",
      week: "Une semaine à courir",
      taper: "Semaine d’affûtage",
      note: "L’affûtage consiste à réduire le volume pour arriver frais plutôt qu’en forme mais fatigué. Le coach planifie le vôtre dans les trois dernières semaines.",
    },
    splits: {
      title: "Vos splits",
      normal: "Un kilomètre proche de votre meilleur",
      slow: "Bien en deçà de votre meilleur kilomètre",
      hr: "Fréquence cardiaque",
      note: "Le découplage compare l’allure à la fréquence cardiaque, première moitié de la sortie contre seconde. Au-delà de 5 %, votre fréquence montait pour tenir l’allure.",
    },
    volume: {
      title: "Volume hebdomadaire",
      normal: "Les kilomètres d’une semaine",
      spike: "Plus de 25 % de hausse sur la semaine précédente",
      note: "La charge aiguë/chronique met vos 7 derniers jours face à vos 28 derniers. Au-delà de 1,3, vous ajoutez de la charge plus vite que vous ne vous y adaptez.",
    },
    prediction: {
      title: "Prédiction de course",
      pr: "Un record personnel",
      target: "Votre temps visé, et l’allure qu’il exige",
      behind: "En retard sur cet objectif aujourd’hui",
      note: "Riegel étend un résultat d’une distance à une autre. Il lit votre moteur du jour, pas si vous avez fait les sorties longues.",
    },
    plan: {
      title: "Cette semaine",
      key: "Une séance clé — la semaine est bâtie dessus",
      other: "Tout le reste",
      note: "Déplacez librement les jours faciles. Demandez avant de déplacer une séance clé — c’est à ça que servent les boutons d’échange.",
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
    acceptingWeek: "Ajout à votre semaine…",
    swapDay: "Changer {{day}}",
    askSwapDay: "Remplace {{day}} par autre chose",
    longRunTo: "Sortie longue → {{day}}",
    askMoveLongRun: "Déplace la sortie longue au {{day}}",

    questionnaire: "Questions",
    questionnaireStep: "{{current}} sur {{total}}",
    questionnairePrevious: "Retour",
    questionnaireSkip: "Passer",
    questionnaireNext: "Suivant",
    questionnaireSend: "Envoyer",
    questionnaireOther: "Autre chose…",
    questionnaireAnswerOrSkip: "Répondez à celle-ci, ou passez-la.",
    questionnaireAwaiting: "En attente de votre réponse",
    questionnaireAnswered: "Répondu",
    questionnaireAnswers: "Voici mes réponses :",
    questionnaireSkipped: "passée",
  },

  rail: {
    title: "Objectifs et signaux",
    goalRace: "Course objectif",
    goalRaceEmpty:
      "Le coach planifie autour d’une date. Dites-lui une fois ce que vous préparez et chaque conversation le saura.",
    change: "Changer",
    askChangeGoal: "Je veux changer ma course objectif",
    setGoalRace: "Définir une course objectif",
    askGoalRace: "Je prépare une course — laisse-moi t’en parler",
    goalHint: "Définissez ici votre course objectif",
    noDate: "Pas encore de date",
    target: "Objectif",
    longDay: "Jour long",
    weeksToGo_one: "Plus qu’une semaine",
    weeksToGo_other: "Plus que {{count}} semaines",
    daysToGo_one: "Demain",
    daysToGo_other: "Plus que {{count}} jours",
    raceToday: "Jour de course",
    raceRun: "Cette course a été courue",
    setNextRace: "Définir la prochaine",
    taperIn_one: "L’affûtage commence la semaine prochaine",
    taperIn_other: "L’affûtage commence dans {{count}} semaines",
    taperNow: "Vous êtes en phase d’affûtage",
    race5k: "5 km",
    race10k: "10 km",
    raceHalf: "Semi-marathon",
    raceMarathon: "Marathon",
    remembersLabel: "À retenir",
    remembers:
      "Le coach s’en souvient dans chaque conversation — vous ne réexpliquez jamais ce que vous préparez.",
    thisWeek: "Cette semaine",
    noWeek:
      "Aucune semaine acceptée. Demandez-en une et elle arrive ici en séances, pas en paragraphe.",
    planMyWeek: "Planifie ma semaine",
    adjust: "Ajuster",
    askAdjustWeek: "Ajuste ma semaine",
    weekProgress: "{{actual}} sur {{planned}} km",
    weekComplete: "Semaine terminée",
    sessionsLeft_one: "{{count}} séance restante",
    sessionsLeft_other: "{{count}} séances restantes",
    today: "Aujourd’hui",
    dayRest: "{{day}} · jour de repos",
    dayDone: "{{day}} · {{type}} · {{actual}} km courus sur {{planned}}",
    dayTodo: "{{day}} · {{type}} · {{planned}} km encore à courir",
    dayMissed: "{{day}} · {{type}} · {{planned}} km non courus",
    unplanned: "Non prévue",
    dayUnplanned: "{{day}} · non prévue · {{actual}} km courus",
    dayRanAt: "à {{pace}} /km",
    dayAtPace: "objectif {{pace}} /km",
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
