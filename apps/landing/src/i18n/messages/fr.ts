/**
 * Every word on the landing page, in French.
 *
 * Typed against `en.ts`: a key added there and missed here is a typecheck
 * failure. The same two conventions as `apps/web`'s catalogue apply — the
 * typographic apostrophe (’), and an ordinary space before `? ! ; :` and `%`
 * rather than an invisible U+202F that the next editor would not reproduce.
 */
import type { Dictionary, Translated } from "./en";

export const fr: Translated<Dictionary> = {
  meta: {
    title: "Transformez vos courses Strava en vidéos | Vivace",
    description:
      "Connectez Strava et transformez chaque course en film vertical avec tracé, allure et fréquence cardiaque. Téléchargez un MP4 prêt à partager.",
    ogTitle: "Vivace — vos courses Strava, prêtes à partager",
    ogDescription:
      "Transformez une course Strava en film vertical avec tracé animé, effort en direct et MP4 à télécharger.",
    imageAlt:
      "Vivace transforme les courses Strava en vidéos verticales avec tracé, allure et fréquence cardiaque.",
  },

  header: {
    backToTop: "Vivace — accueil",
    film: "Le film",
    sports: "Sports",
    coach: "Coach",
    questions: "Questions",
    logIn: "Se connecter",
    connectStrava: "Connecter Strava",
  },

  language: {
    label: "Langue",
    switchTo: "Lire cette page en {{language}}",
  },

  soon: "Bientôt",

  hero: {
    badge: "La course aujourd’hui · vélo, muscu & natation ensuite",
    titleLine1: "Vos courses Strava,",
    titleLine2: "prêtes à partager.",
    body: "Connectez Strava et transformez chaque course en film vertical — le tracé se dessine, l’allure et la fréquence cardiaque défilent, puis le MP4 est prêt à partager.",
    primaryCta: "Continuer avec Strava",
    secondaryCta: "Voir un replay",
    footnote:
      "Gratuit pendant l’alpha. Nous ne publions jamais sur Strava à votre place.",
    replay: {
      alt: "Le replay vertical d’une sortie du soir de 3,16 km : le tracé se dessine pendant que la distance, le temps, l’allure et la fréquence cardiaque défilent, puis la carte récapitulative apparaît.",
      format: "9:16 · Prêt pour les stories",
      date: "5 août 2026",
      title: "Sortie du soir",
      summaryDate: "MER 5 AOÛT · 20:18",
      time: "Temps",
      pace: "Allure",
      bpm: "BPM",
      distance: "Distance",
      // What a French runner actually calls it — dénivelé positif.
      elevation: "D+",
    },
  },

  howItWorks: {
    label: "Comment ça marche",
    steps: [
      {
        step: "01",
        title: "Connecter Strava",
        body: "Un geste. C’est la seule connexion — pas de second mot de passe à retenir.",
      },
      {
        step: "02",
        title: "Choisir une course",
        body: "Tout votre historique arrive en liste — GPS, splits et fréquence cardiaque compris.",
      },
      {
        step: "03",
        title: "La revoir",
        body: "Le replay se génère en quelques secondes. Regardez-le, téléchargez le MP4, publiez-le.",
      },
    ],
  },

  film: {
    heading: "Quatre chapitres, vingt secondes.",
    body: "Chaque replay est monté de la même façon, pour que ce soit la course qui change — pas le format.",
    chapters: [
      {
        label: "01 · Titre",
        title: "Le carton",
        body: "Nom, date et heure de la journée, posés comme un carton-titre.",
      },
      {
        label: "02 · Tracé",
        title: "La ligne",
        body: "Votre trace GPS se dessine pendant que distance, temps et allure défilent.",
      },
      {
        label: "03 · Effort",
        title: "Le prix",
        body: "La fréquence cardiaque le long du parcours, split par split — là où ça a fait mal.",
      },
      {
        label: "04 · Bilan",
        title: "Le reçu",
        body: "Quatre chiffres, assez grands pour se lire d’un coup d’œil sur un téléphone.",
      },
    ],
    cta: "Créer mon premier replay",
    note: "Rendu en 1080 × 1920 · téléchargement MP4 inclus",
  },

  sports: {
    heading: "La course d’abord. Le reste ensuite.",
    body: "Nous avons construit le replay pour la course en premier parce que c’est le plus difficile à rendre beau. Le même traitement arrivera pour le reste de vos activités Strava au fil de l’eau.",
    live: "Dispo",
    items: [
      {
        name: "Course",
        body: "Tracé, splits, fréquence cardiaque, dénivelé.",
        live: true,
      },
      {
        name: "Vélo",
        body: "Vitesse, ascensions, puissance quand vous l’avez.",
        live: false,
      },
      {
        name: "Musculation",
        body: "Séries, charge déplacée, volume de séance.",
        live: false,
      },
      {
        name: "Natation & rando",
        body: "Longueurs, allure au 100 m, profil du sentier.",
        live: false,
      },
    ],
  },

  coach: {
    badge: "Bientôt",
    heading: "Un coach qui a lu toutes vos courses.",
    body: "Demandez un plan, un affûtage, ou un avis franc sur la semaine passée. Il voit le même historique que celui dont sont faits les replays — et répond par quelque chose que vous pouvez courir demain.",
    emailLabel: "Adresse e-mail",
    emailPlaceholder: "vous@email.com",
    submit: "Rejoindre la liste",
    conversation: [
      {
        from: "runner",
        text: "Semi-marathon en octobre. Je suis à 40 km par semaine — je commence par quoi ?",
      },
      {
        from: "coach",
        text: "Vos quatre dernières semaines tournent à 5:33 /km et bougent à peine — c’est une base, donc on ajoute du volume avant la vitesse. Douze semaines : trois footings, une sortie longue, du tempo à partir de la semaine trois.",
      },
      {
        from: "coach",
        text: "Semaine 1 · sortie longue dimanche, 14 km à 6:05 /km.",
      },
    ],
  },

  questions: {
    heading: "Les questions que posent les coureurs",
    items: [
      {
        q: "Pourquoi Strava uniquement ?",
        a: "Vos courses y sont déjà, avec le GPS et la fréquence cardiaque. Se connecter avec Strava, c’est n’avoir rien à importer et aucune donnée à ressaisir.",
      },
      {
        q: "Publiez-vous quelque chose sur mon Strava ?",
        a: "Non. Nous lisons vos activités et n’écrivons jamais. Vous pouvez révoquer Vivace dans Strava à tout moment pour couper les futurs accès, puis nous contacter pour supprimer les données Vivace et fichiers déjà conservés.",
      },
      {
        q: "Et si une course n’a ni fréquence cardiaque ni GPS ?",
        a: "Le film s’adapte — les sorties sur tapis abandonnent le chapitre carte et s’appuient sur les splits et l’effort. Rien n’est inventé.",
      },
      {
        q: "Quelle différence avec Strava Flyover ?",
        a: "Strava Flyover permet d’explorer une activité sur une carte 3D dans Strava. Vivace crée un film vertical fixe de 20 secondes avec tracé, allure, fréquence cardiaque et bilan, puis fournit un MP4 à partager partout.",
      },
      {
        q: "Combien ça coûte ?",
        a: "Rien pendant l’alpha. Quand les tarifs arriveront, les courses que vous avez déjà rejouées resteront les vôtres.",
      },
    ],
  },

  closingCta: {
    label: "Commencer",
    heading: "Votre dernière course mérite mieux qu’un chiffre.",
    body: "Connectez Strava et le premier replay est prêt avant que vous ayez fini de vous étirer.",
    cta: "Continuer avec Strava",
  },

  footer: {
    tagline: "Des replays pour les courses que vous avez déjà faites.",
    logIn: "Se connecter",
    poweredByStrava: "Propulsé par Strava",
    copyright: "© {{year}} vivace. Sans affiliation avec Strava, Inc.",
    product: {
      heading: "Produit",
      film: "Le film",
      sports: "Sports",
      coach: "Coach",
    },
    company: {
      heading: "Entreprise",
      about: "À propos",
      questions: "Questions",
      contact: "Contact",
    },
    legal: {
      heading: "Mentions légales",
      privacy: "Confidentialité",
      terms: "Conditions",
      stravaData: "Utilisation des données Strava",
    },
  },
};
