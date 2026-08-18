/**
 * Every word the app says, in English.
 *
 * This object is the *shape* as well as the content: `fr.ts` is typed against
 * it, so a key added here and forgotten there fails `pnpm typecheck` rather
 * than shipping an English sentence into a French page. Keep it sorted by the
 * screen the string appears on, not alphabetically — a translator reads it top
 * to bottom the way an athlete walks through the app.
 *
 * Interpolation is i18next's `{{name}}`. Counted strings use the `_one` /
 * `_other` suffixes; French resolves `one` for 0 and 1, which is what French
 * wants, so the two catalogues stay the same shape.
 */
export const en = {
  common: {
    loading: "Loading…",
    km: "km",
    perKm: "/km",
    dash: "—",
    close: "Close",
  },

  nav: {
    home: "Vivace home",
    overview: "Overview",
    /** Was "Activities". The landing page sells a *film*, the row action says
     *  "Replay →", and the nav said neither — three words for one thing, and
     *  the one in the navigation was the vaguest of them. */
    replays: "Replays",
    coach: "Coach",
    account: "Account",
    help: "Help",
    signOut: "Sign out",
    menu: "Menu",
  },

  /** The links out of the app, to the marketing site. */
  footer: {
    about: "About",
    privacy: "Privacy",
    terms: "Terms",
    stravaData: "Your Strava data",
    contact: "Contact",
    poweredByStrava: "Powered by Strava",
  },

  notFound: {
    eyebrow: "404",
    title: "There's nothing at this address.",
    body: "The link may be out of date, or the address may have a typo in it. Everything Vivace has is behind one of these.",
  },

  theme: {
    switchToLight: "Switch to light theme",
    switchToDark: "Switch to dark theme",
  },

  language: {
    label: "Language",
    change: "Change language",
  },

  soon: "Soon",

  login: {
    titleLine1: "Every run,",
    titleLine2: "a story.",
    body: "Your Strava activities, replayed as a vertical film you can watch and share. Nothing to log, nothing to set up.",
    continueWithStrava: "Continue with Strava",
    footnote: "Strava is the only way in. We never post on your behalf.",
    failedTitle: "Sign-in failed",
    failedFallback: "Sign-in failed",
    runsToday: "Runs today",
    moreSoon: "Rides, lifts & swims soon",
    plateLabel: "9:16 replay",
    plateCaption: "Evening Run · 5 Aug 2026",
  },

  home: {
    connectedToStrava: "Connected to Strava",
    connectedToStravaIn: "Connected to Strava · {{location}}",
    /** The button, the nav pill and the page it opens all say "replays" now —
     *  it used to say "runs" while landing on a screen headed "Your runs" that
     *  the navigation called "Activities". */
    watchYourRuns: "Watch your replays",
    seasonTotals: "{{year}} totals",
    seasonTotalsFallback: "Season totals",
    statDistance: "Distance · {{year}}",
    statRuns: "Runs",
    statMovingTime: "Moving time",
    statAvgPace: "Avg pace",
    truncated: "Totals cover the {{count}} most recent runs Strava returns.",
    latestActivities: "Latest activities",
    seeAll: "See all →",
    runsErrorTitle: "Could not load your runs",
    replay: "Replay →",

    /** The Coach card — the only inbound link to the coach from the Overview,
     *  and for a first-time athlete the only sign the coach is there at all. */
    coachEyebrow: "AI coach",
    coachTitle: "Your training, read back to you",
    coachBody:
      "It has already read your last few weeks — volume, splits, heart rate. Ask it how the block is going, or what to run this week.",
    coachBodyRace: "Every answer is planned around this date. Ask it anything.",
    coachStart: "Talk to your coach",
    coachOpen: "Open the coach",

    /** An empty history is a first day, not a failure. */
    emptyTitle: "Nothing synced from Strava yet",
    emptyBody:
      "Your runs appear here within a minute of finishing one on Strava — there is nothing to import. The coach already works without them.",
    emptyOpenStrava: "Open Strava",
    emptyAskCoach: "Talk to your coach",

    fromStrava: "From Strava",
    profileErrorTitle: "Could not load your profile",
    loadingProfile: "Loading your Strava profile",
    factUsername: "Username",
    factSubscription: "Subscription",
    factMemberSince: "Member since",
    stravaSubscriber: "Strava subscriber",
    freePlan: "Free plan",
    moreSports: "More sports",
    moreSportsBody:
      "Replays are built for runs first. The same film treatment lands for these next.",
  },

  /** Sport names, shared by the Overview chips and the Activities filter row. */
  sports: {
    run: "Run",
    runs: "Runs",
    ride: "Ride",
    rides: "Rides",
    weights: "Weights",
    swim: "Swim",
    hike: "Hike",
  },

  replays: {
    backToOverview: "Back to overview",
    backToList: "Back to all runs",
    title: "Your replays",
    syncCount_one: "{{count}} activity · synced from Strava",
    syncCount_other: "{{count}} activities · synced from Strava",
    listLabel: "Runs",
    replayLabel: "Run replay",
    errorTitle: "Could not load your runs",
    emptyTitle: "No replays yet",
    emptyBody:
      "A replay is made from a run, so the first one arrives with your next activity on Strava.",
    loadRunError: "Could not load this run",
    loadingReplay: "Loading run replay…",
    noMapboxToken:
      "No Mapbox token configured — the replay draws the route on a plain canvas. Set <code>VITE_MAPBOX_TOKEN</code> in <code>apps/web/.env</code> to get the full map.",
  },

  player: {
    play: "Play replay",
    pause: "Pause replay",
    seek: "Seek",
    enterTheatre: "Enter theatre mode",
    leaveTheatre: "Leave theatre mode",
    askCoach: "Ask the coach",
    share: "Share",
    linkCopied: "Link copied",
    linkCopiedBody: "Anyone signed in can open this run.",
    shareFailed: "Could not share this run",
  },

  videoOptions: {
    section: "Video options",
    themeGroup: "Video theme",
    templateSelect: "Video template",
    runAsAvatar: "Run as your avatar",
    avatarReady: "Your Strava photo leads the route instead of the dot.",
    avatarPending: "Checking your Strava profile…",
    avatarFailed: "Your Strava profile could not be read.",
    avatarMissing: "Add a photo on Strava to use this.",
    greenscreen: "Green screen",
    greenscreenHint:
      "Renders the background in key green, so you can cut it out and put your own video behind the run.",
    /** A template whose background is a basemap trades it for the plate, and
     *  the athlete should read that before they throw the switch. */
    greenscreenMap:
      "Drops the map for key green, so you can cut it out and run the route over your own video.",
  },

  /**
   * The catalogue in `@repo/video`, in the athlete's language.
   *
   * The package stays the source of truth for what exists and for the English
   * fallback — it is React-free and also runs on Lambda, where none of this is
   * loaded. These are looked up by id, so a template added to the catalogue
   * without an entry here still renders, in English.
   */
  video: {
    template: {
      "run-video": {
        label: "Route replay",
        description:
          "The route drawing under live metrics, camera following the runner. One shot, 9:16.",
      },
      "split-rush": {
        label: "Split rush",
        description:
          "Every kilometre as a bar, the fastest one isolated, one verdict to close. No GPS anywhere in it — a treadmill run gets the same film as a park one.",
      },
      "living-poster": {
        label: "Route poster",
        description:
          "The route drawn on a bare plate, north up, then held still. The last two and a half seconds are a frame you could print.",
      },
      "minimal-numbers": {
        label: "Minimal numbers",
        description:
          "One number at a time, filling the screen. Needs nothing but a distance and a time, so it renders for every run there is.",
      },
    },
    theme: {
      charcoal: {
        label: "Charcoal",
        description:
          "White type on black, cobalt illustration. The house look.",
      },
      cream: {
        label: "Cream",
        description:
          "Ink on paper. The one that looks like a print, not a screen.",
      },
      accent: {
        label: "Cobalt",
        description: "The numbers in brand cobalt on black. The loud one.",
      },
    },
    eligibility: {
      "needs-route": "Needs a GPS route — this run has none",
      "needs-two-km": "Needs at least 2 km",
      "needs-distance-time": "Needs distance and time from the watch",
    },
  },

  render: {
    loadErrorTitle: "Could not load the video state",
    preparing: "Preparing your video…",
    /** The phone's compact Download tile uses this as its accessible name. */
    preparingPercent: "Preparing your video… {{percent}}%",
    progressLabel: "Video preparation progress",
    downloadVideo: "Download video",
    failedTitle: "Could not prepare this video",
    paused: "Video downloads are paused right now. Check back shortly.",
    retry: "Try again",
  },

  coach: {
    section: "Coach",
    rangeSelect: "How far back the coach reads",
    range6: "Last 6 weeks",
    range12: "Last 12 weeks",
    rangeSeason: "This season",
    reading_one: "Reading {{count}} run · {{range}}",
    reading_other: "Reading {{count}} runs · {{range}}",
    newConversation: "New conversation",
    openError: "Could not open this conversation",
    loadingConversation: "Loading your conversation…",
    briefingError: "Could not read your training",

    emptyTitle: "What are we training for?",
    emptyBody:
      "Ask for a plan, a taper, or an honest read on last week. I can see every run you’ve synced from Strava.",
    errorTitle: "The coach could not answer",
    /**
     * One line per `CoachFailure` the API can send. What the athlete can do
     * about it, never what broke — the provider's own message is a note to
     * whoever holds the API key, and it stays in the server's log.
     */
    errors: {
      notConfigured: "The coach isn’t available in this app right now.",
      rateLimited:
        "The coach is answering a lot of questions right now. Give it a minute and ask again.",
      unavailable:
        "The coach can’t be reached at the moment. Try again shortly.",
      failed: "Something went wrong writing that answer. Try asking again.",
    },
    planAccepted: "That’s your week. It’s in the rail now.",
    copy: "Copy",
    copied: "Copied",
    tryAgain: "Try again",
    edit: "Edit",
    /** The box that replaces the bubble — named for a screen reader, since the
     *  message it opens with is the only label a sighted athlete needs. */
    editLabel: "Edit your message",
    editCancel: "Cancel",
    editSend: "Ask again",
    helpful: "Helpful",
    notHelpful: "Not helpful",
    feedbackPlaceholder: "What was wrong with it? (optional)",
    feedbackSend: "Send",
    feedbackThanks: "Thanks — that helps.",
    sources: "From",
    /** The row that stands in for a finished turn's working — see coach-steps.tsx. */
    steps_one: "{{count}} step",
    steps_other: "{{count}} steps",
    toolFailed: "{{title}} failed",
    workingReading: "Reading your Strava history",
    workingWriting: "Writing",

    /** Openers for a thread with nothing in it yet. */
    suggestions: {
      month: "How has my training looked over the last month?",
      planWeek: "Plan my week",
      easyTooFast: "Are my easy runs too fast?",
      readLongRunSplits: "Read my last long run split by split",
    },
    /** Where a conversation goes next, given what the coach just drew. */
    followUps: {
      readSplitBySplit: "Read it split by split",
      rampingTooFast: "Am I ramping too fast?",
      whyFade: "Why did I fade?",
      raceToday: "What could I race today?",
      capNextWeek: "Cap next week",
      raceShape: "Am I in race shape?",
      missWednesday: "What if I miss Wednesday?",
      volumeRamp: "Show me my volume ramp",
      writeTaper: "Write my taper",
      paceSunday: "What pace for Sunday?",
      readLongRun: "Read my last long run",
    },
    /** What the coach is doing while it is doing it. */
    tools: {
      getAthleteProfile: "Reading your profile",
      getAthleteContext: "Checking what you’re training for",
      setAthleteContext: "Remembering that",
      listRuns: "Reading your recent runs",
      summariseTraining: "Adding up your weeks",
      getRunDebrief: "Reading that run",
      getRunSplits: "Reading it split by split",
      getTrainingSignals: "Measuring your training",
      predictRaces: "Reading your best efforts",
      proposeWeek: "Writing your week",
      askAthlete: "Asking you something",
    },
  },

  threads: {
    newConversation: "New conversation",
    empty: "Nothing yet. Ask the coach something and it will show up here.",
    listLabel: "Conversations",
    today: "Today",
    delete: "Delete {{title}}",
    untitled: "conversation",
  },

  composer: {
    placeholder: "Ask about a run, or / for commands",
    attachRun: "Attach a run",
    runShort: "Run",
    attachFile: "Attach a file",
    removeAttached: "Remove the attached run",
    noRunsSynced: "No runs synced from Strava yet.",
    commands: {
      week: { name: "/week", desc: "Write the next seven days" },
      review: { name: "/review", desc: "Read my last long run split by split" },
      race: { name: "/race", desc: "Predict my races from best efforts" },
      load: { name: "/load", desc: "Check my volume ramp and load ratio" },
      goal: { name: "/goal", desc: "Set or change the goal race" },
    },
  },

  cards: {
    watchReplay: "Watch the replay",
    readSplitBySplit: "Read it split by split",
    askReadSplits: "Read this run split by split",
    noRouteLine1: "No",
    noRouteLine2: "route",
    pace: "Pace",
    hr: "HR",
    kmFirst: "Km 1",
    kmLast: "Km {{n}}",
    fadeSlower: "The back half ran {{seconds}} s/km slower than the front.",
    negativeSplit:
      "A negative split — the back half ran {{seconds}} s/km quicker.",
    evenPacing: "Even pacing front to back.",
    decoupling: " Aerobic decoupling of {{pct}}%",
    decouplingHigh: " — heart rate kept climbing to hold that pace.",
    decouplingOk: ", which is a well-held aerobic effort.",
    splitTooltip: "Km {{km}} · {{pace}} /km",
    splitTooltipHr: "Km {{km}} · {{pace}} /km · {{bpm}} bpm",

    weeklyVolume: "Weekly volume · {{count}} weeks",
    safeRamp: "Safe ramp · under {{limit}}% / week",
    loadRatio:
      "Acute:chronic load is {{ratio}} — {{acute}} km this week against a {{chronic}} km four-week average.",
    notEnoughHistory: "Not enough history yet for a load ratio.",
    weekJumped: " The week of {{week}} jumped {{pct}}%.",

    racePrediction: "Race prediction",
    fromBestEfforts: "From Strava best efforts",
    pr: "PR · {{date}}",
    headlineToday: "{{name}}, today",
    yourTarget: "Your target",
    goalPace: "Goal pace",
    gapToFind:
      "{{gap}} to find{{window}}, off {{name}} in {{time}} on {{date}}.",
    gapWindow_one: " in {{count}} week",
    gapWindow_other: " in {{count}} weeks",
    aheadOfTarget: "You are {{gap}} ahead of target already.",
    riegel: "Riegel from your best effort, not a guess.",
    setGoalRace: "Set a goal race",
    askGoalRace: "I’m training for a race — let me tell you about it",
    gapSeconds_one: "{{count}} second",
    gapSeconds_other: "{{count}} seconds",

    weekOf: "Week of {{week}}",
    weekTotals: "{{km}} km · {{quality}} key",
    accepted: "Accepted · in your week",
    acceptWeek: "Accept this week",
    swapDay: "Swap {{day}}",
    askSwapDay: "Swap {{day}} for something else",
    longRunTo: "Long run → {{day}}",
    askMoveLongRun: "Move the long run to {{day}}",

    /**
     * The form the coach asks with, which stands where the composer usually
     * does. Everything here is the chrome around the questions — the questions
     * themselves are written by the model, in the language this app is being
     * read in (see `coachSystemPrompt`).
     *
     * `questionnaireAnswers` is the first line of the message that carries the
     * answers to the coach, which is why it reads as something the athlete
     * would say rather than as a label.
     */
    questionnaire: "Questions",
    questionnaireStep: "{{current}} of {{total}}",
    questionnairePrevious: "Back",
    questionnaireSkip: "Skip",
    questionnaireNext: "Next",
    questionnaireSend: "Send",
    /** The free-text box under every choice question — the answer the coach
     *  didn't think to offer. Its own words, never the model's. */
    questionnaireOther: "Something else…",
    questionnaireAnswerOrSkip: "Answer this one, or skip it.",
    questionnaireAwaiting: "Awaiting your answer",
    questionnaireAnswered: "Answered",
    questionnaireAnswers: "Here are my answers:",
    questionnaireSkipped: "skipped",
  },

  rail: {
    title: "Goals & signals",
    goalRace: "Goal race",
    goalRaceEmpty:
      "The coach plans around a date. Tell it what you’re training for once and every thread starts knowing.",
    change: "Change",
    askChangeGoal: "I want to change my goal race",
    setGoalRace: "Set a goal race",
    askGoalRace: "I’m training for a race — let me tell you about it",
    noDate: "No date yet",
    toGo: "To go",
    target: "Target",
    longDay: "Long day",
    weeks: "{{count}} wk",
    remembers:
      "The coach remembers this in every thread — you never re-explain what you’re training for.",
    thisWeek: "This week",
    noWeek:
      "No week accepted yet. Ask for one and it lands here as sessions, not a paragraph.",
    planMyWeek: "Plan my week",
    weekProgress: "{{actual}} of {{planned}} km · ",
    weekComplete: "week complete",
    sessionsLeft_one: "{{count}} session left",
    sessionsLeft_other: "{{count}} sessions left",
    dayTooltip: "{{day}} · {{type}} · {{actual}} of {{planned}} km",
    signals: "Signals",
    tapSignal: "Tap a signal to ask about it.",
    queue: "Coach queue",
  },

  /** Weekday names. `short` stamps a chart, `long` names a session in a sentence. */
  days: {
    short: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    initial: ["M", "T", "W", "T", "F", "S", "S"],
    long: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
  },

  /** The vendored AI-elements primitives, which ship their own English. */
  ai: {
    thinking: "Thinking…",
    thoughtFor: "Thought for {{count}} seconds",
    thoughtBriefly: "Thought for a few seconds",
    send: "Send",
    stop: "Stop",
    addAttachments: "Add photos or files",
    uploadFiles: "Upload files",
    removeAttachment: "Remove",
    noAttachments: "No attachments",
    filesTooLarge: "All files exceed the maximum size.",
    tooManyFiles: "Too many files. Some were not added.",
    filesNotAccepted: "No files match the accepted types.",
  },

  errorBoundary: {
    title: "Something went wrong",
    body: "The page stopped working. We’ve logged what happened — reloading usually gets you moving again.",
    reload: "Reload the app",
  },
} as const;

export type Messages = typeof en;

/**
 * The English catalogue's *shape*, with its literal values widened back to
 * `string`. A translation has to answer every key — that is the point — but it
 * obviously may not answer them with the English words, which is what a bare
 * `Messages` would demand of it.
 */
export type Translated<T> = {
  [K in keyof T]: T[K] extends readonly string[]
    ? readonly string[]
    : T[K] extends string
      ? string
      : Translated<T[K]>;
};
