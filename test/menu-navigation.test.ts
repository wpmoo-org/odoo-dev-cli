import { describe, expect, it } from 'vitest';

import { handlePromptCancel, isMenuBackSignal, MenuBackSignal } from '../src/menu-navigation.js';

describe('menu navigation', () => {
  it('turns menu prompt cancellation into a back-navigation signal', () => {
    expect(() => handlePromptCancel(true, 'back')).toThrow(MenuBackSignal);

    try {
      handlePromptCancel(true, 'back');
    } catch (error) {
      expect(isMenuBackSignal(error)).toBe(true);
    }
  });

  it('ignores submitted prompt values', () => {
    expect(() => handlePromptCancel(false, 'back')).not.toThrow();
  });
});
