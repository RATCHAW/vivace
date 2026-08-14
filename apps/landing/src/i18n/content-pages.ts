import { LOCALES, type Locale } from "./config";

export const CONTENT_PAGE_KEYS = [
  "about",
  "contact",
  "privacy",
  "terms",
  "stravaData",
] as const;

export type ContentPageKey = (typeof CONTENT_PAGE_KEYS)[number];

export const CONTENT_PAGE_ROUTES: Record<
  Locale,
  Record<ContentPageKey, string>
> = {
  en: {
    about: "about",
    contact: "contact",
    privacy: "privacy",
    terms: "terms",
    stravaData: "strava-data",
  },
  fr: {
    about: "a-propos",
    contact: "contact",
    privacy: "confidentialite",
    terms: "conditions",
    stravaData: "donnees-strava",
  },
};

export interface ContentPageLink {
  href: string;
  label: string;
}

export interface ContentPageSection {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  links?: readonly ContentPageLink[];
}

export interface ContentPage {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  lead: string;
  updated?: string;
  sections: readonly ContentPageSection[];
  backHome: string;
}

const en: Record<ContentPageKey, ContentPage> = {
  about: {
    title: "About Vivace | Strava Run Videos",
    description:
      "Vivace turns Strava runs into shareable vertical films with an animated route, live effort and a clean summary.",
    eyebrow: "About Vivace",
    heading: "Runs deserve a finish line after the finish line.",
    lead:
      "Vivace turns the activity already in Strava into a short vertical film that feels worth watching and sharing.",
    sections: [
      {
        heading: "What Vivace makes",
        paragraphs: [
          "A replay follows the run as it happened: the route draws, distance and pace move with it, heart rate shows where the effort changed, and the final numbers land as a summary.",
          "Each film is rendered as a 1080 × 1920 MP4, ready for a phone, a story or a reel without another editing app.",
        ],
      },
      {
        heading: "Why it starts with running",
        paragraphs: [
          "Running is where route, splits, elevation and effort tell the clearest story together. Starting there lets the format stay simple while the activity remains personal.",
        ],
      },
      {
        heading: "What comes next",
        paragraphs: [
          "Rides, strength sessions, swims and hikes are on the roadmap. They will ship only when their replays are as useful and legible as the running film.",
        ],
      },
    ],
    backHome: "See how Vivace works",
  },
  contact: {
    title: "Contact Vivace",
    description:
      "Contact Vivace for product support, privacy and Strava data requests, or partnership questions.",
    eyebrow: "Contact",
    heading: "Talk to a human.",
    lead:
      "Questions, rough edges and privacy requests all reach the same inbox: hello@vivace.run.",
    sections: [
      {
        heading: "Product support",
        paragraphs: [
          "Tell us what happened, which browser or device you used, and the run or screen involved. Do not email access tokens, passwords or other secrets.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Vivace%20support",
            label: "Email product support",
          },
        ],
      },
      {
        heading: "Privacy and data requests",
        paragraphs: [
          "Use the privacy subject line if you want to access, correct or delete data connected to your Vivace account. We may need to verify that the Strava account is yours before acting.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Vivace%20privacy%20request",
            label: "Send a privacy request",
          },
        ],
      },
      {
        heading: "Partnerships",
        paragraphs: [
          "For clubs, races, coaches or product partnerships, include a short description and the best way to reach you.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Vivace%20partnership",
            label: "Discuss a partnership",
          },
        ],
      },
    ],
    backHome: "Back to Vivace",
  },
  privacy: {
    title: "Privacy | Vivace",
    description:
      "How Vivace collects, uses, stores and deletes account, Strava, video, coach and analytics data.",
    eyebrow: "Privacy",
    heading: "Privacy, in plain language.",
    lead:
      "Vivace uses your information to show your own activities, make your films and provide the features you choose. We do not sell your personal data.",
    updated: "Last updated 14 August 2026",
    sections: [
      {
        heading: "Information we receive",
        paragraphs: [
          "When you connect Strava, Strava sends us an account identifier, basic profile information and OAuth tokens. The permissions you approve can let Vivace read your activities, including activities marked private, plus route streams, heart rate, gear and profile details such as location or weight when available.",
          "Vivace also receives information you create in the product, such as render choices, coach conversations, goals and accepted plans. Operational logs record requests, errors and security events. The locale cookie remembers whether you chose English or French.",
        ],
      },
      {
        heading: "How we use it",
        paragraphs: [
          "We use this information to sign you in, list your runs, create and deliver replay videos, answer coach questions, maintain the service, prevent abuse and understand whether features work.",
          "We do not post activities or edits to Strava. We use read permissions only.",
        ],
      },
      {
        heading: "Storage and service providers",
        paragraphs: [
          "Account and product records are stored in Vivace's database. Rendered MP4 files are produced with Remotion on AWS and stored in S3. A generated file can be accessible to anyone who has its public URL, so share that URL as you would share the video itself.",
          "The coach uses Google's AI service to generate answers from the context needed for your request. PostHog may process product analytics, error information and masked landing-page sessions when analytics is enabled. Hosting, database and logging providers process the information needed to operate the service.",
        ],
      },
      {
        heading: "Retention and your choices",
        paragraphs: [
          "Disconnecting Vivace in Strava revokes future API access. To request deletion of existing Vivace account records, coach data and generated files, email us. We will confirm the request and tell you when deletion is complete.",
          "We may retain limited security, fraud-prevention or legal records where required, and Strava webhook delivery records are routinely pruned. We keep other information only while it is needed for the purpose described here or until you request deletion.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Vivace%20privacy%20request",
            label: "Request access, correction or deletion",
          },
        ],
      },
      {
        heading: "Questions",
        paragraphs: [
          "Email hello@vivace.run with a privacy question. We may update this page when the product, providers or legal requirements change; the date above will change with it.",
        ],
      },
    ],
    backHome: "Back to Vivace",
  },
  terms: {
    title: "Terms | Vivace",
    description:
      "The terms for using the Vivace alpha, connecting Strava and creating shareable run replay videos.",
    eyebrow: "Terms",
    heading: "Terms for the Vivace alpha.",
    lead:
      "These terms describe the current alpha service. By using Vivace, you agree to use it responsibly and only with accounts and activity data you are allowed to access.",
    updated: "Last updated 14 August 2026",
    sections: [
      {
        heading: "Your account",
        paragraphs: [
          "You sign in through Strava and are responsible for keeping that account secure. Do not share access to Vivace in a way that exposes another athlete's private data.",
        ],
      },
      {
        heading: "Your data and films",
        paragraphs: [
          "You keep your rights in your activity data and the films generated from it. You give Vivace permission to process that material only as needed to provide, secure and improve the service.",
          "You decide where to share an exported film. Do not publish content that violates privacy, intellectual-property or other applicable rights.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "Do not misuse the service, bypass access controls, overload the API or rendering systems, reverse engineer protected parts of the service, or use Vivace to access data that is not yours.",
        ],
      },
      {
        heading: "Alpha availability",
        paragraphs: [
          "Vivace is an alpha product. Features, limits and pricing may change, and the service may be interrupted or withdrawn. We will try to protect existing work and communicate material changes, but we cannot promise uninterrupted availability.",
        ],
      },
      {
        heading: "Third-party services",
        paragraphs: [
          "Vivace depends on Strava and other providers. Their own terms govern your use of their services, and changes or outages outside Vivace can affect what the product can do.",
        ],
      },
      {
        heading: "Liability and contact",
        paragraphs: [
          "Vivace is provided as available during the alpha, without warranties beyond those that cannot legally be excluded. Nothing here limits rights or liability that applicable law does not allow us to limit.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Vivace%20terms",
            label: "Ask about these terms",
          },
        ],
      },
    ],
    backHome: "Back to Vivace",
  },
  stravaData: {
    title: "Strava Data Use | Vivace",
    description:
      "Which Strava permissions Vivace requests, what activity data it reads, and how to disconnect or request deletion.",
    eyebrow: "Strava data use",
    heading: "Your Strava data stays about you.",
    lead:
      "Vivace reads the data needed to show your history, make your films and answer your own training questions. It does not write to your Strava account.",
    updated: "Last updated 14 August 2026",
    sections: [
      {
        heading: "Permissions requested",
        paragraphs: [
          "Vivace requests Strava's read, activity:read_all and profile:read_all permissions. These can include your basic profile, private and public activities, GPS and sensor streams, heart rate, gear, location and weight when Strava makes them available.",
        ],
      },
      {
        heading: "What Vivace does with the data",
        paragraphs: [
          "The app uses it to list your own activities, calculate the replay frames, render MP4 files and provide training context to features you choose to use. We do not sell Strava data, post to Strava or expose your raw activity data to other Vivace users.",
        ],
      },
      {
        heading: "Films and sharing",
        paragraphs: [
          "A film is created for you from your activity. The finished MP4 may have a public file URL so that you can download or share it. Treat that link as shareable: anyone who receives it may be able to open the file.",
        ],
      },
      {
        heading: "Disconnect and delete",
        paragraphs: [
          "You can revoke Vivace from Strava's connected-app settings at any time. That stops future Strava API access. Email us separately if you want existing Vivace records and generated files deleted; we will verify the request and confirm completion.",
        ],
        links: [
          {
            href: "https://www.strava.com/settings/my-apps",
            label: "Open Strava connected-app settings",
          },
          {
            href: "mailto:hello@vivace.run?subject=Vivace%20data%20deletion",
            label: "Request Vivace data deletion",
          },
        ],
      },
      {
        heading: "Independent services",
        paragraphs: [
          "Vivace is not affiliated with Strava, Inc. Strava's own terms and privacy policy continue to govern your Strava account and data on Strava.",
        ],
      },
    ],
    backHome: "Back to Vivace",
  },
};

