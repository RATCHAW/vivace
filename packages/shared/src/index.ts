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
