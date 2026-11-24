import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSeenWeatherTour, rememberWeatherTourSeen } from '../weatherTourMemory';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('the Weather tab remembers its welcome dialog', () => {
  it('asks the first time, and not again once it was answered', () => {
    expect(hasSeenWeatherTour()).toBe(false);
    rememberWeatherTourSeen();
    expect(hasSeenWeatherTour()).toBe(true);
  });

  it('asks again, without failing, when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => rememberWeatherTourSeen()).not.toThrow();
    expect(hasSeenWeatherTour()).toBe(false);
  });
});