const fr: Record<ContentPageKey, ContentPage> = {
  about: {
    title: "À propos de Vivace | Vidéos de course Strava",
    description:
      "Vivace transforme les courses Strava en films verticaux à partager, avec tracé animé, effort en direct et bilan clair.",
    eyebrow: "À propos de Vivace",
    heading: "Une course mérite une suite après la ligne d’arrivée.",
    lead:
      "Vivace transforme l’activité déjà présente dans Strava en un court film vertical qui mérite d’être regardé et partagé.",
    sections: [
      {
        heading: "Ce que crée Vivace",
        paragraphs: [
          "Le replay suit la course telle qu’elle s’est passée : le tracé se dessine, la distance et l’allure avancent avec lui, la fréquence cardiaque montre où l’effort change, puis les chiffres finaux composent le bilan.",
          "Chaque film est rendu en MP4 1080 × 1920, prêt pour un téléphone, une story ou un reel sans autre application de montage.",
        ],
      },
      {
        heading: "Pourquoi commencer par la course",
        paragraphs: [
          "La course est l’activité où tracé, splits, dénivelé et effort racontent le mieux une histoire ensemble. Commencer par elle permet de garder un format simple sans effacer ce qui rend chaque sortie personnelle.",
        ],
      },
      {
        heading: "La suite",
        paragraphs: [
          "Le vélo, la musculation, la natation et la randonnée sont prévus. Ils ne sortiront que lorsque leurs replays seront aussi utiles et lisibles que celui de la course.",
        ],
      },
    ],
    backHome: "Découvrir Vivace",
  },
  contact: {
    title: "Contacter Vivace",
    description:
      "Contactez Vivace pour l’assistance produit, les demandes de confidentialité et de données Strava, ou les partenariats.",
    eyebrow: "Contact",
    heading: "Parlez à une personne.",
    lead:
      "Questions, problèmes et demandes de confidentialité arrivent dans la même boîte : hello@vivace.run.",
    sections: [
      {
        heading: "Assistance produit",
        paragraphs: [
          "Expliquez ce qui s’est passé, le navigateur ou l’appareil utilisé, ainsi que la course ou l’écran concerné. N’envoyez jamais de jeton d’accès, de mot de passe ni d’autre secret.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Assistance%20Vivace",
            label: "Contacter l’assistance",
          },
        ],
      },
      {
        heading: "Confidentialité et données",
        paragraphs: [
          "Utilisez l’objet confidentialité pour accéder aux données liées à votre compte Vivace, les corriger ou les supprimer. Nous pouvons devoir vérifier que le compte Strava vous appartient avant d’agir.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Demande%20de%20confidentialite%20Vivace",
            label: "Envoyer une demande de confidentialité",
          },
        ],
      },
      {
        heading: "Partenariats",
        paragraphs: [
          "Pour un club, une course, un coach ou un partenariat produit, ajoutez une courte description et le meilleur moyen de vous joindre.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Partenariat%20Vivace",
            label: "Parler d’un partenariat",
          },
        ],
      },
    ],
    backHome: "Retour à Vivace",
  },
  privacy: {
    title: "Confidentialité | Vivace",
    description:
      "Comment Vivace collecte, utilise, conserve et supprime les données de compte, Strava, vidéo, coach et analytics.",
    eyebrow: "Confidentialité",
    heading: "La confidentialité, sans détour.",
    lead:
      "Vivace utilise vos informations pour afficher vos propres activités, créer vos films et fournir les fonctions que vous choisissez. Nous ne vendons pas vos données personnelles.",
    updated: "Dernière mise à jour : 14 août 2026",
    sections: [
      {
        heading: "Informations reçues",
        paragraphs: [
          "Lorsque vous connectez Strava, Strava nous transmet un identifiant de compte, des informations de profil de base et des jetons OAuth. Les autorisations acceptées peuvent permettre à Vivace de lire vos activités, y compris celles marquées privées, ainsi que les flux GPS, la fréquence cardiaque, le matériel et des informations de profil comme la localisation ou le poids lorsqu’elles sont disponibles.",
          "Vivace reçoit aussi les informations créées dans le produit, comme les choix de rendu, les conversations avec le coach, les objectifs et les plans acceptés. Les journaux techniques consignent requêtes, erreurs et événements de sécurité. Le cookie de langue retient votre choix entre le français et l’anglais.",
        ],
      },
      {
        heading: "Utilisation",
        paragraphs: [
          "Nous utilisons ces informations pour vous connecter, lister vos courses, créer et livrer les replays, répondre aux questions du coach, maintenir le service, prévenir les abus et comprendre si les fonctions marchent.",
          "Nous ne publions ni ne modifions rien sur Strava. Nous utilisons uniquement des autorisations de lecture.",
        ],
      },
      {
        heading: "Conservation et prestataires",
        paragraphs: [
          "Les données de compte et de produit sont conservées dans la base de données de Vivace. Les MP4 sont générés avec Remotion sur AWS et stockés dans S3. Un fichier généré peut être accessible à toute personne possédant son URL publique ; partagez donc cette URL comme vous partageriez la vidéo elle-même.",
          "Le coach utilise le service d’IA de Google pour produire une réponse à partir du contexte nécessaire à votre demande. PostHog peut traiter des analytics produit, des erreurs et des sessions masquées de la landing page lorsque les analytics sont activés. Des prestataires d’hébergement, de base de données et de journalisation traitent les informations nécessaires au fonctionnement du service.",
        ],
      },
      {
        heading: "Durée et choix",
        paragraphs: [
          "Déconnecter Vivace dans Strava révoque les futurs accès à l’API. Pour demander la suppression des données de compte Vivace, des données du coach et des fichiers générés déjà conservés, écrivez-nous. Nous confirmerons la demande puis sa réalisation.",
          "Nous pouvons conserver certains éléments limités pour la sécurité, la prévention de la fraude ou une obligation légale, et les événements techniques des webhooks Strava sont régulièrement purgés. Les autres informations ne sont gardées que le temps nécessaire au but décrit ici ou jusqu’à votre demande de suppression.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Demande%20de%20confidentialite%20Vivace",
            label: "Demander un accès, une correction ou une suppression",
          },
        ],
      },
      {
        heading: "Questions",
        paragraphs: [
          "Écrivez à hello@vivace.run pour toute question de confidentialité. Cette page peut évoluer avec le produit, les prestataires ou les obligations légales ; la date ci-dessus changera en conséquence.",
        ],
      },
    ],
    backHome: "Retour à Vivace",
  },
  terms: {
    title: "Conditions | Vivace",
    description:
      "Les conditions d’utilisation de l’alpha Vivace, de la connexion à Strava et de la création de replays de course à partager.",
    eyebrow: "Conditions",
    heading: "Les conditions de l’alpha Vivace.",
    lead:
      "Ces conditions décrivent le service alpha actuel. En utilisant Vivace, vous acceptez de le faire de manière responsable et uniquement avec des comptes et activités auxquels vous avez le droit d’accéder.",
    updated: "Dernière mise à jour : 14 août 2026",
    sections: [
      {
        heading: "Votre compte",
        paragraphs: [
          "La connexion passe par Strava et vous êtes responsable de la sécurité de ce compte. Ne partagez pas l’accès à Vivace d’une façon qui exposerait les données privées d’un autre athlète.",
        ],
      },
      {
        heading: "Vos données et vos films",
        paragraphs: [
          "Vous conservez vos droits sur vos données d’activité et les films qui en sont issus. Vous autorisez Vivace à les traiter uniquement pour fournir, sécuriser et améliorer le service.",
          "Vous choisissez où partager un film exporté. Ne publiez aucun contenu qui enfreint la vie privée, la propriété intellectuelle ou d’autres droits applicables.",
        ],
      },
      {
        heading: "Utilisation acceptable",
        paragraphs: [
          "N’utilisez pas le service de manière abusive, ne contournez pas les contrôles d’accès, ne surchargez pas l’API ou le rendu, ne tentez pas de reconstituer les parties protégées du service et n’utilisez pas Vivace pour accéder à des données qui ne sont pas les vôtres.",
        ],
      },
      {
        heading: "Disponibilité de l’alpha",
        paragraphs: [
          "Vivace est un produit alpha. Les fonctions, limites et tarifs peuvent changer, et le service peut être interrompu ou retiré. Nous essaierons de protéger le travail existant et d’annoncer les changements importants, sans pouvoir garantir une disponibilité continue.",
        ],
      },
      {
        heading: "Services tiers",
        paragraphs: [
          "Vivace dépend de Strava et d’autres prestataires. Leurs propres conditions régissent l’utilisation de leurs services, et leurs changements ou pannes peuvent affecter le fonctionnement de Vivace.",
        ],
      },
      {
        heading: "Responsabilité et contact",
        paragraphs: [
          "Pendant l’alpha, Vivace est fourni selon sa disponibilité, sans autre garantie que celles que la loi interdit d’exclure. Rien ici ne limite les droits ou responsabilités que la loi applicable ne nous permet pas de limiter.",
        ],
        links: [
          {
            href: "mailto:hello@vivace.run?subject=Conditions%20Vivace",
            label: "Poser une question sur ces conditions",
          },
        ],
      },
    ],
    backHome: "Retour à Vivace",
  },
  stravaData: {
    title: "Utilisation des données Strava | Vivace",
    description:
      "Les autorisations Strava demandées par Vivace, les données d’activité lues et les moyens de se déconnecter ou demander une suppression.",
    eyebrow: "Données Strava",
    heading: "Vos données Strava restent centrées sur vous.",
    lead:
      "Vivace lit les données nécessaires pour afficher votre historique, créer vos films et répondre à vos propres questions d’entraînement. Rien n’est écrit sur votre compte Strava.",
    updated: "Dernière mise à jour : 14 août 2026",
    sections: [
      {
        heading: "Autorisations demandées",
        paragraphs: [
          "Vivace demande les autorisations Strava read, activity:read_all et profile:read_all. Elles peuvent inclure votre profil de base, vos activités privées et publiques, les flux GPS et capteurs, la fréquence cardiaque, le matériel, la localisation et le poids lorsque Strava les fournit.",
        ],
      },
      {
        heading: "Utilisation par Vivace",
        paragraphs: [
          "L’application utilise ces données pour lister vos propres activités, calculer les images du replay, générer les MP4 et fournir du contexte d’entraînement aux fonctions que vous choisissez. Nous ne vendons pas les données Strava, ne publions rien sur Strava et n’exposons pas vos données d’activité brutes aux autres utilisateurs de Vivace.",
        ],
      },
      {
        heading: "Films et partage",
        paragraphs: [
          "Un film est créé pour vous à partir de votre activité. Le MP4 final peut disposer d’une URL publique afin que vous puissiez le télécharger ou le partager. Considérez ce lien comme partageable : toute personne qui le reçoit peut être en mesure d’ouvrir le fichier.",
        ],
      },
      {
        heading: "Déconnexion et suppression",
        paragraphs: [
          "Vous pouvez révoquer Vivace à tout moment dans les réglages des applications connectées de Strava. Cela coupe les futurs accès à l’API Strava. Écrivez-nous séparément pour supprimer les données Vivace et fichiers générés déjà conservés ; nous vérifierons la demande et confirmerons sa réalisation.",
        ],
        links: [
          {
            href: "https://www.strava.com/settings/my-apps",
            label: "Ouvrir les applications connectées Strava",
          },
          {
            href: "mailto:hello@vivace.run?subject=Suppression%20des%20donnees%20Vivace",
            label: "Demander la suppression des données Vivace",
          },
        ],
      },
      {
        heading: "Services indépendants",
        paragraphs: [
          "Vivace n’est pas affilié à Strava, Inc. Les conditions et la politique de confidentialité de Strava continuent de régir votre compte et vos données sur Strava.",
        ],
      },
    ],
    backHome: "Retour à Vivace",
  },
};

const CONTENT_PAGES: Record<Locale, Record<ContentPageKey, ContentPage>> = {
  en,
  fr,
};

export function contentPagePath(locale: Locale, key: ContentPageKey): string {
  return `/${locale}/${CONTENT_PAGE_ROUTES[locale][key]}`;
}

export function contentPagePaths(key: ContentPageKey): Record<Locale, string> {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, contentPagePath(locale, key)]),
  ) as Record<Locale, string>;
}

export function contentPageKey(
  locale: Locale,
  slug: string,
): ContentPageKey | null {
  return (
    CONTENT_PAGE_KEYS.find(
      (key) => CONTENT_PAGE_ROUTES[locale][key] === slug,
    ) ?? null
  );
}

export function getContentPage(
  locale: Locale,
  key: ContentPageKey,
): ContentPage {
  return CONTENT_PAGES[locale][key];
}
