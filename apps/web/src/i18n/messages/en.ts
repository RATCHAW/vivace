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
  },

  nav: {
    home: "Vivace home",
    overview: "Overview",
    activities: "Activities",
    coach: "Coach",
    signOut: "Sign out",
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
    watchYourRuns: "Watch your runs",
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
    noRuns: "No runs yet — go log one on Strava and come back.",
    replay: "Replay →",
    fromStrava: "From Strava",
    profileErrorTitle: "Could not load your profile",
    loadingProfile: "Loading your Strava profile",
    factAthleteId: "Athlete ID",
    factUsername: "Username",
    factSex: "Sex",
    factWeight: "Weight",
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

  runs: {
    backToOverview: "Back to overview",
    title: "Your runs",
    syncCount_one: "{{count}} activity · synced from Strava",
    syncCount_other: "{{count}} activities · synced from Strava",
    listLabel: "Runs",
    replayLabel: "Run replay",
    errorTitle: "Could not load your runs",
    noRuns: "No runs yet — go log one on Strava and come back.",
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
        description: "White type on black, cobalt illustration. The house look.",
      },
      cream: {
        label: "Cream",
        description: "Ink on paper. The one that looks like a print, not a screen.",
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
    loadErrorTitle: "Could not load the render state",
    rendering: "Rendering video…",
    progressLabel: "Video render progress",
    downloadVideo: "Download video",
    failedTitle: "Render failed",
    paused: "Video rendering is paused right now. Check back shortly.",
    lastRendered: "Your last video was rendered {{options}}.",
    retry: "Retry render",
    again: "Render again",
    start: "Render video",
    downloadLast: "Download the last video",
    optionTheme: "in {{theme}}",
    optionAvatar: "with your avatar",
    optionDot: "with the plain dot",
    optionOther: "with different options",
  },

  coach: {
    section: "Coach",
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
    grounded: "Grounded in your Strava history · check anything that matters",
    planAccepted: "That’s your week. It’s in the rail now.",
    copy: "Copy",
    copied: "Copied",
    tryAgain: "Try again",
    sources: "From",
    toolFailed: "{{title}} failed: {{error}}",
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
    gapToFind: "{{gap}} to find{{window}}, off {{name}} in {{time}} on {{date}}.",
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
  },

  rail: {
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
