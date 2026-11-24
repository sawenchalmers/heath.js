// The Weather tab's welcome dialog asks once: whether the tour was started or skipped is remembered
// in this browser (until Heath has per-user settings, #5/#56). Its Guide button reopens the tour.

const WEATHER_TOUR_SEEN_KEY = 'heath.weatherTourSeen';

/** Whether this browser has already answered the Weather tab's welcome dialog. */
export const hasSeenWeatherTour = (): boolean => {
  try {
    return localStorage.getItem(WEATHER_TOUR_SEEN_KEY) === 'yes';
  } catch {
    return false; // storage blocked (e.g. a private window): ask again, as before
  }
};

/** Remember that the welcome dialog was answered, so it doesn't come back. */
export const rememberWeatherTourSeen = (): void => {
  try {
    localStorage.setItem(WEATHER_TOUR_SEEN_KEY, 'yes');
  } catch {
    // storage blocked: the dialog simply comes back next time
  }
};
