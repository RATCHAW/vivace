/**
 * The activity shape the compositions read.
 *
 * Deliberately declared here rather than imported: this package is consumed by
 * apps/api (where `Run` is a Zod infer) and by apps/web (where it is generated
 * from the OpenAPI document), and it is bundled a third time by Remotion Lambda
 * where neither exists. Both of those `Run` types are structurally assignable to
 * this one, so both sides pass their own without a cast — and a field the video
 * needs can't be dropped from the API contract without failing a typecheck here.
 */
export interface VideoActivity {
  id: number;
  name: string;
  /** Meters. */
  distance: number;
  /** Seconds. */
  moving_time: number;
  /** Meters. */
  total_elevation_gain: number;
  sport_type: string;
  /** The athlete's wall clock at the start (ISO, Z-suffixed by Strava). */
  start_date_local: string;
  /** Meters per second. */
  average_speed: number;
  /** Beats per minute, or null when recorded without a heart-rate monitor. */
  average_heartrate: number | null;
  max_heartrate: number | null;
  workout_type: string;
}

/**
 * The other runner, when a film has one.
 *
 * There is no social graph behind this and no second athlete on the props: one
 * invitation, answered, is what puts a partner here — see `run_invite` in
 * apps/api. Their run travels with them because it has to: a second runner's
 * pace is only readable with that runner's own Strava token, so by the time a
 * composition is handed this, consent has already been given and spent.
 */
export interface VideoPartner {
  /** First name, as Strava spells it. A label on a bar, not a profile. */
  name: string;
  activity: VideoActivity;
  streams: VideoStreams;
  /** Their Strava picture when the avatar option is on, else "" for the dot. */
  avatarUrl: string;
}

interface NumberStream {
  data: number[];
}

/** The streams a composition may draw from. Every key is optional — treadmill
 *  runs have no latlng, most runs have no heartrate. */
export interface VideoStreams {
  /** [latitude, longitude] pairs. */
  latlng?: { data: number[][] };
  /** Seconds since the start of the activity. */
  time?: NumberStream;
  /** Cumulative meters. */
  distance?: NumberStream;
  /** Meters above sea level. */
  altitude?: NumberStream;
  /** Beats per minute. */
  heartrate?: NumberStream;
  /** Smoothed meters per second. */
  velocity_smooth?: NumberStream;
}
