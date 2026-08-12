/** Summary activity as returned by GET https://www.strava.com/api/v3/athlete/activities */
export interface StravaActivity {
  id: number;
  name: string;
  /** Meters */
  distance: number;
  /** Seconds */
  moving_time: number;
  /** Seconds */
  elapsed_time: number;
  /** Meters */
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  /** Meters per second */
  average_speed: number;
  /** Meters per second */
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  map: {
    id: string;
    summary_polyline: string | null;
  } | null;
}

/** One stream from GET /activities/{id}/streams?key_by_type=true */
export interface StravaStream<T> {
  data: T[];
  series_type: "distance" | "time";
  original_size: number;
  resolution: "low" | "medium" | "high";
}

/** The stream set the run video is built from. Every key is optional —
 *  treadmill runs have no latlng, most runs have no heartrate. */
export interface StravaStreamSet {
  /** [latitude, longitude] pairs */
  latlng?: StravaStream<[number, number]>;
  /** Seconds since the start of the activity */
  time?: StravaStream<number>;
  /** Cumulative meters */
  distance?: StravaStream<number>;
  /** Meters above sea level */
  altitude?: StravaStream<number>;
  /** Beats per minute */
  heartrate?: StravaStream<number>;
  /** Smoothed meters per second */
  velocity_smooth?: StravaStream<number>;
}

/** Summary athlete as returned by GET https://www.strava.com/api/v3/athlete */
export interface StravaAthlete {
  id: number;
  username: string | null;
  firstname: string;
  lastname: string;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  sex: "M" | "F" | null;
  premium: boolean;
  summit: boolean;
  created_at: string;
  updated_at: string;
  /** Large profile picture URL */
  profile: string;
  /** Small profile picture URL */
  profile_medium: string;
  weight: number | null;
}
